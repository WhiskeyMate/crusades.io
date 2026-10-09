// The client's copy of the game: tiles, players and units, rebuilt each tick
// from what the engine worker sends. The renderer and HUD only read this.

import { TileRef } from "@crusades/engine-api/game/GameMap";
import {
  PlayerType,
  UnitType,
  WarshipState,
} from "@crusades/engine-api/game/GameTypes";
import {
  AllianceView,
  ATTACK_DELTA_OUTGOING,
  AttackUpdate,
  GameUpdateType,
  GameUpdateViewData,
  PlayerUpdate,
  UnitUpdate,
} from "@crusades/engine-api/game/GameUpdates";
import { GameConfig } from "@crusades/engine-api/Schemas";
import { Config } from "@crusades/engine-lib/configuration/Config";
import { GameMapImpl } from "@crusades/engine-lib/game/GameMapImpl";
import { unpackMotionPlans } from "@crusades/engine-lib/game/MotionPlans";
import { Realm } from "../worldgen/RealmGen";
import { MotionPlanResolver } from "./MotionPlanResolver";
import { Equipped, Slot, variantsOf } from "../store/Catalog";
import { hexToRGB, liegeArms, playerColor, RGB, setArms, Skin, validSkin } from "./Heraldry";

/** What one human player wears, as the server (or the local account) says. */
export interface Cosmetic {
  equipped?: Equipped;
  skin?: Skin | null;
}

export interface PlayerState {
  /** The arms this player designed, if they have any; otherwise their name decides. */
  arms: Skin | null;
  /** Visual variants per slot (see store/Catalog). AI realms wear the defaults. */
  look: Record<Slot, string>;
  id: string;
  smallID: number;
  name: string;
  type: PlayerType;
  clientID: string | null;
  isAlive: boolean;
  tilesOwned: number;
  gold: number;
  troops: number;
  allies: number[];
  embargoes: Set<string>;
  isTraitor: boolean;
  targets: number[];
  outgoingAttacks: AttackUpdate[];
  incomingAttacks: AttackUpdate[];
  outgoingAllianceRequests: string[];
  alliances: AllianceView[];
  hasSpawned: boolean;
  spawnTile?: TileRef;
  nameX: number;
  nameY: number;
  nameSize: number;
  color: RGB;
}

export interface UnitState {
  id: number;
  type: UnitType;
  ownerID: number;
  pos: TileRef;
  /** Where it was one tick ago, for interpolation. */
  prevPos: TileRef;
  /** Where it first appeared. */
  origin: TileRef;
  targetTile?: TileRef;
  isActive: boolean;
  reachedTarget: boolean;
  level: number;
  health?: number;
  troops: number;
  underConstruction: boolean;
  warshipState?: WarshipState;
  trainType?: string;
  loaded?: boolean;
  bornTick: number;
}

export interface Road {
  id: number;
  tiles: TileRef[];
}

/** What changed in one tick, for whoever draws it. */
export interface TickDelta {
  tick: number;
  tiles: Uint32Array;
  /** Land that changed hands: [tile, previous owner, new owner] triples. */
  conquests: number[];
  born: UnitState[];
  died: UnitState[];
  captured: UnitState[];
  nukeImpacts?: Uint32Array;
  updates: GameUpdateViewData["updates"];
  roadsChanged: boolean;
}

export class GameState {
  readonly map: GameMapImpl;
  readonly config: Config;
  readonly players = new Map<number, PlayerState>();
  readonly playersByID = new Map<string, PlayerState>();
  readonly units = new Map<number, UnitState>();
  readonly roads = new Map<number, Road>();
  readonly plans = new MotionPlanResolver();
  tick = 0;
  inSpawnPhase = true;
  me: PlayerState | null = null;

  constructor(
    realm: Realm,
    gameConfig: GameConfig,
    private readonly clientID: string,
    /** Cosmetics by client id, for the humans in this game. */
    private readonly cosmetics: ReadonlyMap<string, Cosmetic> = new Map(),
  ) {
    this.map = new GameMapImpl(
      realm.width,
      realm.height,
      realm.terrain,
      realm.numLandTiles,
    );
    this.config = new Config(gameConfig, false);
  }

  owner(tile: TileRef): PlayerState | null {
    const id = this.map.ownerID(tile);
    return id === 0 ? null : (this.players.get(id) ?? null);
  }

