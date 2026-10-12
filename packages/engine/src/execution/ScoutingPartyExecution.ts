import { TileRef } from "@crusades/engine-api/game/GameMap";
import {
  MessageType,
  Structures,
  UnitType,
} from "@crusades/engine-api/game/GameTypes";
import {
  SCOUT_CLEARANCE,
  SCOUT_MAX_RADIUS,
  SCOUT_MAX_TILES,
  SCOUT_TILES_PER_TICK,
  WARD_RANGE,
} from "@crusades/engine-api/game/Scouting";
import {
  zInt,
  zPlayerRef,
  zRef,
} from "@crusades/engine-lib/snapshot/SnapshotType";
import { z } from "zod";
import { Execution, Game, Player, Unit } from "../game/Game";
import { execSnapshotType } from "../snapshot/ExecutionSnapshot";
import type {
  ExecRecord,
  SnapshotReader,
  SnapshotWriter,
} from "../snapshot/SnapshotContext";

/** How often a party looks for ward towers, in ticks. */
const WATCH_EVERY = 5;
/** How often it looks again at where the buildings are, in ticks. */
const LANES_EVERY = 10;
/** How ragged its edge is: tiles this much further out (in squared tiles) may be covered before nearer ones. */
const RAGGED = 48;

/**
 * A scouting party: sent into another realm, it spreads unseen from where it
 * was sent, tile by tile as an attack does, until it has covered its full
 * size (or has nowhere left to go), and then the land it has covered becomes
 * its owner's. It covers only open land of the one realm it was sent into:
 * it stops at that realm's borders, and spreads around buildings, never over
 * them. Until then the land is still its holder's in every way.
 *
 * The unit carries the party's state where every client can read it:
 *  - scoutTiles:    the tiles it has covered, sent as it covers them;
 *  - troops:        how far the furthest of them is from where it was sent;
 *  - targetable:    whether a ward tower has uncovered it (it starts hidden);
 *  - reachedTarget: whether it is done, and now a camp holding the land.
 *
 * While it spreads, a ward tower of anyone who is no friend of the owner
 * uncovers it when the tower's sight meets the party's reach; uncovered, it
 * can be routed at a stroke (RoutScoutsExecution). Once done it stays as a
 * camp on the spot it was sent to: land around a camp is not swallowed for
 * being surrounded (see PlayerExecution), and the camp falls when the tile
 * under it is taken.
 */
export class ScoutingPartyExecution implements Execution {
  private mg: Game;
  private active = true;
  private party: Unit | null = null;
  private startTick = 0;
  /** The realm it was sent into: it spreads over that realm's land and no other's. */
  private target: Player | null = null;
  /** The ground covered so far, in the order it was covered. */
  private covered: TileRef[] = [];
  private coveredSet = new Set<TileRef>();
  /** Tiles beside the covered ground, not yet looked at. */
  private frontier: TileRef[] = [];
  private frontierSet = new Set<TileRef>();
  private reachSquared = 0;
  private lanesNow: number[][] = [];

  constructor(
    private player: Player,
    private tile: TileRef,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    if (!mg.isValidRef(this.tile)) {
      console.warn(`cannot send a scouting party to invalid tile ${this.tile}`);
      this.active = false;
    }
  }

