// What the browser and the game server say to each other. Both sides import
// this file: the server validates every incoming message against the
// schemas, the client gets the types.
//
// The server is a relay with a clock. It never simulates the game; it
// bundles each player's intents into numbered turns that every client feeds
// to its own copy of the engine (see docs/MULTIPLAYER.md).

import { z } from "zod";
import {
  Difficulty,
  GameMapType,
} from "@crusades/engine-api/game/GameTypes";
import {
  GameStartInfo,
  IntentSchema,
  Turn,
  UsernameSchema,
} from "@crusades/engine-api/Schemas";

export const LOBBY_CODE = /^[A-Z2-9]{6}$/;

/** What the lobby's owner chooses before starting. */
export const LobbyConfigSchema = z.object({
  map: z.enum(GameMapType),
  seed: z.number().int().min(1).max(999_999_999),
  difficulty: z.enum(Difficulty),
  kingdoms: z.number().int().min(0).max(120),
  clans: z.number().int().min(0).max(400),
  maxPlayers: z.number().int().min(2).max(64),
});
export type LobbyConfig = z.infer<typeof LobbyConfigSchema>;

/** Intents a player may send over the wire: no host-only ones. */
export const PlayerIntentSchema = IntentSchema.refine(
  (i) =>
    i.type !== "kick_player" &&
    i.type !== "toggle_pause" &&
    i.type !== "update_game_config" &&
    i.type !== "toggle_game_start_timer" &&
    i.type !== "mark_disconnected",
  { message: "not a player intent" },
);

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    /** May be left out while just looking at the list of games. */
    name: UsernameSchema.optional(),
    /** The signed-in account's access token: brings a reserved name and cosmetics. */
    token: z.string().max(4000).optional(),
    /** A client id and secret from an earlier welcome, to take that seat back. */
    resume: z
      .object({
        clientID: z.string().max(16),
        secret: z.string().max(64),
        /**
         * "My game is still running and has played this many turns: send me
         * only the ones after." Left out, the whole game is replayed.
         */
        fromTurn: z.number().int().min(0).optional(),
      })
      .optional(),
  }),
  /** Set or change the house name (needed before creating or joining). */
  z.object({
    type: z.literal("name"),
    name: UsernameSchema,
    /** As in hello: the page often connects before the player has signed in. */
    token: z.string().max(4000).optional(),
  }),
  z.object({ type: z.literal("create"), config: LobbyConfigSchema }),
  /** Send me the public games. (They are also pushed when they change.) */
  z.object({ type: z.literal("list") }),
  z.object({ type: z.literal("join"), lobby: z.string().regex(LOBBY_CODE) }),
  z.object({ type: z.literal("leave") }),
  z.object({ type: z.literal("configure"), config: LobbyConfigSchema }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("intent"), intent: PlayerIntentSchema }),
  /** My engine's state hash at a tick, for desync detection. */
  z.object({ type: z.literal("hash"), tick: z.number().int().min(0), hash: z.number() }),
  /** My realm came out different from yours: send me the terrain. */
  z.object({ type: z.literal("realm") }),
  z.object({ type: z.literal("ping"), t: z.number() }),
  /** What happened on the client's side, for the server log (start received, map loaded, errors). */
  z.object({ type: z.literal("report"), event: z.string().max(40), detail: z.string().max(400).optional() }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface WireCosmetic {
  equipped?: Record<string, string>;
  skin?: { color: string; division: number; charge: number; second?: string; ink?: string | null } | null;
}

export interface LobbyMember {
  clientID: string;
  name: string;
  connected: boolean;
}

/** A public game as the hall lists it. */
export interface PublicGame {
  code: string;
  config: LobbyConfig;
  players: number;
  /** Epoch milliseconds when it starts (the clock keeps moving if nobody has joined). */
  startsAt: number;
}

export interface LobbyView {
  code: string;
  /** Public games start on a timer and have no host; private ones start when the host says. */
  kind: "public" | "private";
  startsAt?: number;
  owner: string;
  config: LobbyConfig;
  members: LobbyMember[];
  status: "open" | "running" | "ended";
}

export type ServerMessage =
  | { type: "welcome"; clientID: string; secret: string; version: string }
  | { type: "lobby"; lobby: LobbyView; now: number }
  /** `now` is the server clock, so countdowns don't depend on the player's clock being right. */
  | { type: "lobbies"; games: PublicGame[]; running: number; online: number; now: number }
  | { type: "left" }
  | {
      type: "start";
      info: GameStartInfo;
      /** Hash of the realm as the server generated it (see RealmHash). */
      realmHash: string;
      /** Turns so far; empty for a fresh start, the whole game on resume. */
      turns: Turn[];
      /** What each signed-in player wears, by client id; the server vouches for it. */
      cosmetics: Record<string, WireCosmetic>;
    }
  | { type: "turn"; turn: Turn }
  /** Back after a dropped connection: the turns missed, to carry straight on. */
  | { type: "resumed"; turns: Turn[] }
  | {
      type: "realm";
      manifest: unknown;
      /** base64 */
      mapBin: string;
      map4xBin: string;
    }
  | { type: "desync"; tick: number }
  | { type: "ended" }
  /** A word from whoever runs the server, shown to everyone. */
  | { type: "notice"; message: string }
  | { type: "pong"; t: number }
  | { type: "error"; message: string };

// Bump whenever the site and the server must be updated together (map lists, message shapes).
export const PROTOCOL_VERSION = "9";
export const TURN_MS = 100;