  maxTroops(p: PlayerState): number {
    const cities: { isUnderConstruction(): boolean; level(): number }[] = [];
    for (const u of this.units.values()) {
      if (u.type === UnitType.City && u.ownerID === p.smallID) {
        cities.push({
          isUnderConstruction: () => u.underConstruction,
          level: () => u.level,
        });
      }
    }
    return this.config.maxTroops({
      type: () => p.type,
      numTilesOwned: () => p.tilesOwned,
      troops: () => p.troops,
      isLobbyCreator: () => false,
      units: () => cities,
    } as never);
  }

  isAllied(a: PlayerState, b: PlayerState): boolean {
    return a.allies.includes(b.smallID);
  }

  apply(gu: GameUpdateViewData): TickDelta {
    this.tick = gu.tick;
    const delta: TickDelta = {
      tick: gu.tick,
      tiles: gu.packedTileUpdates,
      conquests: [],
      born: [],
      died: [],
      captured: [],
      nukeImpacts: gu.packedNukeImpacts,
      updates: gu.updates,
      roadsChanged: false,
    };

    const tiles = gu.packedTileUpdates;
    for (let i = 0; i < tiles.length; i += 2) {
      const before = this.map.ownerID(tiles[i]);
      this.map.updateTile(tiles[i], tiles[i + 1]);
      const after = tiles[i + 1] & 0xfff;
      if (after !== before && after !== 0) {
        delta.conquests.push(tiles[i], before, after);
      }
    }

    for (const pu of gu.updates[GameUpdateType.Player]) this.applyPlayer(pu);

    const stats = gu.packedPlayerUpdates;
    if (stats) {
      for (let i = 0; i < stats.length; i += 5) {
        const p = this.players.get(stats[i]);
        if (!p) continue;
        p.tilesOwned = stats[i + 1];
        p.gold = stats[i + 2];
        p.troops = stats[i + 3];
      }
    }
    const attacks = gu.packedAttackUpdates;
    if (attacks) {
      for (let i = 0; i < attacks.length; i += 4) {
        const p = this.players.get(attacks[i]);
        if (!p) continue;
        const list =
          attacks[i + 1] === ATTACK_DELTA_OUTGOING
            ? p.outgoingAttacks
            : p.incomingAttacks;
        const a = list[attacks[i + 2]];
        if (a) a.troops = attacks[i + 3];
      }
    }
    if (gu.playerNameViewData) {
      for (const [id, v] of Object.entries(gu.playerNameViewData)) {
        const p = this.playersByID.get(id);
        if (!p) continue;
        p.nameX = v.x;
        p.nameY = v.y;
        p.nameSize = v.size;
      }
    }

    for (const u of this.units.values()) u.prevPos = u.pos;
    for (const uu of gu.updates[GameUpdateType.Unit]) {
      this.applyUnit(uu, delta);
    }
    if (gu.packedMotionPlans) {
      this.plans.applyRecords(unpackMotionPlans(gu.packedMotionPlans));
    }
    this.plans.advance(gu.tick, {
      tileOf: (id) => {
        const u = this.units.get(id);
        return u && u.isActive ? u.pos : undefined;
      },
      move: (id, tile) => {
        const u = this.units.get(id);
        if (u) u.pos = tile;
      },
      rest: () => {},
    });

    for (const r of gu.updates[GameUpdateType.RailroadConstructionEvent]) {
      this.roads.set(r.id, { id: r.id, tiles: r.tiles });
      delta.roadsChanged = true;
    }
    for (const r of gu.updates[GameUpdateType.RailroadDestructionEvent]) {
      this.roads.delete(r.id);
      delta.roadsChanged = true;
    }
    for (const r of gu.updates[GameUpdateType.RailroadSnapEvent]) {
      this.roads.delete(r.originalId);
      this.roads.set(r.newId1, { id: r.newId1, tiles: r.tiles1 });
      this.roads.set(r.newId2, { id: r.newId2, tiles: r.tiles2 });
      delta.roadsChanged = true;
    }
    if (gu.updates[GameUpdateType.SpawnPhaseEnd].length > 0) {
      this.inSpawnPhase = false;
    }
    return delta;
  }