  tick(ticks: number): void {
    if (this.party === null) {
      const spawn = this.player.canBuild(UnitType.ScoutingParty, this.tile);
      if (spawn === false) {
        console.warn(`cannot send a scouting party to ${this.tile}`);
        this.active = false;
        return;
      }
      this.party = this.player.buildUnit(UnitType.ScoutingParty, spawn, {});
      // Hidden until a ward tower finds it.
      this.party.setTargetable(false);
      this.party.setTroops(1);
      this.startTick = ticks;
      const realm = this.mg.owner(spawn);
      this.target = realm.isPlayer() ? realm : null;
      this.lanesNow = this.lanes(spawn);
      this.cover(spawn);
      this.party.reachScoutTiles([spawn]);
      return;
    }

    const party = this.party;
    if (!party.isActive()) {
      this.active = false;
      return;
    }
    const owner = party.owner();
    if (!owner.isAlive()) {
      party.delete(false);
      this.active = false;
      return;
    }

    if (party.reachedTarget()) {
      // A camp stands for as long as its owner holds the ground under it.
      if (this.mg.owner(party.tile()) !== owner) {
        party.delete(false);
        this.active = false;
      }
      return;
    }

    const age = ticks - this.startTick;
    if (age % LANES_EVERY === 0) this.lanesNow = this.lanes(party.tile());
    const fresh = this.spread(party, owner);
    const radius = Math.max(1, Math.ceil(Math.sqrt(this.reachSquared)));
    if (radius !== party.troops()) party.setTroops(radius);
    if (fresh.length > 0) party.reachScoutTiles(fresh);

    if (age % WATCH_EVERY === 0) {
      const seen = this.wardInSight(party, owner, radius);
      if (seen !== null && !party.isTargetable()) {
        this.mg.displayMessage(
          "events_display.scouts_spotted_own",
          MessageType.UNIT_DESTROYED,
          owner.id(),
        );
        this.mg.displayMessage(
          "events_display.scouts_spotted",
          MessageType.NAVAL_INVASION_INBOUND,
          seen.id(),
          undefined,
          { name: owner.displayName() },
          party.id(),
        );
      }
      party.setTargetable(seen !== null);
    }

    if (this.covered.length >= SCOUT_MAX_TILES || this.frontier.length === 0) {
      this.settle(party, owner);
    }
  }

  /** Takes a tile into the covered ground, and its neighbours into the frontier. */
  private cover(tile: TileRef): void {
    const mg = this.mg;
    const origin = this.party!.tile();
    this.covered.push(tile);
    this.coveredSet.add(tile);
    const d = mg.euclideanDistSquared(origin, tile);
    if (d > this.reachSquared) this.reachSquared = d;
    const limit = SCOUT_MAX_RADIUS * SCOUT_MAX_RADIUS;
    for (const n of mg.neighbors(tile)) {
      if (this.coveredSet.has(n) || this.frontierSet.has(n)) continue;
      if (mg.euclideanDistSquared(origin, n) > limit) continue;
      this.frontierSet.add(n);
      this.frontier.push(n);
    }
  }

  /**
   * One tick's spread: the nearest open tiles of the frontier, give or take
   * a little so the edge is ragged like an advancing army's and not a ruled
   * circle. Tiles that are not open are dropped from the frontier for good.
   */
  private spread(party: Unit, owner: Player): TileRef[] {
    const mg = this.mg;
    const origin = party.tile();
    const fresh: TileRef[] = [];
    while (
      fresh.length < SCOUT_TILES_PER_TICK &&
      this.frontier.length > 0 &&
      this.covered.length < SCOUT_MAX_TILES
    ) {
      let at = 0;
      let best = Infinity;
      for (let i = 0; i < this.frontier.length; i++) {
        const t = this.frontier[i];
        // The same on every machine: a scramble of the tile's own number.
        const jitter = (Math.imul(t ^ party.id(), 2654435761) >>> 0) % RAGGED;
        const key = mg.euclideanDistSquared(origin, t) + jitter;
        if (key < best) {
          best = key;
          at = i;
        }
      }
      const tile = this.frontier[at];
      this.frontier[at] = this.frontier[this.frontier.length - 1];
      this.frontier.pop();
      this.frontierSet.delete(tile);
      if (!this.open(tile, owner, this.lanesNow)) continue;
      this.cover(tile);
      fresh.push(tile);
    }
    return fresh;
  }

