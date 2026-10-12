// One running game: the session, the 3D stage and the HUD, wired together.

import { SCOUT_MAX_RADIUS, WARD_RANGE } from "@crusades/engine-api/game/Scouting";
import { onlineKind } from "./ui/Lobby";
import { GameRecord } from "./account/Record";
import { radialOpen } from "./ui/Radial";
import { ConquestMarks } from "./ui/ConquestMarks";
import { CursorKind, setCursor } from "./ui/Cursor";
import { seatForbidden } from "./worldgen/RealmGen";
import * as THREE from "three";
import {
  Nukes,
  Structures,
  UnitType,
} from "@crusades/engine-api/game/GameTypes";
import { GameUpdateType } from "@crusades/engine-api/game/GameUpdates";
import { TickDelta, UnitState } from "./client/GameState";
import { fmt, UNIT_LORE } from "./client/Lexicon";
import { Session } from "./client/Session";
import { Armies } from "./render/Armies";
import { plantWoods, Woods } from "./render/Decor";
import { quality, SlowWatch } from "./render/Quality";
import { Effects } from "./render/Effects";
import { GroundNames } from "./render/GroundNames";
import { PickHit, Stage } from "./render/Stage";
import { Terrain } from "./render/Terrain";
import { Units } from "./render/Units";
import { canSail, Hud } from "./ui/Hud";
import { AttackLabels } from "./ui/AttackLabels";
import { Labels } from "./ui/Labels";

export class Game {
  readonly session: Session;
  private terrain: Terrain;
  private stage: Stage;
  private effects: Effects;
  private units: Units;
  private armies: Armies;
  readonly hud: Hud;
  private labels: Labels;
  private attackLabels: AttackLabels;
  private conquestMarks: ConquestMarks;
  /** The last tile we took from each realm (by its small id): where its final battle is. */
  private lastTaken = new Map<number, number>();
  private groundNames: GroundNames;
  private raf = 0;
  private woods!: Woods;
  /** What this game adds to a signed-in player's record. */
  private record: GameRecord;
  /** The graphics level last taken up, as Quality numbers its changes. */
  private qualitySeen = 0;
  private slow = new SlowWatch();
  private last = performance.now();
  private time = 0;
  private hoverOwner = 0;
  private hoverTile: number | null = null;
  private hoverUnit: UnitState | null = null;
  private paletteDirty = true;
  private centred = false;
  private stopped = false;
  /** War galleys picked with a click, waiting for somewhere to sail. */
  private fleet: number[] = [];
  private v3 = new THREE.Vector3();

  constructor(session: Session, onQuit: () => void) {
    this.session = session;
    const state = this.session.state;
    this.terrain = new Terrain(this.session.realm, state);
    this.stage = new Stage(this.terrain);
    this.stage.onLost = () => this.onGraphicsLost?.();
    this.woods = plantWoods(this.session.realm, this.terrain, this.stage.scene);
    this.woods.thin(quality.treeShare);
    this.qualitySeen = quality.version;
    this.effects = new Effects();
    this.stage.scene.add(this.effects.group);
    this.units = new Units(this.stage, this.terrain, state, this.effects);
    this.armies = new Armies(this.stage, this.terrain, state, this.effects);
    this.groundNames = new GroundNames(
      this.stage.scene, this.terrain, state, this.stage.renderer.capabilities.getMaxAnisotropy(),
    );
    this.hud = new Hud(this.session);
    this.labels = new Labels(document.getElementById("labels")!, this.stage, this.terrain, state);
    this.attackLabels = new AttackLabels(document.getElementById("labels")!, this.session, this.stage, this.terrain, state);
    this.conquestMarks = new ConquestMarks(document.getElementById("labels")!, this.stage, this.terrain);
    this.record = new GameRecord(this.session, onlineKind());
    this.hud.onEnd = (won) => void this.record.finish(won, true);

    this.hud.onQuit = onQuit;
    this.hud.onCancel = () => this.choose([]);
    this.stage.onBox = (x0, y0, x1, y1) => this.boxSelect(x0, y0, x1, y1);
    this.hud.onFocus = (tile) =>
      this.stage.focus(state.map.x(tile), state.map.y(tile), Math.min(this.stage.distance, 260));
    this.stage.onClick = (hit, button, ev) => void this.click(hit, button, ev);
    this.stage.onHover = (hit, ev) => {
      const tile = hit ? state.map.ref(hit.x, hit.y) : null;
      this.hoverOwner = tile !== null ? state.map.ownerID(tile) : 0;
      this.hoverTile = tile;
      this.hoverUnit = hit ? this.structureNear(hit.x, hit.y, 4) : null;
      this.hud.hover(tile, ev.clientX, ev.clientY, this.hoverUnit ?? undefined);
      this.hoverShift = ev.shiftKey;
      this.hoverHit = hit;
    };
    this.session.onTick = (d) => this.tick(d);
    // Keep whatever handler the lobby installed (it reports to the server).
    const reportError = this.session.onError;
    this.session.onError = (msg) => {
      reportError(msg);
      this.hud.toast(`Engine error: ${msg}`, "bad");
    };
  }