  private applyPlayer(pu: PlayerUpdate) {
    let p = this.playersByID.get(pu.id);
    if (!p) {
      if (pu.smallID === undefined) return;
      p = {
        id: pu.id,
        smallID: pu.smallID,
        name: pu.displayName ?? pu.name ?? "?",
        type: pu.playerType ?? PlayerType.Bot,
        clientID: pu.clientID ?? null,
        isAlive: true,
        tilesOwned: 0,
        gold: 0,
        troops: 0,
        allies: [],
        embargoes: new Set(),
        isTraitor: false,
        targets: [],
        outgoingAttacks: [],
        incomingAttacks: [],
        outgoingAllianceRequests: [],
        alliances: [],
        hasSpawned: false,
        nameX: 0,
        nameY: 0,
        nameSize: 0,
        color: [1, 1, 1],
        arms: null,
        look: variantsOf(null),
      };
      const mine = p.clientID !== null && p.clientID === this.clientID;
      const worn = p.clientID !== null ? this.cosmetics.get(p.clientID) : undefined;
      p.look = variantsOf(worn?.equipped);
      // What the server sent for this player; for our own realm, what we
      // chose here, which is always the newest.
      const sent = worn?.skin && validSkin(worn.skin) ? worn.skin : null;
      const arms = (mine ? liegeArms() : null) ?? sent;
      p.arms = arms;
      if (arms) {
        setArms(p.name, arms);
        p.color = hexToRGB(arms.color);
      } else {
        p.color = playerColor(p.smallID, p.type, mine, p.name);
      }
      this.players.set(p.smallID, p);
      this.playersByID.set(p.id, p);
      if (mine) this.me = p;
    }
    if (pu.isAlive !== undefined) p.isAlive = pu.isAlive;
    if (pu.tilesOwned !== undefined) p.tilesOwned = pu.tilesOwned;
    if (pu.gold !== undefined) p.gold = Number(pu.gold);
    if (pu.troops !== undefined) p.troops = pu.troops;
    if (pu.allies !== undefined) p.allies = pu.allies.slice();
    if (pu.embargoes !== undefined) p.embargoes = new Set(pu.embargoes);
    if (pu.isTraitor !== undefined) p.isTraitor = pu.isTraitor;
    if (pu.targets !== undefined) p.targets = pu.targets.slice();
    if (pu.outgoingAttacks !== undefined) {
      p.outgoingAttacks = pu.outgoingAttacks.map((a) => ({ ...a }));
    }
    if (pu.incomingAttacks !== undefined) {
      p.incomingAttacks = pu.incomingAttacks.map((a) => ({ ...a }));
    }
    if (pu.outgoingAllianceRequests !== undefined) {
      p.outgoingAllianceRequests = pu.outgoingAllianceRequests.slice();
    }
    if (pu.alliances !== undefined) p.alliances = pu.alliances;
    if (pu.hasSpawned !== undefined) p.hasSpawned = pu.hasSpawned;
    if (pu.spawnTile !== undefined) p.spawnTile = pu.spawnTile;
    if (pu.nameViewData) {
      p.nameX = pu.nameViewData.x;
      p.nameY = pu.nameViewData.y;
      p.nameSize = pu.nameViewData.size;
    }
  }

  private applyUnit(uu: UnitUpdate, delta: TickDelta) {
    let u = this.units.get(uu.id);
    if (!u) {
      if (!uu.isActive) {
        // Born and gone within a tick (an instant hit): still worth a flash.
        delta.died.push({
          id: uu.id,
          type: uu.unitType,
          ownerID: uu.ownerID,
          pos: uu.pos,
          prevPos: uu.lastPos,
          origin: uu.lastPos,
          targetTile: uu.targetTile,
          isActive: false,
          reachedTarget: uu.reachedTarget,
          level: uu.level,
          troops: uu.troops,
          underConstruction: false,
          bornTick: this.tick,
        });
        return;
      }
      u = {
        id: uu.id,
        type: uu.unitType,
        ownerID: uu.ownerID,
        pos: uu.pos,
        prevPos: uu.pos,
        origin: uu.pos,
        isActive: true,
        reachedTarget: false,
        level: uu.level,
        troops: uu.troops,
        underConstruction: false,
        bornTick: this.tick,
      };
      this.units.set(u.id, u);
      delta.born.push(u);
    }
    if (u.ownerID !== uu.ownerID) {
      u.ownerID = uu.ownerID;
      delta.captured.push(u);
    }
    // A planned unit's own position updates lag behind the plan.
    if (!this.plans.hasGridPlan(u.id)) u.pos = uu.pos;
    u.targetTile = uu.targetTile;
    u.reachedTarget = uu.reachedTarget;
    u.level = uu.level;
    u.health = uu.health;
    u.troops = uu.troops;
    u.underConstruction = uu.underConstruction ?? false;
    u.warshipState = uu.warshipState;
    u.trainType = uu.trainType;
    u.loaded = uu.loaded;
    if (!uu.isActive) {
      u.isActive = false;
      u.pos = uu.pos;
      this.units.delete(u.id);
      this.plans.unitRemoved(u.id);
      delta.died.push(u);
    }
  }
}