  /** The owner of a ward tower that can see the party, if there is one. */
  private wardInSight(party: Unit, owner: Player, radius: number): Player | null {
    const wards = this.mg.nearbyUnits(
      party.tile(),
      WARD_RANGE + radius,
      UnitType.WardTower,
    );
    let best: Player | null = null;
    let bestDist = Infinity;
    let bestId = Infinity;
    for (const { unit, distSquared } of wards) {
      const watcher = unit.owner();
      if (watcher === owner || watcher.isFriendly(owner)) continue;
      // Nearest first, and by id between equals, so every client names the same tower.
      if (
        distSquared < bestDist ||
        (distSquared === bestDist && unit.id() < bestId)
      ) {
        best = unit.owner();
        bestDist = distSquared;
        bestId = unit.id();
      }
    }
    return best;
  }

  /**
   * The ground a party must leave alone: each building in its reach, and a
   * lane from that building straight out past the edge of the party's reach.
   * Without the lane the land round a building would be an island in the
   * party's ground, and an island is swallowed, building and all.
   *
   * Each is a line from the building to a point outside, as [x0, y0, x1, y1].
   * Only +, -, *, / and sqrt are used on them, which every machine works out
   * alike.
   */
  private lanes(origin: TileRef): number[][] {
    const mg = this.mg;
    const ox = mg.x(origin);
    const oy = mg.y(origin);
    const lanes: number[][] = [];
    const near = mg.nearbyUnits(
      origin,
      SCOUT_MAX_RADIUS + SCOUT_CLEARANCE + 1,
      Structures.types,
      undefined,
      true,
    );
    for (const { unit } of near) {
      const px = mg.x(unit.tile());
      const py = mg.y(unit.tile());
      const dx = px - ox;
      const dy = py - oy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) {
        lanes.push([px, py, px, py]);
        continue;
      }
      const out = (SCOUT_MAX_RADIUS + SCOUT_CLEARANCE + 2) / len;
      lanes.push([px, py, ox + dx * out, oy + dy * out]);
    }
    return lanes;
  }

  /** Whether a tile lies in one of the lanes left for the buildings. */
  private inLane(tile: TileRef, lanes: number[][]): boolean {
    const x = this.mg.x(tile);
    const y = this.mg.y(tile);
    const keep = SCOUT_CLEARANCE * SCOUT_CLEARANCE;
    for (const [x0, y0, x1, y1] of lanes) {
      const vx = x1 - x0;
      const vy = y1 - y0;
      const span = vx * vx + vy * vy;
      let t = span === 0 ? 0 : ((x - x0) * vx + (y - y0) * vy) / span;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const cx = x0 + vx * t - x;
      const cy = y0 + vy * t - y;
      if (cx * cx + cy * cy <= keep) return true;
    }
    return false;
  }

  /** Land a party may take: the chosen realm's, while it is no friend, and clear of buildings. */
  private open(tile: TileRef, owner: Player, lanes: number[][]): boolean {
    const mg = this.mg;
    if (!mg.isLand(tile) || mg.isImpassable(tile)) return false;
    const holder = mg.owner(tile);
    // Only the realm it was sent into: it stops at that realm's borders.
    if (holder !== this.target || holder === owner || holder.isFriendly(owner)) {
      return false;
    }
    return !this.inLane(tile, lanes);
  }

  /** The party is done: the ground it has covered, where it is still open, changes hands. */
  private settle(party: Unit, owner: Player): void {
    const mg = this.mg;
    const lanes = this.lanes(party.tile());
    const taken = this.covered.filter((t) => this.open(t, owner, lanes));
    if (taken.length === 0) {
      mg.displayMessage(
        "events_display.scouts_failed",
        MessageType.ATTACK_FAILED,
        owner.id(),
      );
      party.delete(false);
      this.active = false;
      return;
    }
    const losers = new Set<Player>();
    for (const t of taken) {
      const holder = mg.owner(t);
      if (holder.isPlayer()) losers.add(holder);
      owner.conquer(t);
    }
    party.setReachedTarget();
    // Setting that alone tells nobody; this sends the party out afresh.
    party.setTargetable(true);
    party.touch();
    mg.displayMessage(
      "events_display.scouts_settled",
      MessageType.CAPTURED_ENEMY_UNIT,
      owner.id(),
      undefined,
      { tiles: taken.length },
    );
    for (const loser of losers) {
      mg.displayMessage(
        "events_display.scouts_took_land",
        MessageType.NAVAL_INVASION_INBOUND,
        loser.id(),
        undefined,
        { name: owner.displayName() },
        party.id(),
      );
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return ScoutingPartyExecutionSnapshot.write({
      active: this.active,
      initialized: this.mg !== undefined,
      player: w.player(this.player),
      tile: this.tile,
      party: w.unitOrNull(this.party),
      startTick: this.startTick,
      target: w.playerOrNull(this.target),
      covered: this.covered,
      frontier: this.frontier,
      reachSquared: this.reachSquared,
    });
  }

  restoreSnapshot(s: ScoutingPartyState, r: SnapshotReader): void {
    this.active = s.active;
    if (s.initialized) this.mg = r.game;
    this.player = r.player(s.player);
    this.tile = s.tile;
    this.party = r.unitOrNull(s.party);
    this.startTick = s.startTick;
    this.target = r.playerOrNull(s.target);
    this.covered = [...s.covered];
    this.coveredSet = new Set(this.covered);
    this.frontier = [...s.frontier];
    this.frontierSet = new Set(this.frontier);
    this.reachSquared = s.reachSquared;
    if (s.initialized && this.party) this.lanesNow = this.lanes(this.party.tile());
  }
}