  async start() {
    await this.session.start();
    this.last = performance.now();
    const loop = () => {
      if (this.stopped) return;
      this.raf = requestAnimationFrame(loop);
      // At the lowest level every other frame is let go by: half the drawing.
      const cap = quality.frameCap;
      if (cap > 0 && performance.now() - this.last < 1000 / cap - 3) return;
      this.frame();
    };
    loop();
  }

  /** Called if the browser takes the graphics away in the middle of the game. */
  onGraphicsLost?: () => void;

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.session.stop();
    this.hud.dispose();
    this.attackLabels.dispose();
    this.conquestMarks.dispose();
    // Leaving before the end is a game played and not won. The engine has
    // stopped by now, so what is filed is its count as last heard.
    void this.record.finish(false, false);
    document.getElementById("labels")!.innerHTML = "";
    this.stage.dispose();
  }

  /**
   * Realms we finished off this turn: gold rings and a fountain where the
   * last of their ground fell, and a banner there naming them and the gold
   * taken. "Where" is the last tile we took from them before this turn: once
   * a realm falls, whatever it had left is handed over all at once, and that
   * says nothing about where the fighting was.
   */
  private conquered(d: TickDelta, mine: number) {
    const state = this.session.state;
    const map = state.map;
    for (const c of d.updates[GameUpdateType.ConquestEvent]) {
      const victor = state.playersByID.get(c.conquerorId);
      const fallen = state.playersByID.get(c.conqueredId);
      if (!victor || !fallen || victor.smallID !== mine) continue;
      let tile = this.lastTaken.get(fallen.smallID);
      if (tile === undefined) {
        // Fell in a single turn: the first of its ground to change hands.
        for (let i = 0; i < d.conquests.length; i += 3) {
          if (d.conquests[i + 1] === fallen.smallID && d.conquests[i + 2] === mine) {
            tile = d.conquests[i];
            break;
          }
        }
      }
      const x = tile !== undefined ? map.x(tile) : fallen.nameX;
      const y = tile !== undefined ? map.y(tile) : fallen.nameY;
      this.lastTaken.delete(fallen.smallID);
      const pos = new THREE.Vector3(this.terrain.worldX(x), this.terrain.surfaceAt(x, y) + 0.3, this.terrain.worldZ(y));
      this.effects.triumph(pos, 9);
      this.conquestMarks.add(x, y, fallen.name, fmt(Number(c.gold)), performance.now());
    }
    for (let i = 0; i < d.conquests.length; i += 3) {
      if (d.conquests[i + 2] === mine && d.conquests[i + 1] !== 0) this.lastTaken.set(d.conquests[i + 1], d.conquests[i]);
    }
  }

  private tick(d: TickDelta) {
    const state = this.session.state;
    if (d.tiles.length > 0) this.terrain.tilesChanged();
    if (d.updates[GameUpdateType.Player].length > 0) this.paletteDirty = true;
    if (d.roadsChanged) this.terrain.syncRoads();
    this.terrain.syncScouts();
    this.armies.onTick(d);
    for (const u of d.died) this.died(u);
    for (const u of d.captured) {
      if (Structures.has(u.type)) this.at(u, (p) => this.effects.puff(p, 3 * this.stage.unitScale, "dust"));
    }
    this.hud.onTick(d);
    this.record.tick(d, state);
    const me = state.me;
    if (me) this.conquered(d, me.smallID);
    if (!this.centred && me?.spawnTile !== undefined && !state.inSpawnPhase) {
      this.centred = true;
      this.stage.focus(state.map.x(me.spawnTile), state.map.y(me.spawnTile), 230);
    }
  }

  private at(u: UnitState, fn: (p: THREE.Vector3) => void) {
    const map = this.session.state.map;
    const x = map.x(u.pos);
    const y = map.y(u.pos);
    fn(new THREE.Vector3(this.terrain.worldX(x), this.terrain.surfaceAt(x, y), this.terrain.worldZ(y)));
  }

  private died(u: UnitState) {
    const state = this.session.state;
    const last = this.units.forget(u);
    const S = this.stage.unitScale;
    if (Nukes.has(u.type)) {
      if (u.type === UnitType.MIRV) {
        if (last) this.effects.airburst(last, 3 * S);
        return;
      }
      if (u.reachedTarget) {
        const tile = u.targetTile ?? u.pos;
        const x = state.map.x(tile);
        const y = state.map.y(tile);
        const p = new THREE.Vector3(this.terrain.worldX(x), this.terrain.surfaceAt(x, y), this.terrain.worldZ(y));
        const radius = state.config.nukeMagnitudes(u.type).outer;
        this.effects.explode(
          p, radius,
          u.type === UnitType.HydrogenBomb ? "dragon" : u.type === UnitType.MIRVWarhead ? "star" : "fireball",
        );
      } else if (last) {
        // Shot down by a ballista before it landed.
        this.effects.airburst(last, (u.type === UnitType.HydrogenBomb ? 4 : 2) * S);
      }
      return;
    }
    switch (u.type) {
      case UnitType.Shell:
        this.at(u, (p) => this.effects.puff(p.setY(1.5 * S), 1.2 * S, "spark"));
        break;
      // Trade ships leave the map quietly: nearly all of them are just arriving.
      case UnitType.Warship:
        this.at(u, (p) => this.effects.puff(p, 2.2 * S, "splash"));
        break;
      case UnitType.City:
      case UnitType.DefensePost:
      case UnitType.Port:
      case UnitType.Factory:
      case UnitType.MissileSilo:
      case UnitType.SAMLauncher:
      case UnitType.WardTower:
        this.at(u, (p) => this.effects.puff(p, 3.5 * S, "dust"));
        break;
      case UnitType.ScoutingParty:
        // Only a party that was in sight goes up in dust; a hidden one is gone unseen.
        if (last && !u.reachedTarget) this.effects.puff(last, 3 * S, "dust");
        break;
    }
  }

  private hoverShift = false;
  private hoverHit: PickHit | null = null;

  /** Takes command of these war galleys (or none): marks them and says what a click will do. */
  private choose(ids: number[]) {
    this.fleet = ids;
    this.units.chosen = new Set(ids);
    if (ids.length === 0) {
      this.hud.hint(null);
      return;
    }
    this.hud.hint(
      `${ids.length === 1 ? "War galley" : `${ids.length} war galleys`} chosen: click the water to send ${ids.length === 1 ? "it" : "them"} there. Esc to cancel.`,
    );
  }

  /** Shift-drag: every war galley of ours inside the box on screen. */
  private boxSelect(x0: number, y0: number, x1: number, y1: number) {
    const state = this.session.state;
    const me = state.me;
    if (!me || !me.isAlive) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ids: number[] = [];
    for (const u of state.units.values()) {
      if (u.type !== UnitType.Warship || u.ownerID !== me.smallID) continue;
      const p = this.units.drawnAt(u.id, this.v3);
      if (!p) continue;
      p.project(this.stage.camera);
      if (p.z > 1) continue;
      const sx = (p.x * 0.5 + 0.5) * w;
      const sy = (-p.y * 0.5 + 0.5) * h;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) ids.push(u.id);
    }
    this.choose(ids);
    if (ids.length === 0) this.hud.toast("No war galleys of yours in that box.", "info");
  }

  /** What a click under the cursor would do, as a cursor. */
  private cursorKind(): CursorKind {
    // With the wheel open the pointer is a plain one, wherever it is.
    if (radialOpen()) return "own";
    const state = this.session.state;
    const map = state.map;
    const me = state.me;
    const hit = this.hoverHit;
    if (this.stage.dragging) return "drag";
    if (this.hoverShift) return "box";
    if (!hit) return "pan";
    const tile = map.ref(hit.x, hit.y);
    const land = map.isLand(tile);
    if (state.inSpawnPhase) {
      if (!land) return "pan";
      return map.hasOwner(tile) || seatForbidden(this.session.setup.info.config.gameMap, hit.x, hit.y, map.width(), map.height()) ? "barred" : "raise";
    }
    if (!me || !me.isAlive) return "pan";
    const placing = this.hud.placing;
    if (placing !== null) return Nukes.has(placing) ? "cast" : "build";
    if (!land) {
      if (this.fleet.length > 0) return "fleet";
      // Near enough to one of our galleys to take command of it?
      const reach = 5 * this.stage.unitScale;
      for (const u of state.units.values()) {
        if (u.type !== UnitType.Warship || u.ownerID !== me.smallID) continue;
        if (Math.hypot(map.x(u.pos) - hit.x, map.y(u.pos) - hit.y) <= reach) return "choose";
      }
      return "pan";
    }
    if (this.scoutsAt(hit.x, hit.y)) return "march";
    const owner = map.ownerID(tile);
    if (owner === me.smallID) return this.hoverUnit ? "choose" : "own";
    const them = state.players.get(owner);
    if (them && state.isAllied(them, me)) return "ally";
    return this.wayTo(tile, owner);
  }

  private reachAsked = -Infinity;
  private reachAsking = false;

  /**
   * While a scouting party is being placed, the realms it could go into are
   * left in their colours and every other is darkened. Which those are only
   * the engine knows (it follows the roads), so it is asked, again every
   * second or so, since roads are laid and cut.
   */
  private scoutReach() {
    if (this.hud.placing !== UnitType.ScoutingParty) {
      this.reachAsked = -Infinity;
      if (this.terrain.lit !== null) {
        this.terrain.lit = null;
        this.paletteDirty = true;
      }
      return;
    }
    if (this.terrain.lit === null) {
      // Dark at once; the realms in reach light up when the answer comes.
      this.terrain.lit = new Set();
      this.paletteDirty = true;
    }
    const now = performance.now();
    if (this.reachAsking || now - this.reachAsked < 1000) return;
    this.reachAsking = true;
    void this.session.scoutTargets().then((realms) => {
      this.reachAsking = false;
      const first = this.reachAsked === -Infinity;
      this.reachAsked = performance.now();
      if (this.hud.placing !== UnitType.ScoutingParty) return;
      if (first && realms.length === 0) {
        this.hud.toast("No realm is joined to yours by road. Lay a road to a neighbour first: a market near their buildings will do it.", "warn");
      }
      const old = this.terrain.lit;
      if (old && old.size === realms.length && realms.every((r) => old.has(r))) return;
      this.terrain.lit = new Set(realms);
      this.paletteDirty = true;
    });
  }

  /** What the engine last said about building on the tile under the cursor. */
  private upgrade = {
    tile: -1, type: null as UnitType | null, id: null as number | null,
    /** Where a new building would really stand: the engine moves it clear of its neighbours. */
    land: null as number | null,
    /** The roads that building would lay to its neighbours, each a run of tiles. */
    roads: [] as readonly (readonly number[])[],
    at: -Infinity, asking: false,
  };

  /**
   * While a building is being placed: the one a click here would raise a
   * level instead, if any. Only the engine knows how near is near enough, so
   * it is asked, afresh for each tile the cursor comes to rest on.
   */
  private wouldUpgrade(): number | null {
    const placing = this.hud.placing;
    const tile = this.hoverTile;
    const u = this.upgrade;
    if (placing === null || tile === null || !Structures.has(placing)) {
      u.tile = -1;
      u.id = null;
      u.land = null;
      u.roads = [];
      return null;
    }
    const moved = u.tile !== tile || u.type !== placing;
    const now = performance.now();
    if (!u.asking && (moved || now - u.at > 500)) {
      u.asking = true;
      void this.session.buildables(tile, [placing as never]).then(([b]) => {
        u.asking = false;
        u.at = performance.now();
        u.tile = tile;
        u.type = placing;
        u.id = b && b.canUpgrade !== false ? b.canUpgrade : null;
        u.land = b && u.id === null && b.canBuild !== false ? b.canBuild : null;
        u.roads = u.land !== null ? (b.ghostRailPaths ?? []) : [];
      });
    }
    // An answer for another tile says nothing about this one.
    if (moved) {
      u.land = null;
      u.roads = [];
    }
    return moved ? null : u.id;
  }

  /** What the engine said a click on a realm (or a patch of wilderness) would do, and when it said it. */
  private ways = new Map<string, { kind: CursorKind; at: number; asking: boolean }>();

  /**
   * March or sail? Only the engine knows whether our border touches that
   * realm, so it is asked: once per realm, again every second or so, since
   * borders move. Until the first answer comes back, a guess from what is
   * nearby.
   */
  private wayTo(tile: number, owner: number): CursorKind {
    const map = this.session.state.map;
    // Unclaimed land is asked about by neighbourhood: one patch may touch us, another not.
    const key = owner !== 0 ? `p${owner}` : `w${map.x(tile) >> 4},${map.y(tile) >> 4}`;
    let way = this.ways.get(key);
    if (!way) {
      way = { kind: this.borders(tile, this.session.state.me!.smallID) ? "march" : "sail", at: -Infinity, asking: false };
      this.ways.set(key, way);
    }
    const now = performance.now();
    if (!way.asking && now - way.at > 1000) {
      way.asking = true;
      const w = way;
      void this.session.actions(tile, [UnitType.TransportShip]).then((actions) => {
        w.asking = false;
        w.at = performance.now();
        if (!actions) return;
        w.kind = actions.canAttack ? "march" : canSail(actions.buildableUnits) ? "sail" : "barred";
      });
      if (this.ways.size > 400) this.ways.clear();
    }
    return way.kind;
  }

  /** Whether any land of ours lies within a few tiles of this one. */
  private borders(tile: number, mine: number): boolean {
    const map = this.session.state.map;
    const x = map.x(tile);
    const y = map.y(tile);
    const w = map.width();
    const h = map.height();
    for (let r = 1; r <= 3; r++) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (map.ownerID(map.ref(nx, ny)) === mine) return true;
      }
    }
    return false;
  }

  private async click(hit: PickHit | null, button: number, ev: PointerEvent) {
    // A right-click while placing something only puts it down again: no wheel.
    if (button === 2 && this.hud.placing !== null) {
      this.hud.place(null);
      return;
    }
    if (!hit) return;
    const session = this.session;
    const state = session.state;
    const map = state.map;
    const tile = map.ref(hit.x, hit.y);
    if (button === 2) {
      this.hud.place(null);
      void this.hud.context(tile, ev.clientX, ev.clientY);
      return;
    }
    if (button !== 0) return;
    const me = state.me;

    if (state.inSpawnPhase) {
      if (seatForbidden(session.setup.info.config.gameMap, hit.x, hit.y, map.width(), map.height())) {
        this.hud.toast("No house may begin on the great isle. Start on the ring, and sail for it.", "warn");
      } else if (map.isLand(tile) && !map.hasOwner(tile)) {
        session.send({ type: "spawn", tile });
      } else {
        this.hud.toast("Raise your banner on unclaimed land.", "warn");
      }
      return;
    }
    if (!me || !me.isAlive) return;

    const placing = this.hud.placing;
    if (placing !== null) {
      const [b] = await session.buildables(tile, [placing as never]);
      if (b && b.canUpgrade !== false) {
        session.send({ type: "upgrade_structure", unit: placing, unitId: b.canUpgrade });
      } else if (b && b.canBuild !== false) {
        session.send({ type: "build_unit", unit: placing, tile });
      } else {
        this.hud.toast(
          placing === UnitType.ScoutingParty
            ? "A scouting party goes to open country in a realm your roads reach: no building inside its circle, and only one party out at a time."
            : `A ${UNIT_LORE[placing].name} cannot be placed there.`,
          "warn",
        );
        return;
      }
      if (!ev.shiftKey) this.hud.place(null);
      return;
    }

    if (!map.isLand(tile)) {
      // On the water: send the chosen galleys here, or choose the ones nearby.
      if (this.fleet.length > 0) {
        session.send({ type: "move_warship", unitIds: this.fleet as [number, ...number[]], tile });
        this.choose([]);
        return;
      }
      const reach = 5 * this.stage.unitScale;
      const near: number[] = [];
      for (const u of state.units.values()) {
        if (u.type !== UnitType.Warship || u.ownerID !== me.smallID) continue;
        if (Math.hypot(map.x(u.pos) - hit.x, map.y(u.pos) - hit.y) <= reach) near.push(u.id);
      }
      if (near.length > 0) this.choose(near);
      return;
    }
    this.choose([]);
    const scouts = this.scoutsAt(hit.x, hit.y);
    if (scouts) {
      session.send({ type: "rout_scouts", unitId: scouts.id });
      return;
    }
    if (map.ownerID(tile) === me.smallID) return;
    const actions = await session.actions(tile, [UnitType.TransportShip]);
    if (!actions) return;
    const troops = me.troops * this.hud.ratio;
    if (actions.canAttack) {
      session.send({ type: "attack", targetID: state.owner(tile)?.id ?? null, troops });
    } else if (canSail(actions.buildableUnits)) {
      session.send({ type: "boat", troops, dst: tile });
    }
  }

  /**
   * An uncovered scouting party of an enemy's that a click here would fall
   * on: anywhere inside the ground it has reached.
   */
  private scoutsAt(x: number, y: number): UnitState | null {
    const state = this.session.state;
    const me = state.me;
    if (!me || !me.isAlive) return null;
    const map = state.map;
    for (const u of state.units.values()) {
      if (u.type !== UnitType.ScoutingParty || u.reachedTarget || !u.targetable || u.ownerID === me.smallID) continue;
      const owner = state.players.get(u.ownerID);
      if (owner && state.friends(owner, me)) continue;
      if (Math.hypot(map.x(u.pos) - x, map.y(u.pos) - y) <= Math.max(4, u.troops)) return u;
    }
    return null;
  }

  /** The closest standing building within `reach` tiles of a point, if any. */
  private structureNear(x: number, y: number, reach: number): UnitState | null {
    const map = this.session.state.map;
    let best: UnitState | null = null;
    let bestD = reach * reach;
    for (const u of this.session.state.units.values()) {
      if (!Structures.has(u.type)) continue;
      const dx = map.x(u.pos) - x;
      const dy = map.y(u.pos) - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  /** How far a building's effect reaches, in tiles, and the ring kind to draw it with. */
  private reach(type: UnitType, level: number): [number, number] | null {
    const c = this.session.state.config;
    switch (type) {
      case UnitType.DefensePost:
        return [c.defensePostRange(), 0];
      case UnitType.SAMLauncher:
        return [c.samRange(Math.max(1, level)), 1];
      case UnitType.Factory:
        return [c.trainStationMaxRange(), 2];
      case UnitType.WardTower:
        return [WARD_RANGE, 1];
      default:
        return null;
    }
  }

  /**
   * Range rings on the ground: the building under the cursor, and while
   * placing, the cursor's own reach plus every nearby building of that kind
   * and the spacing other buildings demand.
   */
  private rings() {
    const u = this.terrain.uniforms;
    const out = u.uRings.value as THREE.Vector4[];
    const map = this.session.state.map;
    const me = this.session.state.me;
    let n = 0;
    const put = (tx: number, ty: number, r: number, kind: number) => {
      if (n < out.length) out[n++].set(this.terrain.worldX(tx), this.terrain.worldZ(ty), r, kind);
    };
    const placing = this.hud.placing;
    if (placing !== null && this.hoverTile !== null && Nukes.has(placing)) {
      // Casting: the blast at the cursor, and every ballista tower that could
      // shoot it down, yours and theirs, so the gaps in the defence show.
      const hx = map.x(this.hoverTile);
      const hy = map.y(this.hoverTile);
      const blast = this.session.state.config.nukeMagnitudes(
        placing === UnitType.MIRV ? UnitType.MIRVWarhead : placing,
      );
      put(hx, hy, blast.outer, 4);
      put(hx, hy, blast.inner, 5);
      const towers: { u: UnitState; d: number }[] = [];
      for (const b of this.session.state.units.values()) {
        if (b.type !== UnitType.SAMLauncher || b.underConstruction) continue;
        const dx = map.x(b.pos) - hx;
        const dy = map.y(b.pos) - hy;
        towers.push({ u: b, d: dx * dx + dy * dy });
      }
      towers.sort((a, b) => a.d - b.d);
      for (const { u: b } of towers.slice(0, 20)) {
        const r = this.reach(b.type, b.level);
        if (r) put(map.x(b.pos), map.y(b.pos), r[0], r[1]);
      }
    } else if (placing === UnitType.ScoutingParty && this.hoverTile !== null) {
      // Sending scouts: how far they will reach from here, and the sight of
      // every ward tower that is not ours, since those are what will find them.
      const hx = map.x(this.hoverTile);
      const hy = map.y(this.hoverTile);
      put(hx, hy, SCOUT_MAX_RADIUS, 4);
      const wards: { u: UnitState; d: number }[] = [];
      for (const b of this.session.state.units.values()) {
        if (b.type !== UnitType.WardTower || b.underConstruction || (me && b.ownerID === me.smallID)) continue;
        const dx = map.x(b.pos) - hx;
        const dy = map.y(b.pos) - hy;
        wards.push({ u: b, d: dx * dx + dy * dy });
      }
      wards.sort((a, b) => a.d - b.d);
      for (const { u: b } of wards.slice(0, 20)) put(map.x(b.pos), map.y(b.pos), WARD_RANGE, 1);
    } else if (placing !== null && this.hoverTile !== null && Structures.has(placing)) {
      // Drawn where the building will stand, which is not always under the
      // cursor: the engine keeps buildings a set distance apart and moves a
      // new one to the nearest spot that is clear.
      const at = this.upgrade.land ?? this.hoverTile;
      const hx = map.x(at);
      const hy = map.y(at);
      const own = this.reach(placing, 1);
      if (own) put(hx, hy, own[0], own[1]);
      put(hx, hy, this.session.state.config.structureMinDist(), 3);
      // The same kind of building nearby, nearest first, so overlaps show.
      const near: { u: UnitState; d: number }[] = [];
      for (const b of this.session.state.units.values()) {
        if (b.type !== placing || !me || b.ownerID !== me.smallID) continue;
        const dx = map.x(b.pos) - hx;
        const dy = map.y(b.pos) - hy;
        near.push({ u: b, d: dx * dx + dy * dy });
      }
      near.sort((a, b) => a.d - b.d);
      for (const { u: b } of near.slice(0, 14)) {
        const r = this.reach(b.type, b.level);
        if (r) put(map.x(b.pos), map.y(b.pos), r[0], r[1]);
      }
    } else if (this.hoverUnit) {
      const r = this.reach(this.hoverUnit.type, this.hoverUnit.level);
      if (r) put(map.x(this.hoverUnit.pos), map.y(this.hoverUnit.pos), r[0], r[1]);
    }
    // Sorcery in the air: a red circle on the ground where each will land,
    // as wide as its blast.
    // Fireballs and dragons first: there are few of them and each is a
    // catastrophe. Then the falling stars of a starfall, as many as fit.
    const falling = (kinds: UnitType[]) => {
      for (const b of this.session.state.units.values()) {
        if (n >= out.length) return;
        if (!kinds.includes(b.type) || b.targetTile === undefined) continue;
        put(map.x(b.targetTile), map.y(b.targetTile), this.session.state.config.nukeMagnitudes(b.type).outer, 5);
      }
    };
    falling([UnitType.AtomBomb, UnitType.HydrogenBomb]);
    falling([UnitType.MIRVWarhead]);
    u.uRingCount.value = n;
  }

  private frame() {
    const now = performance.now();
    const elapsed = (now - this.last) / 1000;
    const dt = Math.min(0.1, elapsed);
    this.last = now;
    this.time += dt;
    // Too slow for too long, and the level is on auto: draw less.
    if (!document.hidden && !this.session.paused && this.slow.frame(elapsed) && quality.lower()) {
      this.hud.toast(`Graphics lowered to ${quality.level} to keep the game smooth. The Graphics button changes it.`, "warn");
    }
    if (this.qualitySeen !== quality.version) {
      this.qualitySeen = quality.version;
      this.stage.applyQuality();
      this.woods.thin(quality.treeShare);
      this.hud.showGraphics();
    }
    const session = this.session;
    const alpha = session.paused
      ? 1
      : Math.min(1, Math.max(0, (now - session.lastTickAt) / session.tickMs()));

    this.scoutReach();
    if (this.paletteDirty) {
      this.paletteDirty = false;
      this.terrain.syncPalette();
    }
    this.stage.update(dt);
    const u = this.terrain.uniforms;
    u.uTime.value = this.time;
    u.uHover.value = this.hoverOwner;
    u.uSpawnPulse.value = session.state.inSpawnPhase ? 1 : 0;
    this.rings();
    u.uFogNear.value = 500 + this.stage.distance * 1.2;
    u.uFogFar.value = 2400 + this.stage.distance * 3;
    const blasts = u.uBlasts.value as THREE.Vector4[];
    for (let i = 0; i < 4; i++) {
      const b = this.effects.blasts[this.effects.blasts.length - 1 - i];
      if (b) {
        const t = (this.time - b.t0) / b.dur;
        blasts[i].set(b.x, b.z, b.radius, Math.max(0, 1 - t) * 1.6);
      } else {
        blasts[i].set(0, 0, 1, 0);
      }
    }

    // Aiming a fireball or dragon: show its flight before it is cast.
    const aiming = this.hud.placing;
    this.units.aim =
      (aiming === UnitType.AtomBomb || aiming === UnitType.HydrogenBomb) && this.hoverTile !== null
        ? { type: aiming, target: this.hoverTile }
        : null;
    this.units.update(alpha, dt, this.time);
    setCursor(this.stage.canvas, this.cursorKind(), this.hud.placing);
    this.hud.aimWarning(this.units.aimDoomed);
    this.units.upgrading = this.wouldUpgrade();
    this.units.landing = this.upgrade.land;
    this.units.roadsToBe = this.upgrade.roads;
    const raised = this.units.upgrading === null ? undefined : this.session.state.units.get(this.units.upgrading);
    this.hud.upgradeHint(raised ? raised.level : null);
    this.armies.update(dt, this.time);
    this.effects.update(this.time, window.innerHeight, this.stage.camera.fov);
    this.groundNames.update();
    this.stage.render();
    this.labels.update();
    this.attackLabels.update(now);
    this.conquestMarks.update(now);
  }
}
