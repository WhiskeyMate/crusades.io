// The client's side of the game server: one socket, the lobby you are in,
// and the handover to a Session when the game starts.

import { GameStartInfo, Intent, Turn } from "@crusades/engine-api/Schemas";
import { MapManifest } from "@crusades/engine-api/game/MapFiles";
import { buildRealm, loadRealm, Realm } from "../worldgen/RealmGen";
import { realmHash } from "../worldgen/RealmHash";
import { ClientMessage, LobbyConfig, LobbyView, PROTOCOL_VERSION, PublicGame, ServerMessage, WireCosmetic } from "./Protocol";
import { SocketTransport } from "./SocketTransport";

/** The address of the game server, baked in at build time; none means no online play. */
export const GAME_SERVER: string | undefined =
  (import.meta.env.VITE_GAME_SERVER as string | undefined) ||
  (import.meta.env.DEV ? "ws://localhost:8765" : undefined);

const SEAT_KEY = "crusades.seat";

export interface GameHandoff {
  /** What each signed-in player wears, by client id. */
  cosmetics: Map<string, WireCosmetic>;
  realm: Realm;
  info: GameStartInfo;
  clientID: string;
  transport: SocketTransport;
  catchup: number;
}

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class Online {
  clientID = "";
  lobby: LobbyView | null = null;
  ping = 0;
  /** Server clock minus ours, from the last message that carried the server time. */
  clockOffset = 0;
  onLobby: (lobby: LobbyView | null) => void = () => {};
  onHall: (games: PublicGame[], running: number, online: number) => void = () => {};
  onStart: (game: GameHandoff) => void = () => {};
  onError: (message: string) => void = () => {};
  onDesync: (tick: number) => void = () => {};
  onEnded: () => void = () => {};
  onClose: () => void = () => {};
  onNotice: (message: string) => void = () => {};
  /**
   * The connection during a game: "lost" (trying to get it back), "back",
   * "replay" (back, but the game must be replayed from its first turn), or
   * "gone" (the game cannot be rejoined).
   */
  onLink: (state: "lost" | "back" | "replay" | "gone") => void = () => {};

  private ws: WebSocket | null = null;
  private secret = "";
  private transport: SocketTransport | null = null;
  private pendingStart: ServerMessage & { type: "start" } | null = null;
  private realmWaiters: ((m: ServerMessage & { type: "realm" }) => void)[] = [];
  private pingTimer = 0;
  private startSeq = 0;
  private rejoining = false;
  private awaitingResume = false;

  constructor(
    private name: string,
    /** The signed-in account's access token, if any. */
    private token: string | null = null,
  ) {}

  /** The house name to play under. Sent now if connected, else with hello. */
  setName(name: string) {
    this.name = name;
    if (name) this.post({ type: "name", name, token: this.token ?? undefined });
  }

  /** The account may sign in (or its token be renewed) after we connected. */
  setToken(token: string | null) {
    this.token = token;
  }

  list() {
    this.post({ type: "list" });
  }

  /** Tell the server what happened here, for its log. */
  report(event: string, detail?: string) {
    this.post({ type: "report", event, detail: detail?.slice(0, 400) });
  }

  /** Opens the socket and says hello; resolves once the server answers. */
  connect(server: string, fromTurn?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(server);
      this.ws = ws;
      let welcomed = false;
      ws.onopen = () => {
        let resume: { clientID: string; secret: string; fromTurn?: number } | undefined;
        try {
          const saved = JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? "null");
          if (saved && saved.server === server) resume = saved;
        } catch {
          // No saved seat.
        }
        // Coming back to a game still running in this page: ask for the turns missed.
        if (fromTurn !== undefined && this.secret) resume = { clientID: this.clientID, secret: this.secret, fromTurn };
        this.post({ type: "hello", name: this.name || undefined, token: this.token ?? undefined, resume });
      };
      ws.onmessage = (e) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(e.data as string);
        } catch {
          return;
        }
        if (msg.type === "welcome") {
          if (msg.version !== PROTOCOL_VERSION) {
            ws.close();
            reject(new Error(`The game server is running an older version (${msg.version}); it needs updating.`));
            return;
          }
          welcomed = true;
          this.clientID = msg.clientID;
          this.secret = msg.secret;
          sessionStorage.setItem(SEAT_KEY, JSON.stringify({ server, clientID: msg.clientID, secret: msg.secret }));
          window.clearInterval(this.pingTimer);
          this.pingTimer = window.setInterval(() => this.post({ type: "ping", t: performance.now() }), 5000);
          resolve();
          return;
        }
        this.handle(msg);
      };
      ws.onerror = () => {
        if (!welcomed) reject(new Error("Could not reach the game server."));
      };
      ws.onclose = (e) => {
        if (this.ws !== ws) return; // An older socket, already replaced.
        window.clearInterval(this.pingTimer);
        if (!welcomed) reject(new Error("The game server closed the connection."));
        else if (this.transport && this.pendingStart) this.rejoin(server, e.code);
        else this.onClose();
      };
    });
  }

  /**
   * The connection dropped in the middle of a game. The game itself is still
   * here, in this page: open a new connection, ask for the turns missed, and
   * carry on. Tries for three minutes before giving the game up.
   */
  private rejoin(server: string, code: number) {
    if (this.rejoining) return;
    this.rejoining = true;
    const lost = performance.now();
    this.onLink("lost");
    const attempt = (n: number) => {
      const transport = this.transport;
      if (!transport) {
        this.rejoining = false;
        return;
      }
      this.awaitingResume = true;
      this.connect(server, transport.received).then(
        () => this.report("reconnected", `after ${Math.round((performance.now() - lost) / 1000)}s, attempt ${n}, close code ${code}, from turn ${transport.received}`),
        () => {
          if (performance.now() - lost > 180_000) {
            this.rejoining = false;
            this.awaitingResume = false;
            this.onLink("gone");
            this.resetGame();
            this.onClose();
          } else {
            window.setTimeout(() => attempt(n + 1), Math.min(8000, 1000 * n));
          }
        },
      );
    };
    attempt(1);
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }

  private post(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  create(config: LobbyConfig) {
    this.post({ type: "create", config });
  }
  join(code: string) {
    this.post({ type: "join", lobby: code.toUpperCase() });
  }
  leave() {
    this.post({ type: "leave" });
    this.resetGame();
  }

  /**
   * Forget the game that was running or starting. Without this the next
   * game's start would be taken for a repeat of the last one and ignored.
   */
  private resetGame() {
    this.startSeq++;
    this.realmWaiters = [];
    this.pendingStart = null;
    this.transport = null;
  }
  configure(config: LobbyConfig) {
    this.post({ type: "configure", config });
  }
  start() {
    this.post({ type: "start" });
  }
  sendIntent = (intent: Intent) =>
    this.post({ type: "intent", intent: intent as ClientMessage extends { intent: infer I } ? I : never });
  reportHash(tick: number, hash: number) {
    this.post({ type: "hash", tick, hash });
  }

  private handle(msg: ServerMessage) {
    switch (msg.type) {
      case "lobby":
        this.clockOffset = msg.now - Date.now();
        // A fresh lobby means any earlier game is over for us.
        if (msg.lobby.status === "open") this.resetGame();
        this.lobby = msg.lobby;
        this.onLobby(msg.lobby);
        break;
      case "lobbies":
        if (this.awaitingResume) {
          // We asked for our seat back and got the hall instead: the game is over, or the seat is gone.
          this.awaitingResume = false;
          this.rejoining = false;
          this.resetGame();
          this.onLink("gone");
        }
        this.clockOffset = msg.now - Date.now();
        this.onHall(msg.games, msg.running, msg.online);
        break;
      case "left":
        this.lobby = null;
        this.resetGame();
        this.onLobby(null);
        break;
      case "start": {
        // The same game announced twice is ignored; a different game replaces
        // one that was still loading.
        if (this.pendingStart?.info.gameID === msg.info.gameID) {
          // Unless we asked to carry on and the server could only offer the
          // whole game again (an older server): then replay it from the top.
          if (this.awaitingResume) {
            this.awaitingResume = false;
            this.rejoining = false;
            this.onLink("replay");
          }
          break;
        }
        this.realmWaiters = [];
        // Turns start flowing the instant the game starts, while the map is
        // still downloading. Queue them from this moment; lose none.
        const transport = new SocketTransport(this.sendIntent);
        this.transport = transport;
        for (const t of msg.turns) transport.push(t);
        this.begin(msg, transport).catch((e) => {
          console.error("Could not start the game:", e);
          this.pendingStart = null;
          this.report("START FAILED", e instanceof Error ? e.message : String(e));
          this.onError(`Could not start the game: ${e instanceof Error ? e.message : e}. Leave and rejoin.`);
        });
        break;
      }
      case "turn":
        this.transport?.push(msg.turn);
        break;
      case "resumed":
        for (const t of msg.turns) this.transport?.push(t);
        this.rejoining = false;
        this.awaitingResume = false;
        this.onLink("back");
        break;
      case "realm":
        for (const w of this.realmWaiters) w(msg);
        this.realmWaiters = [];
        break;
      case "desync":
        this.report("desync received", `tick ${msg.tick}`);
        this.onDesync(msg.tick);
        break;
      case "ended":
        this.lobby = null;
        this.resetGame();
        this.onEnded();
        break;
      case "notice":
        this.onNotice(msg.message);
        break;
      case "pong":
        this.ping = Math.round(performance.now() - msg.t);
        break;
      case "error":
        this.onError(msg.message);
        break;
    }
  }

  /** The game is on: build the realm, check it matches, hand over. */
  private async begin(msg: ServerMessage & { type: "start" }, transport: SocketTransport) {
    this.pendingStart = msg;
    // A newer start (another game joined while this one was still loading)
    // makes this one stale: it must not hand over its realm.
    const seq = ++this.startSeq;
    console.log(`Game ${msg.info.gameID} starting on ${msg.info.config.gameMap}, ${msg.turns.length} turns to catch up`);
    this.report("start received", `${msg.info.config.gameMap}, ${msg.turns.length} turns queued, ${this.lobby ? "lobby known" : "NO LOBBY STATE"}`);
    const t0 = performance.now();
    const c = msg.info.config;
    const lobby = this.lobby;
    const opts = {
      map: c.gameMap,
      seed: lobby?.config.seed ?? 1,
      kingdoms: typeof c.nations === "number" ? c.nations : lobby?.config.kingdoms ?? 12,
    };
    let realm = await loadRealm(opts);
    if (seq !== this.startSeq) return;
    if (realmHash(realm) !== msg.realmHash) {
      // This browser's maths disagrees with the server's: take its terrain.
      console.warn("Realm hash mismatch; fetching the server's terrain.");
      this.report("realm hash mismatch", `mine ${realmHash(realm)}, server ${msg.realmHash}; fetching terrain`);
      const theirs = await new Promise<ServerMessage & { type: "realm" }>((resolve) => {
        this.realmWaiters.push(resolve);
        this.post({ type: "realm" });
      });
      if (seq !== this.startSeq) return;
      const manifest = theirs.manifest as MapManifest;
      // Build the whole realm again from the server's bytes. Keeping our own
      // picture of the land with the server's terrain underneath would draw
      // one map and play another.
      realm = buildRealm(
        opts,
        {
          source: "server",
          width: manifest.map.width,
          height: manifest.map.height,
          numLandTiles: manifest.map.num_land_tiles,
          miniWidth: manifest.map4x.width,
          miniHeight: manifest.map4x.height,
          miniNumLandTiles: manifest.map4x.num_land_tiles,
        },
        b64(theirs.mapBin),
        b64(theirs.map4xBin),
      );
      if (realmHash(realm) !== msg.realmHash) {
        this.report("realm still differs", `rebuilt ${realmHash(realm)}, server ${msg.realmHash}`);
      }
    }
    if (seq !== this.startSeq) return;
    this.report("realm ready", `${Math.round(performance.now() - t0)}ms, ${transport.queued} turns queued`);
    this.onStart({
      realm,
      info: msg.info,
      clientID: this.clientID,
      transport,
      catchup: transport.queued,
      cosmetics: new Map(Object.entries(msg.cosmetics ?? {})),
    });
  }
}
