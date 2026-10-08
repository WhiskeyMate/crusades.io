// The crusades.io game server: lobbies and a turn relay.
//
// It never runs the simulation. Ten times a second it bundles the intents
// players sent into a numbered turn and broadcasts it; every browser feeds
// the same turns to its own engine. It also keeps each game's turns so a
// player who drops can come back and replay to the present.
//
//   node server/dist/server.mjs            (after npm run build:server)
//   PORT=8765  HOST=127.0.0.1              environment, both optional
//
// Put Caddy (or any TLS proxy) in front: browsers on an https site will
// only open wss:// connections. See docs/SERVER.md.

import { createServer, IncomingMessage } from "node:http";
import { randomBytes } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
} from "@crusades/engine-api/game/GameTypes";
import { GameStartInfo, StampedIntent, Turn } from "@crusades/engine-api/Schemas";
import {
  ClientMessage,
  ClientMessageSchema,
  LOBBY_CODE,
  LobbyConfig,
  LobbyView,
  PROTOCOL_VERSION,
  PublicGame,
  ServerMessage,
  TURN_MS,
} from "../../src/net/Protocol";
import { generateRealm, Realm } from "../../src/worldgen/RealmGen";
import { realmHash } from "../../src/worldgen/RealmHash";

const PORT = Number(process.env.PORT ?? 8765);
const HOST = process.env.HOST ?? "0.0.0.0";
/** A game with nobody connected is closed after this long. */
const ABANDON_MS = 2 * 60_000;
/** No game runs longer than this. */
const MAX_GAME_MS = 4 * 60 * 60_000;
/** Intents one player may send per turn. */
const INTENTS_PER_TURN = 40;
const MAX_LOBBIES = 200;
/** How long a public game gathers players before it starts. */
const PUBLIC_WAIT_MS = Number(process.env.PUBLIC_WAIT_SECONDS ?? 90) * 1000;
/** A public game starts as soon as this many have joined. */
const PUBLIC_FULL = 40;
const PUBLIC_REALMS = [
  GameMapType.Aldermark,
  GameMapType.TwinCrowns,
  GameMapType.SunderedIsles,
  GameMapType.Middenmere,
];
let publicRotation = 0;

