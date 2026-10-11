// A signed-in player's record: for each kind of game (public, private,
// solo) how many were played and won, and the running totals of everything
// the engine counts in a game: buildings raised and lost, ships sent and
// taken, sorcery cast, levies marched, gold earned and where it came from.
// Kept with the account, so it follows the player from one device to the next.
//
// From it comes a standing, squire to king, which is all the "progress" there
// is: nothing here makes anyone stronger in a game.
//
// The figures are reported by the player's own browser when a game ends. That
// is good enough for a personal record; it would not be for a prize.

import { GameType } from "@crusades/engine-api/game/GameTypes";
import type { PlayerStats } from "@crusades/engine-api/StatsSchemas";
import { GameState, TickDelta } from "../client/GameState";
import { Session } from "../client/Session";
import { account } from "./Account";

export type Mode = "public" | "private" | "solo";
export const MODES: Mode[] = ["public", "private", "solo"];

export const UNIT_KEYS = ["city", "port", "fact", "defp", "silo", "saml", "wshp"] as const;
export const BOAT_KEYS = ["trade", "trans"] as const;
export const BOMB_KEYS = ["abomb", "hbomb", "mirv", "mirvw"] as const;

/**
 * Everything counted, as plain numbers that can simply be added together.
 * The orders of the lists are the engine's own (see StatsSchemas):
 *   units:   built, destroyed, captured, lost
 *   boats:   sent, arrived, captured, destroyed
 *   bombs:   launched, landed, intercepted
 *   attacks: levies sent, levies received, levies called back
 *   gold:    from workers, from conquest, from trade, from piracy, from own roads, from others' roads
 *   conquests: lords, kingdoms, tribes
 */
export interface Totals {
  units: Record<string, number[]>;
  boats: Record<string, number[]>;
  bombs: Record<string, number[]>;
  attacks: number[];
  gold: number[];
  conquests: number[];
  betrayals: number;
}

export interface ModeRecord {
  played: number;
  wins: number;
  seconds: number;
  /** The largest share of a realm's land ever held, in percent. */
  bestLand: number;
  totals: Totals;
}

export type PlayerRecord = Record<Mode, ModeRecord>;

export const noTotals = (): Totals => ({ units: {}, boats: {}, bombs: {}, attacks: [], gold: [], conquests: [], betrayals: 0 });
export const noMode = (): ModeRecord => ({ played: 0, wins: 0, seconds: 0, bestLand: 0, totals: noTotals() });
export const noRecord = (): PlayerRecord => ({ public: noMode(), private: noMode(), solo: noMode() });

const num = (v: unknown): number => {
  const n = typeof v === "bigint" ? Number(v) : typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const list = (v: unknown, length: number): number[] => {
  const a = Array.isArray(v) ? v : [];
  return Array.from({ length }, (_, i) => num(a[i]));
};
const table = (v: unknown, keys: readonly string[], length: number): Record<string, number[]> => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: Record<string, number[]> = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = list(o[k], length);
  return out;
};

/** The engine's statistics for one player, or totals read back from the database, made plain and safe. */
export function plain(stats: PlayerStats | Totals | null | undefined): Totals {
  const s = (stats ?? {}) as Record<string, unknown>;
  return {
    units: table(s.units, UNIT_KEYS, 4),
    boats: table(s.boats, BOAT_KEYS, 4),
    bombs: table(s.bombs, BOMB_KEYS, 3),
    attacks: list(s.attacks, 3),
    gold: list(s.gold, 6),
    conquests: list(s.conquests, 3),
    betrayals: num(s.betrayals),
  };
}

const addLists = (a: number[], b: number[]) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
const addTables = (a: Record<string, number[]>, b: Record<string, number[]>) => {
  const out: Record<string, number[]> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = addLists(a[k] ?? [], b[k] ?? []);
  return out;
};