const ScoutingPartyStateSchema = z.object({
  active: z.boolean(),
  initialized: z.boolean(),
  player: zPlayerRef(),
  // Validated in init, so a pending execution may hold any number.
  tile: zInt(),
  party: zRef().nullable(),
  startTick: zInt(),
  target: zPlayerRef().nullable(),
  covered: z.array(zInt()),
  frontier: z.array(zInt()),
  reachSquared: zInt(),
});
type ScoutingPartyState = z.infer<typeof ScoutingPartyStateSchema>;

export const ScoutingPartyExecutionSnapshot = execSnapshotType({
  name: "ScoutingParty",
  version: 1,
  schema: ScoutingPartyStateSchema,
  cls: () => ScoutingPartyExecution,
});

/**
 * An uncovered scouting party is set upon and scattered. Anyone who is no
 * friend of its owner may do it, at once and at no cost: that is what a ward
 * tower is for.
 */
export class RoutScoutsExecution implements Execution {
  constructor(
    private player: Player,
    private unitId: number,
  ) {}

  init(mg: Game, ticks: number): void {
    const party = mg.unit(this.unitId);
    if (
      !party ||
      !party.isActive() ||
      party.type() !== UnitType.ScoutingParty ||
      party.reachedTarget() ||
      !party.isTargetable()
    ) {
      return;
    }
    const owner = party.owner();
    if (owner === this.player || owner.isFriendly(this.player)) return;
    if (!this.player.isAlive()) return;
    mg.displayMessage(
      "events_display.scouts_routed_own",
      MessageType.UNIT_DESTROYED,
      owner.id(),
      undefined,
      { name: this.player.displayName() },
    );
    mg.displayMessage(
      "events_display.scouts_routed",
      MessageType.CAPTURED_ENEMY_UNIT,
      this.player.id(),
      undefined,
      { name: owner.displayName() },
    );
    party.delete(false, this.player);
  }

  tick(ticks: number): void {}

  isActive(): boolean {
    return false;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  snapshot(w: SnapshotWriter): ExecRecord {
    return RoutScoutsExecutionSnapshot.write({
      player: w.player(this.player),
      unitId: this.unitId,
    });
  }

  restoreSnapshot(s: RoutScoutsState, r: SnapshotReader): void {
    this.player = r.player(s.player);
    this.unitId = s.unitId;
  }
}

const RoutScoutsStateSchema = z.object({
  player: zPlayerRef(),
  unitId: zInt(),
});
type RoutScoutsState = z.infer<typeof RoutScoutsStateSchema>;

export const RoutScoutsExecutionSnapshot = execSnapshotType({
  name: "RoutScouts",
  version: 1,
  schema: RoutScoutsStateSchema,
  cls: () => RoutScoutsExecution,
});
