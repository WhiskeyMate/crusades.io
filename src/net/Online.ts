// The client's side of the game server: one socket, the lobby you are in,
// and the handover to a Session when the game starts.

import { GameStartInfo, Intent, Turn } from "@crusades/engine-api/Schemas";
import { MapManifest } from "@crusades/engine-api/game/MapFiles";
import { loadRealm, Realm } from "../worldgen/RealmGen";
import { realmHash } from "../worldgen/RealmHash";
import { ClientMessage, LobbyConfig, LobbyView, PROTOCOL_VERSION, PublicGame, ServerMessage } from "./Protocol";
import { SocketTransport } from "./SocketTransport";

/** The address of the game server, baked in at build time; none means no online play. */
export const GAME_SERVER: string | undefined =
  (import.meta.env.VITE_GAME_SERVER as string | undefined) ||
  (import.meta.env.DEV ? "ws://localhost:8765" : undefined);

const SEAT_KEY = "crusades.seat";

export interface GameHandoff {
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
  onLobby: (lobby: LobbyView | null) => void = () => {};
  onHall: (games: PublicGame[], running: number, online: number) => void = () => {};
  onStart: (game: GameHandoff) => void = () => {};
  onError: (message: string) => void = () => {};
  onDesync: (tick: number) => void = () => {};
  onEnded: () => void = () => {};
  onClose: () => void = () => {};
  onNotice: (message: string) => void = () => {};

  private ws: WebSocket | null = null;
  private secret = "";
  private transport: SocketTransport | null = null;
  private pendingStart: ServerMessage & { type: "start" } | null = null;
  private realmWaiters: ((m: ServerMessage & { type: "realm" }) => void)[] = [];
  private pingTimer = 0;

  constructor(private name: string) {}

  /** The house name to play under. Sent now if connected, else with hello. */
  setName(name: string) {
    this.name = name;
    if (name) this.post({ type: "name", name });
  }

  list() {
    this.post({ type: "list" });
  }

  /** Opens the socket and says hello; resolves once the server answers. */
  connect(server: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(server);
      this.ws = ws;
      let welcomed = false;
      ws.onopen = () => {
        let resume: { clientID: string; secret: string } | undefined;
        try {
          const saved = JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? "null");
          if (saved && saved.server === server) resume = saved;
        } catch {
          // No saved seat.
        }
        this.post({ type: "hello", name: this.name || undefined, resume });
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
          this.pingTimer = window.setInterval(() => this.post({ type: "ping", t: performance.now() }), 5000);
          resolve();
          return;
        }
        this.handle(msg);
      };
      ws.onerror = () => {
        if (!welcomed) reject(new Error("Could not reach the game server."));
      };
      ws.onclose = () => {
        window.clearInterval(this.pingTimer);
        if (!welcomed) reject(new Error("The game server closed the connection."));
        else this.onClose();
      };
    });
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
        this.lobby = msg.lobby;
        this.onLobby(msg.lobby);
        break;
      case "lobbies":
        this.onHall(msg.games, msg.running, msg.online);
        break;
      case "left":
        this.lobby = null;
        this.onLobby(null);
        break;
      case "start":
        void this.begin(msg);
        break;
      case "turn":
        this.transport?.push(msg.turn);
        break;
      case "realm":
        for (const w of this.realmWaiters) w(msg);
        this.realmWaiters = [];
        break;
      case "desync":
        this.onDesync(msg.tick);
        break;
      case "ended":
        this.lobby = null;
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
  private async begin(msg: ServerMessage & { type: "start" }) {
    if (this.pendingStart) return;
    this.pendingStart = msg;
    const c = msg.info.config;
    const lobby = this.lobby;
    let realm = await loadRealm({
      map: c.gameMap,
      seed: lobby?.config.seed ?? 1,
      kingdoms: typeof c.nations === "number" ? c.nations : lobby?.config.kingdoms ?? 12,
    });
    if (realmHash(realm) !== msg.realmHash) {
      // This browser's maths disagrees with the server's: take its terrain.
      console.warn("Realm hash mismatch; fetching the server's terrain.");
      const theirs = await new Promise<ServerMessage & { type: "realm" }>((resolve) => {
        this.realmWaiters.push(resolve);
        this.post({ type: "realm" });
      });
      const manifest = theirs.manifest as MapManifest;
      const mapBin = b64(theirs.mapBin);
      realm = {
        ...realm,
        files: { ...realm.files, manifest, mapBin, map4xBin: b64(theirs.map4xBin) },
        terrain: mapBin.slice(),
        numLandTiles: manifest.map.num_land_tiles,
      };
    }
    const transport = new SocketTransport(this.sendIntent);
    this.transport = transport;
    for (const t of msg.turns) transport.push(t);
    this.onStart({
      realm,
      info: msg.info,
      clientID: this.clientID,
      transport,
      catchup: msg.turns.length,
    });
  }
}