export function addTotals(a: Totals, b: Totals): Totals {
  return {
    units: addTables(a.units, b.units),
    boats: addTables(a.boats, b.boats),
    bombs: addTables(a.bombs, b.bombs),
    attacks: addLists(a.attacks, b.attacks),
    gold: addLists(a.gold, b.gold),
    conquests: addLists(a.conquests, b.conquests),
    betrayals: a.betrayals + b.betrayals,
  };
}

export function addModes(a: ModeRecord, b: ModeRecord): ModeRecord {
  return {
    played: a.played + b.played,
    wins: a.wins + b.wins,
    seconds: a.seconds + b.seconds,
    bestLand: Math.max(a.bestLand, b.bestLand),
    totals: addTotals(a.totals, b.totals),
  };
}

/** Every kind of game taken together. */
export const overall = (r: PlayerRecord): ModeRecord => MODES.map((m) => r[m]).reduce(addModes, noMode());

const STANDINGS: [number, string][] = [
  [0, "Squire"],
  [100, "Knight"],
  [300, "Banneret"],
  [700, "Baron"],
  [1500, "Earl"],
  [3000, "Duke"],
  [6000, "Prince"],
  [12000, "King"],
];

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** Renown: a single figure for the whole record. Games against people count for most. */
export function renown(r: PlayerRecord): number {
  const online = addModes(r.public, r.private);
  return online.wins * 40 + online.played * 8 + r.solo.wins * 10 + r.solo.played * 2 + sum(overall(r).totals.conquests);
}

export function standing(r: PlayerRecord): { title: string; renown: number; next: string | null; from: number; to: number } {
  const have = renown(r);
  let i = 0;
  while (i + 1 < STANDINGS.length && have >= STANDINGS[i + 1][0]) i++;
  const next = STANDINGS[i + 1];
  return { title: STANDINGS[i][1], renown: have, next: next ? next[1] : null, from: STANDINGS[i][0], to: next ? next[0] : STANDINGS[i][0] };
}

/** Follows one game and files it with the account when it ends. */
export class GameRecord {
  private bestLand = 0;
  private began = 0;
  private filed = false;
  /** The engine's count as last asked for: what is filed if the player leaves without a goodbye. */
  private latest: PlayerStats | null = null;
  private asked = 0;

  /** `kind` is the lobby's, for a game played with others. */
  constructor(
    private session: Session,
    private kind: "public" | "private" | null,
  ) {}

  tick(_d: TickDelta, state: GameState) {
    const me = state.me;
    if (!me || !me.hasSpawned || this.filed) return;
    const now = performance.now();
    if (this.began === 0) this.began = now;
    const land = (me.tilesOwned / state.map.numLandTiles()) * 100;
    if (land > this.bestLand) this.bestLand = land;
    // Only signed-in players have anywhere to file it.
    if (account.state && now - this.asked > 10_000) {
      this.asked = now;
      void this.session.myStats().then((s) => {
        if (s) this.latest = s;
      }).catch(() => undefined);
    }
  }

  /**
   * The game is over for this player, won or not. Files it once. `fresh`
   * asks the engine for its final count first, which it can only give while
   * the game is still running.
   */
  async finish(won: boolean, fresh: boolean) {
    if (this.filed || this.began === 0) return;
    this.filed = true;
    if (!account.state) return;
    const config = this.session.setup.info.config;
    // A game with endless gold or instant building is for trying things out, not for the record.
    if (config.infiniteGold || config.infiniteTroops || config.instantBuild) return;
    const seconds = Math.round((performance.now() - this.began) / 1000);
    if (fresh) {
      const s = await this.session.myStats().catch(() => null);
      if (s) this.latest = s;
    }
    void account.recordGame({
      mode: config.gameType === GameType.Singleplayer ? "solo" : (this.kind ?? "private"),
      won,
      land: Math.round(this.bestLand * 10) / 10,
      seconds,
      map: String(config.gameMap),
      totals: plain(this.latest),
    });
  }
}