const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomID(len: number, alphabet = ID_ALPHABET): string {
  const bytes = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

interface Client {
  ws: WebSocket;
  clientID: string;
  secret: string;
  name: string;
  lobby: Lobby | null;
  intentsThisTurn: number;
  alive: boolean;
  greeted: boolean;
}

interface Member {
  clientID: string;
  secret: string;
  name: string;
  client: Client | null;
}

class Lobby {
  readonly code: string;
  readonly kind: LobbyView["kind"];
  /** Public games only: when the timer fires. */
  startsAt = 0;
  owner: string;
  config: LobbyConfig;
  members = new Map<string, Member>();
  status: LobbyView["status"] = "open";
  private info: GameStartInfo | null = null;
  private realm: Realm | null = null;
  private hash = "";
  private turns: Turn[] = [];
  private pending: StampedIntent[] = [];
  private clock: NodeJS.Timeout | null = null;
  private startedAt = 0;
  private emptySince: number | null = null;
  /** First reported engine hash per tick, to catch a client that diverged. */
  private hashes = new Map<number, { hash: number; by: string }>();

  constructor(owner: Client | null, config: LobbyConfig) {
    this.code = randomID(6, CODE_ALPHABET);
    this.kind = owner ? "private" : "public";
    this.owner = owner?.clientID ?? "";
    this.config = config;
    if (!owner) this.startsAt = Date.now() + PUBLIC_WAIT_MS;
  }

  summary(): PublicGame {
    return {
      code: this.code,
      config: this.config,
      players: this.members.size,
      startsAt: this.startsAt,
    };
  }

  view(): LobbyView {
    return {
      code: this.code,
      kind: this.kind,
      ...(this.kind === "public" ? { startsAt: this.startsAt } : {}),
      owner: this.owner,
      config: this.config,
      status: this.status,
      members: [...this.members.values()].map((m) => ({
        clientID: m.clientID,
        name: m.name,
        connected: m.client !== null,
      })),
    };
  }

  broadcast(msg: ServerMessage) {
    const text = JSON.stringify(msg);
    for (const m of this.members.values()) {
      if (m.client && m.client.ws.readyState === WebSocket.OPEN) m.client.ws.send(text);
    }
  }

  add(client: Client) {
    this.members.set(client.clientID, {
      clientID: client.clientID,
      secret: client.secret,
      name: client.name,
      client,
    });
    client.lobby = this;
    this.emptySince = null;
    this.broadcast({ type: "lobby", lobby: this.view() });
    if (this.kind === "public") {
      if (this.members.size >= PUBLIC_FULL) this.start();
      else broadcastHall();
    }
  }

  /** A member's connection went away. */
  drop(client: Client) {
    const m = this.members.get(client.clientID);
    if (!m) return;
    m.client = null;
    client.lobby = null;
    if (this.status === "open") {
      this.members.delete(client.clientID);
      if (this.kind === "public") {
        this.broadcast({ type: "lobby", lobby: this.view() });
        broadcastHall();
        return;
      }
      if (this.members.size === 0) {
        lobbies.delete(this.code);
        return;
      }
      if (this.owner === client.clientID) this.owner = this.members.keys().next().value!;
    } else if (this.status === "running") {
      // The realm stays on the map but is marked absent, which the engine
      // uses to spare it for a while.
      this.pending.push({ type: "mark_disconnected", isDisconnected: true, clientID: client.clientID });
    }
    if ([...this.members.values()].every((x) => x.client === null)) this.emptySince = Date.now();
    this.broadcast({ type: "lobby", lobby: this.view() });
  }

  /** A member came back on a new connection. */
  resume(client: Client, m: Member) {
    m.client = client;
    client.lobby = this;
    client.name = m.name;
    this.emptySince = null;
    send(client, { type: "lobby", lobby: this.view() });
    if (this.status === "running" && this.info) {
      this.pending.push({ type: "mark_disconnected", isDisconnected: false, clientID: client.clientID });
      send(client, { type: "start", info: this.info, realmHash: this.hash, turns: this.turns });
    }
    this.broadcast({ type: "lobby", lobby: this.view() });
  }

  start() {
    if (this.status !== "open") return;
    this.status = "running";
    this.startedAt = Date.now();
    const c = this.config;
    this.info = {
      gameID: randomID(8),
      lobbyCreatedAt: this.startedAt,
      config: {
        gameMap: c.map,
        difficulty: c.difficulty,
        donateGold: true,
        donateTroops: true,
        gameType: GameType.Private,
        gameMode: GameMode.FFA,
        gameMapSize: GameMapSize.Normal,
        nations: c.kingdoms > 0 ? "default" : "disabled",
        bots: c.clans,
        infiniteGold: false,
        infiniteTroops: false,
        instantBuild: false,
        randomSpawn: false,
      },
      players: [...this.members.values()].map((m) => ({
        clientID: m.clientID,
        username: m.name,
        clanTag: null,
      })),
    };
    this.realm = generateRealm({ map: c.map, seed: c.seed, kingdoms: c.kingdoms });
    this.hash = realmHash(this.realm);
    log(`lobby ${this.code}: started, ${this.members.size} players, realm ${c.map}/${c.seed} ${this.hash}`);
    this.broadcast({ type: "lobby", lobby: this.view() });
    this.broadcast({ type: "start", info: this.info, realmHash: this.hash, turns: [] });
    this.clock = setInterval(() => this.tick(), TURN_MS);
    if (this.kind === "public") {
      ensurePublicGame();
      broadcastHall();
    }
  }

  private tick() {
    const now = Date.now();
    if (
      (this.emptySince !== null && now - this.emptySince > ABANDON_MS) ||
      now - this.startedAt > MAX_GAME_MS
    ) {
      this.end();
      return;
    }
    const turn: Turn = { turnNumber: this.turns.length, intents: this.pending };
    this.pending = [];
    this.turns.push(turn);
    for (const m of this.members.values()) if (m.client) m.client.intentsThisTurn = 0;
    this.broadcast({ type: "turn", turn });
  }

  intent(client: Client, intent: ClientMessage & { type: "intent" }) {
    if (this.status !== "running") return;
    if (++client.intentsThisTurn > INTENTS_PER_TURN) return;
    // Identity comes from the connection, never from the message.
    this.pending.push({ ...intent.intent, clientID: client.clientID } as StampedIntent);
  }

  reportHash(client: Client, tick: number, hash: number) {
    if (this.status !== "running") return;
    const first = this.hashes.get(tick);
    if (!first) {
      this.hashes.set(tick, { hash, by: client.clientID });
      // Keep a bounded window.
      if (this.hashes.size > 400) {
        const oldest = Math.min(...this.hashes.keys());
        this.hashes.delete(oldest);
      }
    } else if (first.hash !== hash) {
      log(`lobby ${this.code}: desync at tick ${tick} between ${first.by} and ${client.clientID}`);
      send(client, { type: "desync", tick });
    }
  }

  sendRealm(client: Client) {
    if (!this.realm) return;
    const f = this.realm.files;
    send(client, {
      type: "realm",
      manifest: f.manifest,
      mapBin: Buffer.from(f.mapBin!).toString("base64"),
      map4xBin: Buffer.from(f.map4xBin!).toString("base64"),
    });
  }

  end() {
    if (this.status === "ended") return;
    this.status = "ended";
    if (this.clock) clearInterval(this.clock);
    log(`lobby ${this.code}: ended after ${this.turns.length} turns`);
    this.broadcast({ type: "ended" });
    for (const m of this.members.values()) if (m.client) m.client.lobby = null;
    lobbies.delete(this.code);
  }
}

const lobbies = new Map<string, Lobby>();
const clients = new Set<Client>();

function openPublicGames(): Lobby[] {
  return [...lobbies.values()].filter((l) => l.kind === "public" && l.status === "open");
}

/** There is always one public game gathering players. */
function ensurePublicGame() {
  if (openPublicGames().length > 0) return;
  const map = PUBLIC_REALMS[publicRotation++ % PUBLIC_REALMS.length];
  const lobby = new Lobby(null, {
    map,
    seed: 1 + Math.floor(Math.random() * 999_999),
    difficulty: Difficulty.Medium,
    kingdoms: 12,
    clans: 100,
    maxPlayers: PUBLIC_FULL,
  });
  lobbies.set(lobby.code, lobby);
  log(`public game ${lobby.code}: open, ${map}, starts in ${PUBLIC_WAIT_MS / 1000}s`);
}

function hallMessage(): ServerMessage {
  return {
    type: "lobbies",
    games: openPublicGames().map((l) => l.summary()),
    running: [...lobbies.values()].filter((l) => l.status === "running").length,
    online: clients.size,
  };
}

/** Everyone who can see the list of games: in the hall or waiting in a lobby. */
function broadcastHall() {
  const text = JSON.stringify(hallMessage());
  for (const c of clients) {
    if ((c.lobby === null || c.lobby.status === "open") && c.ws.readyState === WebSocket.OPEN) c.ws.send(text);
  }
}

// The public game's timer. With nobody in it the clock just keeps resetting.
setInterval(() => {
  const now = Date.now();
  for (const l of openPublicGames()) {
    if (now < l.startsAt) continue;
    if (l.members.size > 0) l.start();
    else {
      l.startsAt = now + PUBLIC_WAIT_MS;
      broadcastHall();
    }
  }
}, 1000);

function log(s: string) {
  console.log(`${new Date().toISOString()} ${s}`);
}

function send(client: Client, msg: ServerMessage) {
  if (client.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(msg));
}

function fail(client: Client, message: string) {
  send(client, { type: "error", message });
}

/** Where a member with this id and secret is still expected. */
function findSeat(clientID: string, secret: string): { lobby: Lobby; member: Member } | null {
  for (const lobby of lobbies.values()) {
    const m = lobby.members.get(clientID);
    if (m && m.secret === secret && m.client === null) return { lobby, member: m };
  }
  return null;
}

function handle(client: Client, msg: ClientMessage) {
  switch (msg.type) {
    case "hello": {
      client.greeted = true;
      client.name = msg.name ?? "";
      const seat = msg.resume ? findSeat(msg.resume.clientID, msg.resume.secret) : null;
      if (seat) {
        client.clientID = seat.member.clientID;
        client.secret = seat.member.secret;
        send(client, { type: "welcome", clientID: client.clientID, secret: client.secret, version: PROTOCOL_VERSION });
        log(`lobby ${seat.lobby.code}: ${client.name} took seat ${client.clientID} back`);
        seat.lobby.resume(client, seat.member);
      } else {
        send(client, { type: "welcome", clientID: client.clientID, secret: client.secret, version: PROTOCOL_VERSION });
        send(client, hallMessage());
      }
      break;
    }
    case "name":
      client.name = msg.name;
      break;
    case "list":
      send(client, hallMessage());
      break;
    case "create": {
      if (client.name === "") return fail(client, "Choose a house name first.");
      if (client.lobby) return fail(client, "Leave your current game first.");
      if (lobbies.size >= MAX_LOBBIES) return fail(client, "The server is full. Try again shortly.");
      const lobby = new Lobby(client, msg.config);
      lobbies.set(lobby.code, lobby);
      lobby.add(client);
      log(`lobby ${lobby.code}: created by ${client.name}`);
      break;
    }
    case "join": {
      if (client.name === "") return fail(client, "Choose a house name first.");
      if (client.lobby) return fail(client, "Leave your current game first.");
      const lobby = lobbies.get(msg.lobby);
      if (!lobby) return fail(client, "No game with that code.");
      if (lobby.status !== "open") return fail(client, "That game has already started.");
      if (lobby.members.size >= lobby.config.maxPlayers) return fail(client, "That game is full.");
      lobby.add(client);
      break;
    }
    case "leave":
      if (client.lobby) {
        const l = client.lobby;
        l.drop(client);
        send(client, { type: "left" });
        send(client, hallMessage());
      }
      break;
    case "configure": {
      const l = client.lobby;
      if (!l || l.owner !== client.clientID || l.status !== "open") return;
      l.config = msg.config;
      l.broadcast({ type: "lobby", lobby: l.view() });
      break;
    }
    case "start": {
      const l = client.lobby;
      if (!l || l.kind === "public" || l.owner !== client.clientID) return fail(client, "Only the host can start.");
      l.start();
      break;
    }
    case "intent":
      client.lobby?.intent(client, msg);
      break;
    case "hash":
      client.lobby?.reportHash(client, msg.tick, msg.hash);
      break;
    case "realm":
      client.lobby?.sendRealm(client);
      break;
    case "ping":
      send(client, { type: "pong", t: msg.t });
      break;
  }
}

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        version: PROTOCOL_VERSION,
        clients: clients.size,
        lobbies: lobbies.size,
        running: [...lobbies.values()].filter((l) => l.status === "running").length,
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: http, maxPayload: 64 * 1024 });

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const client: Client = {
    ws,
    clientID: randomID(8),
    secret: randomID(32),
    name: "",
    lobby: null,
    intentsThisTurn: 0,
    alive: true,
    greeted: false,
  };
  clients.add(client);
  const from = req.headers["x-forwarded-for"] ?? req.socket.remoteAddress;
  log(`connect ${client.clientID} from ${from} (${clients.size} online)`);

  ws.on("message", (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return fail(client, "Not JSON.");
    }
    const r = ClientMessageSchema.safeParse(parsed);
    if (!r.success) return fail(client, "Bad message.");
    if (r.data.type !== "hello" && !client.greeted) return fail(client, "Say hello first.");
    try {
      handle(client, r.data);
    } catch (e) {
      console.error(e);
      fail(client, "Server error.");
    }
  });
  ws.on("pong", () => (client.alive = true));
  ws.on("close", () => {
    clients.delete(client);
    client.lobby?.drop(client);
    log(`disconnect ${client.clientID} (${clients.size} online)`);
  });
  ws.on("error", (e) => log(`socket error ${client.clientID}: ${e.message}`));
});

// Dead connections (a closed laptop) don't always send a close frame.
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, 30_000);

ensurePublicGame();
http.listen(PORT, HOST, () => log(`crusades.io game server listening on ${HOST}:${PORT}`));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log(`${sig}: closing`);
    for (const l of lobbies.values()) l.end();
    wss.close();
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  });
}

export {};
// Keep the enum import used: the schema needs the runtime values.
void Difficulty;
