// Draws everything the engine calls a unit: towns and keeps, ships and
// caravans, bolts in flight, and the three sorceries (fireball, dragon,
// starfall) with their arcs through the sky.

import * as THREE from "three";
import { UnitType } from "@crusades/engine-api/game/GameTypes";
import { getParabolaControlPoints } from "@crusades/engine/pathfinding/PathFinder.Parabola";
import { GameState, UnitState } from "../client/GameState";
import { RGB } from "../client/Heraldry";
import { Dragon, Effects } from "./Effects";
import { LevelTags } from "./LevelTags";
import { Marks } from "./Marks";
import { modelFor, MODELS, Pool } from "./Models";
import "./Styles";
import "./Follies";
import { Stage } from "./Stage";
import { Terrain } from "./Terrain";
import { trailFor } from "../store/Trails";
import { SeaTrails } from "./SeaTrails";

const STRUCTURES: Partial<Record<UnitType, keyof typeof MODELS>> = {
  [UnitType.City]: "town",
  [UnitType.DefensePost]: "keep",
  [UnitType.Port]: "harbour",
  [UnitType.Factory]: "market",
  [UnitType.MissileSilo]: "mageTower",
  [UnitType.SAMLauncher]: "ballistaTower",
};

const NEUTRAL: RGB = [0.6, 0.6, 0.6];

/** A war galley's full strength (veterans can hold a little more). */
const GALLEY_HEALTH = 1000;
/** Most points one sea trail is drawn through. */
const TRAIL_POINTS = 160;

interface Memo {
  /** Sorcery only: will a ballista tower reach it? Worked out now and then. */
  doomed?: boolean;
  doomedAt?: number;
  yaw: number;
  x: number;
  y: number;
  z: number;
  seen: boolean;
}

export class Units {
  private pools: Record<string, Pool> = {};
  private tags: LevelTags;
  private marks: Marks;
  /** Set while the player is aiming a fireball or dragon: what, and at which tile. */
  aim: { type: UnitType; target: number } | null = null;
  /** Whether the aimed shot is forecast to be shot down (for the HUD). */
  aimDoomed: boolean | null = null;
  private trails: SeaTrails;
  private trailX = new Float32Array(TRAIL_POINTS);
  private trailZ = new Float32Array(TRAIL_POINTS);
  private memo = new Map<number, Memo>();
  private dragons = new Map<number, Dragon>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private v = new THREE.Vector3();
  private group = new THREE.Group();

  constructor(
    private stage: Stage,
    private terrain: Terrain,
    private state: GameState,
    private effects: Effects,
  ) {
    stage.scene.add(this.group);
    this.tags = new LevelTags(this.group);
    this.marks = new Marks(this.group);
    this.trails = new SeaTrails(this.group);
    const cap: Record<string, number> = {
      town: 1500, keep: 1500, harbour: 800, market: 800, mageTower: 600,
      ballistaTower: 800, scaffold: 400, galley: 600, longship: 600, cog: 900,
      wagon: 1500, bolt: 500, boulder: 600, banner: 3000,
    };
    for (const [name, n] of Object.entries(cap)) {
      this.pools[name] = new Pool(MODELS[name as keyof typeof MODELS], n, this.group);
    }
  }

  /** The pool for a model in its owner's variant; variant pools are made on first use. */
  private pool(name: keyof typeof MODELS, variantTag: string): Pool {
    if (variantTag === "default") return this.pools[name];
    const { key, model } = modelFor(name, variantTag);
    let p = this.pools[key];
    if (!p) {
      p = this.pools[key] = new Pool(model, 400, this.group);
      p.begin();
    }
    return p;
  }

  private color(ownerID: number): RGB {
    return this.state.players.get(ownerID)?.color ?? NEUTRAL;
  }

  private memoOf(u: UnitState): Memo {
    let m = this.memo.get(u.id);
    if (!m) {
      m = { yaw: ((u.id * 2.39996) % (Math.PI * 2)), x: 0, y: 0, z: 0, seen: false };
      if (u.type === UnitType.Port) m.yaw = this.seaward(u.pos);
      this.memo.set(u.id, m);
    }
    return m;
  }

  /** Which way the nearest water lies from a tile, as a yaw. */
  private seaward(tile: number): number {
    const map = this.state.map;
    const x = map.x(tile);
    const y = map.y(tile);
    let best = 0;
    let bestH = Infinity;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const h =
        this.terrain.heightAt(x + Math.sin(a) * 3, y + Math.cos(a) * 3) +
        this.terrain.heightAt(x + Math.sin(a) * 6, y + Math.cos(a) * 6);
      if (h < bestH) {
        bestH = h;
        best = a;
      }
    }
    return best;
  }

  /** World position of a unit this frame, between its last two tiles. */
  /**
   * World position of a unit this frame. A unit on a planned path (ships,
   * caravans, sorcery) is placed on a smoothed version of that path: the
   * engine walks tile by tile, which stair-steps along a diagonal, so the
   * drawn position is a weighted average of the tiles around the current
   * step and the heading comes from a little way ahead and behind.
   */
  private where(u: UnitState, alpha: number, out: THREE.Vector3, room = 0) {
    const map = this.state.map;
    const plan = this.state.plans.gridPlans().get(u.id);
    if (plan && plan.path.length > 2) {
      const s = (this.state.tick - plan.startTick + alpha) / Math.max(1, plan.ticksPerStep);
      const here = this.alongPath(plan.path, s);
      const back = this.alongPath(plan.path, s - 3);
      const ahead = this.alongPath(plan.path, s + 3);
      if (room > 0) {
        // A ship: the path from the engine hugs the coast tile by tile, and
        // rounding it off cuts corners across headlands. Stand every point
        // off the shore by the beam of the ship, easing in to the quay at
        // either end of the voyage.
        const last = plan.path.length - 1;
        this.afloat(here, room * this.berth(s, last));
        this.afloat(back, room * this.berth(s - 3, last));
        this.afloat(ahead, room * this.berth(s + 3, last));
      }
      out.set(this.terrain.worldX(here[0]), 0, this.terrain.worldZ(here[1]));
      return { tx: here[0], ty: here[1], dx: ahead[0] - back[0], dy: ahead[1] - back[1] };
    }
    const x1 = map.x(u.pos);
    const y1 = map.y(u.pos);
    let x0 = map.x(u.prevPos);
    let y0 = map.y(u.prevPos);
    if (Math.abs(x1 - x0) + Math.abs(y1 - y0) > 40) {
      x0 = x1;
      y0 = y1;
    }
    let tx = x0 + (x1 - x0) * alpha;
    let ty = y0 + (y1 - y0) * alpha;
    if (room > 0) {
      const p = this.afloat([tx, ty], room);
      tx = p[0];
      ty = p[1];
    }
    out.set(this.terrain.worldX(tx), 0, this.terrain.worldZ(ty));
    return { tx, ty, dx: x1 - x0, dy: y1 - y0 };
  }

  /** Pushes a point (in place) out from the shore until it has `room` tiles of water. */
  private afloat(p: [number, number], room: number): [number, number] {
    return this.terrain.keepAfloat(p[0], p[1], room, p);
  }

  /** How much sea-room to insist on at step `s` of a voyage: little at the quays, all of it between. */
  private berth(s: number, last: number): number {
    return Math.min(1, Math.max(0.2, Math.min(s, last - s) / 6));
  }

  /** Smoothed tile coordinates at fractional step `s` of a path. */
  private alongPath(path: Uint32Array, s: number): [number, number] {
    const map = this.state.map;
    const last = path.length - 1;
    const c = Math.min(last, Math.max(0, s));
    const R = 4;
    let x = 0;
    let y = 0;
    let wsum = 0;
    for (let i = Math.floor(c) - R; i <= Math.floor(c) + R + 1; i++) {
      const w = Math.max(0, R + 1 - Math.abs(i - c));
      if (w === 0) continue;
      const t = path[Math.min(last, Math.max(0, i))];
      x += map.x(t) * w;
      y += map.y(t) * w;
      wsum += w;
    }
    return [x / wsum, y / wsum];
  }

  private put(
    pool: Pool, x: number, y: number, z: number, yaw: number, scale: number,
    color: RGB, tint = 1, pitch = 0, roll = 0,
  ) {
    this.e.set(pitch, yaw, roll, "YXZ");
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.set(scale, scale, scale);
    this.m.compose(this.p, this.q, this.s);
    pool.add(this.m, color, tint);
  }

  /** A unit left the game: forget it, and return where it was last drawn. */
  forget(u: UnitState): THREE.Vector3 | null {
    const m = this.memo.get(u.id);
    this.memo.delete(u.id);
    const d = this.dragons.get(u.id);
    if (d) {
      this.group.remove(d.group);
      this.dragons.delete(u.id);
    }
    return m && m.seen ? new THREE.Vector3(m.x, m.y, m.z) : null;
  }

  update(alpha: number, dt: number, time: number) {
    for (const pool of Object.values(this.pools)) pool.begin();
    const S = this.stage.unitScale;
    // Level numbers are readable only so far out; beyond that they'd be clutter.
    const showTags = this.stage.distance < 420;
    this.tags.begin(this.stage.camera, 1.6 * Math.pow(S, 0.6));
    this.marks.begin(this.stage.camera);
    this.trails.begin(time);
    // Buildings grow only a little with distance, so they shrink on screen
    // as the camera pulls back instead of crowding the map.
    const structScale = 1.35 * Math.pow(S, 0.4);
    const shipScale = 1.25 * Math.pow(S, 0.4);
    const map = this.state.map;
    const pos = this.v;

    for (const u of this.state.units.values()) {
      const color = this.color(u.ownerID);
      const look = this.state.players.get(u.ownerID)?.look;
      const memo = this.memoOf(u);
      const structure = STRUCTURES[u.type];
      if (structure) {
        const tx = map.x(u.pos);
        const ty = map.y(u.pos);
        const wx = this.terrain.worldX(tx);
        const wz = this.terrain.worldZ(ty);
        const wy = this.terrain.surfaceAt(tx, ty) + (u.type === UnitType.Port ? 0.15 : 0);
        const grow = 1 + Math.min(6, u.level - 1) * 0.1;
        // New buildings rise out of the ground over their first second.
        const age = Math.min(1, (this.state.tick - u.bornTick + alpha) / 10);
        const rise = 0.4 + 0.6 * age;
        if (u.underConstruction) {
          this.put(this.pools.scaffold, wx, wy, wz, memo.yaw, structScale * rise, color);
        } else {
          this.put(this.pool(structure, look?.buildings ?? "default"), wx, wy, wz, memo.yaw, structScale * grow * rise, color);
          if (showTags) {
            const top = structure === "mageTower" ? 9 : structure === "keep" ? 6 : 4.2;
            this.tags.add(wx, wy + top * structScale * grow + 1.2 * Math.pow(S, 0.6), wz, u.level);
          }
          const pips = Math.min(5, u.level - 1);
          for (let i = 0; i < pips; i++) {
            const a = memo.yaw + 2.2 + i * 0.5;
            const r = structScale * 3.1;
            const bx = wx + Math.sin(a) * r;
            const bz = wz + Math.cos(a) * r;
            this.put(
              this.pools.banner, bx,
              this.terrain.surfaceAt(this.terrain.tileX(bx), this.terrain.tileY(bz)),
              bz, memo.yaw + Math.sin(time * 2 + i) * 0.15, structScale * 0.9, color,
            );
          }
        }
        memo.x = wx;
        memo.y = wy + structScale * 2;
        memo.z = wz;
        memo.seen = true;
        continue;
      }

      // Ships are kept clear of the shore by about their own beam, which
      // grows as the camera pulls back and the models are drawn larger.
      const ship = u.type === UnitType.Warship || u.type === UnitType.TransportShip || u.type === UnitType.TradeShip;
      const room = ship ? Math.min(3.5, (u.type === UnitType.TradeShip ? 0.7 : 1.15) * shipScale) : 0;
      const w = this.where(u, alpha, pos, room);
      if (w.dx !== 0 || w.dy !== 0) {
        const want = Math.atan2(w.dx, w.dy);
        let d = want - memo.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        memo.yaw += d * Math.min(1, dt * 4);
      }

      switch (u.type) {
        case UnitType.Warship:
        case UnitType.TransportShip:
        case UnitType.TradeShip: {
          const bob = Math.sin(time * 1.7 + u.id) * 0.08 * shipScale;
          const roll = Math.sin(time * 1.3 + u.id * 2.1) * 0.07;
          const pool = this.pool(
            u.type === UnitType.Warship ? "galley" : u.type === UnitType.TransportShip ? "longship" : "cog",
            look?.ships ?? "default",
          );
          const hurt = u.type === UnitType.Warship && u.health !== undefined && u.health < 500 ? 0.6 : 1;
          // Galleys are the big ships; cogs are little merchantmen beside them.
          const size =
            u.type === UnitType.Warship ? shipScale * 0.8 : u.type === UnitType.TradeShip ? shipScale * 0.45 : shipScale;
          this.put(pool, pos.x, bob + 0.12, pos.z, memo.yaw, size, color, hurt, Math.sin(time * 1.1 + u.id) * 0.04, roll);
          if (hurt < 1 && Math.random() < 0.15) {
            this.effects.trail(this.p.set(pos.x, 2 * shipScale, pos.z), 0.5 * shipScale);
          }
          if (u.type === UnitType.Warship && u.health !== undefined && this.stage.distance < 700) {
            this.marks.bar(pos.x, bob + 4.6 * size, pos.z, 2.6 * size, u.health / GALLEY_HEALTH);
          }
          if (u.type === UnitType.TransportShip) this.seaTrail(u, alpha, look?.trails, color, S, room);
          memo.y = 1;
          break;
        }
        case UnitType.Train: {
          const y = this.terrain.surfaceAt(w.tx, w.ty);
          // The engine packs a caravan's wagons two tiles apart, which reads
          // as one solid train. Draw the lead wagon and every third one
          // behind it (their ids run in sequence), leaving road between them.
          if (u.trainType === "Engine" || u.id % 3 === 0) {
            this.put(this.pools.wagon, pos.x, y, pos.z, memo.yaw, 1.1 * Math.pow(S, 0.4), color);
          }
          memo.y = y;
          break;
        }
        case UnitType.Shell: {
          const y = 2.5 * shipScale;
          this.put(this.pools.bolt, pos.x, y, pos.z, memo.yaw, 1.0 * shipScale, color);
          memo.y = y;
          break;
        }
        case UnitType.SAMMissile: {
          const age = this.state.tick - u.bornTick + alpha;
          const y = this.terrain.surfaceAt(w.tx, w.ty) + Math.min(70, 4 + age * 7);
          this.put(this.pools.bolt, pos.x, y, pos.z, memo.yaw, 2.2 * Math.pow(S, 0.8), color, 1, -0.5);
          if (Math.random() < 0.5) this.effects.trail(this.p.set(pos.x, y, pos.z), 0.35 * S, "arcane");
          memo.y = y;
          break;
        }
        case UnitType.AtomBomb:
        case UnitType.HydrogenBomb:
        case UnitType.MIRV:
        case UnitType.MIRVWarhead:
          this.sorcery(u, w.tx, w.ty, pos, memo, S, time);
          break;
      }
      memo.x = pos.x;
      memo.z = pos.z;
      memo.seen = true;
    }
    for (const pool of Object.values(this.pools)) pool.end();
    this.tags.end();
    this.aimLine(S);
    this.marks.end();
    this.trails.end();
  }

  /**
   * The ribbon a longship has laid, from where it put to sea to where it is
   * now, in its owner's chosen trail. It lasts as long as the ship does.
   */
  private seaTrail(u: UnitState, alpha: number, variant: string | undefined, color: RGB, S: number, room: number) {
    const plan = this.state.plans.gridPlans().get(u.id);
    if (!plan || plan.path.length < 3) return;
    const s = Math.min(plan.path.length - 1, (this.state.tick - plan.startTick + alpha) / Math.max(1, plan.ticksPerStep));
    if (s < 1) return;
    const last = plan.path.length - 1;
    // Long crossings are sampled more coarsely, so a sea full of ships stays cheap.
    const n = Math.min(TRAIL_POINTS, Math.max(2, Math.ceil(s / 1.5) + 1));
    for (let i = 0; i < n; i++) {
      // The wake lies where the hull went: stood off the shore the same way.
      const d = (s * i) / (n - 1);
      const p = this.afloat(this.alongPath(plan.path, d), room * this.berth(d, last));
      this.trailX[i] = this.terrain.worldX(p[0]);
      this.trailZ[i] = this.terrain.worldZ(p[1]);
    }
    // A little wider from far off, so it stays visible as the camera pulls back.
    this.trails.add(this.trailX, this.trailZ, n, 0.3, 1.9 * Math.pow(S, 0.7), trailFor(variant), color);
  }

  /** How high a sorcery flies over tile (tx, ty) of its path, and how far along it is. */
  private arc(u: UnitState, tx: number, ty: number): { y: number; t: number } {
    const map = this.state.map;
    const ox = map.x(u.origin);
    const oy = map.y(u.origin);
    const gx = u.targetTile !== undefined ? map.x(u.targetTile) : tx;
    const gy = u.targetTile !== undefined ? map.y(u.targetTile) : ty;
    const total = Math.max(1, Math.hypot(gx - ox, gy - oy));
    const left = Math.hypot(gx - tx, gy - ty);
    const t = Math.min(1, Math.max(0, 1 - left / total));
    const ground = this.terrain.surfaceAt(tx, ty);
    let y: number;
    switch (u.type) {
      case UnitType.MIRVWarhead:
        y = ground + (1 - t) * (1 - t) * 260 + 2;
        break;
      case UnitType.MIRV:
        y = ground + 8 + t * 320;
        break;
      case UnitType.HydrogenBomb:
        y = ground + 14 + Math.sin(Math.PI * t) * Math.min(70, 20 + total * 0.12);
        break;
      default:
        y = ground + 3 + Math.sin(Math.PI * t) * Math.min(120, 22 + total * 0.25);
    }
    return { y, t };
  }

  /**
   * Will a ballista tower reach this fireball or dragon? True if what is left
   * of its path passes inside the range of a finished tower belonging to
   * someone who is not its caster's ally. A forecast, not a promise: a tower
   * that is reloading, or busy with another target, can still let it through.
   */
  private doomed(u: UnitState, path: Uint32Array, from: number): boolean {
    const map = this.state.map;
    const caster = this.state.players.get(u.ownerID);
    for (const sam of this.state.units.values()) {
      if (sam.type !== UnitType.SAMLauncher || sam.underConstruction || sam.ownerID === u.ownerID) continue;
      const owner = this.state.players.get(sam.ownerID);
      if (caster && owner && this.state.isAllied(owner, caster)) continue;
      const range = this.state.config.samRange(Math.max(1, sam.level));
      const sx = map.x(sam.pos);
      const sy = map.y(sam.pos);
      for (let i = from; i < path.length - 1; i += 2) {
        const dx = map.x(path[i]) - sx;
        const dy = map.y(path[i]) - sy;
        if (dx * dx + dy * dy <= range * range) return true;
      }
    }
    return false;
  }

  /**
   * Before the shot: the arc from the mage tower that would cast it to the
   * tile under the cursor, red if a ballista tower stands in reach of it.
   * The engine fires from the caster's nearest ready tower along a fixed
   * curve, so the same curve is drawn here.
   */
  private aimLine(S: number) {
    this.aimDoomed = null;
    const aim = this.aim;
    const me = this.state.me;
    if (!aim || !me) return;
    const map = this.state.map;
    const gx = map.x(aim.target);
    const gy = map.y(aim.target);
    let silo: UnitState | null = null;
    let best = Infinity;
    for (const u of this.state.units.values()) {
      if (u.type !== UnitType.MissileSilo || u.ownerID !== me.smallID || u.underConstruction) continue;
      const d = Math.abs(map.x(u.pos) - gx) + Math.abs(map.y(u.pos) - gy);
      if (d < best) {
        best = d;
        silo = u;
      }
    }
    if (!silo) return;
    const [p0, p1, p2, p3] = getParabolaControlPoints(map, silo.pos, aim.target, { directionUp: true });
    const total = Math.max(1, Math.hypot(p3.x - p0.x, p3.y - p0.y));
    const n = Math.min(90, Math.max(12, Math.round(total / 5)));
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const k = 1 - t;
      xs.push(k * k * k * p0.x + 3 * k * k * t * p1.x + 3 * k * t * t * p2.x + t * t * t * p3.x);
      ys.push(k * k * k * p0.y + 3 * k * k * t * p1.y + 3 * k * t * t * p2.y + t * t * t * p3.y);
    }
    // The first point of the flight a hostile ballista tower can reach, if any.
    let hit = -1;
    for (const sam of this.state.units.values()) {
      if (sam.type !== UnitType.SAMLauncher || sam.underConstruction || sam.ownerID === me.smallID) continue;
      const owner = this.state.players.get(sam.ownerID);
      if (owner && this.state.isAllied(owner, me)) continue;
      const range = this.state.config.samRange(Math.max(1, sam.level));
      const sx = map.x(sam.pos);
      const sy = map.y(sam.pos);
      for (let i = 0; i <= n; i++) {
        const dx = xs[i] - sx;
        const dy = ys[i] - sy;
        if (dx * dx + dy * dy <= range * range) {
          if (hit < 0 || i < hit) hit = i;
          break;
        }
      }
    }
    this.aimDoomed = hit >= 0;
    const size = 1.0 * Math.pow(S, 0.8);
    const dragon = aim.type === UnitType.HydrogenBomb;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const tx = Math.min(map.width() - 1, Math.max(0, xs[i]));
      const ty = Math.min(map.height() - 1, Math.max(0, ys[i]));
      const y =
        this.terrain.surfaceAt(tx, ty) +
        (dragon ? 14 + Math.sin(Math.PI * t) * Math.min(70, 20 + total * 0.12) : 3 + Math.sin(Math.PI * t) * Math.min(120, 22 + total * 0.25));
      // Gold while it flies free; red from where a tower can reach it.
      const red = hit >= 0 && i >= hit;
      const big = i === n || i === hit;
      this.marks.dot(
        this.terrain.worldX(tx), i === n ? this.terrain.surfaceAt(tx, ty) + 1 : y, this.terrain.worldZ(ty),
        big ? size * 2.2 : size, 1.0, red ? 0.22 : 0.86, red ? 0.16 : 0.42,
      );
    }
  }

  /** The dotted line a fireball or dragon has still to fly: red if a ballista will have it. */
  private flightLine(u: UnitState, memo: Memo, S: number) {
    const plan = this.state.plans.gridPlans().get(u.id);
    if (!plan || plan.path.length < 3) return;
    const s = (this.state.tick - plan.startTick) / Math.max(1, plan.ticksPerStep);
    const from = Math.max(0, Math.floor(s));
    if (memo.doomed === undefined || this.state.tick - (memo.doomedAt ?? 0) >= 10) {
      memo.doomed = this.doomed(u, plan.path, from);
      memo.doomedAt = this.state.tick;
    }
    const last = plan.path.length - 1;
    const step = Math.max(2, Math.ceil((last - from) / 60));
    const size = 0.9 * Math.pow(S, 0.8);
    const [r, g, b] = memo.doomed ? [1.0, 0.22, 0.16] : [1.0, 0.86, 0.42];
    // Dots are counted back from the target so they stand still as it flies.
    for (let i = last; i > from + 1; i -= step) {
      const [tx, ty] = this.alongPath(plan.path, i);
      const { y } = this.arc(u, tx, ty);
      this.marks.dot(this.terrain.worldX(tx), y, this.terrain.worldZ(ty), i === last ? size * 2 : size, r, g, b);
    }
  }

  /** Flight of a fireball, dragon, rising star or falling star. */
  private sorcery(
    u: UnitState, tx: number, ty: number, pos: THREE.Vector3, memo: Memo, S: number, time: number,
  ) {
    const { y, t } = this.arc(u, tx, ty);
    if (u.type === UnitType.AtomBomb || u.type === UnitType.HydrogenBomb) this.flightLine(u, memo, S);
    const prevY = memo.seen ? memo.y : y;
    memo.y = y;
    const color = this.color(u.ownerID);
    const at = this.p.set(pos.x, y, pos.z);

    if (u.type === UnitType.HydrogenBomb) {
      let d = this.dragons.get(u.id);
      if (!d) {
        d = new Dragon(color);
        this.dragons.set(u.id, d);
        this.group.add(d.group);
      }
      const scale = 2.2 * Math.pow(S, 0.8);
      d.group.position.copy(at);
      d.group.scale.setScalar(scale);
      d.group.rotation.set(Math.max(-0.5, Math.min(0.5, (prevY - y) * 0.25)), memo.yaw, 0, "YXZ");
      d.animate(time);
      if (t > 0.82) {
        const dir = new THREE.Vector3(Math.sin(memo.yaw) * 0.6, -0.8, Math.cos(memo.yaw) * 0.6);
        const mouth = new THREE.Vector3(
          at.x + Math.sin(memo.yaw) * 4.3 * scale, at.y + 0.6 * scale, at.z + Math.cos(memo.yaw) * 4.3 * scale,
        );
        this.effects.breath(mouth, dir, scale * 0.5);
      } else if (Math.random() < 0.2) {
        this.effects.trail(at.clone(), scale * 0.4);
      }
      return;
    }

    if (u.type === UnitType.MIRVWarhead) {
      this.put(this.pools.boulder, at.x, at.y, at.z, time * 3 + u.id, 1.6 * Math.pow(S, 0.8), color, 1, time * 2);
      this.effects.trail(at.clone(), 0.7 * Math.pow(S, 0.8), "star");
      return;
    }
    // Fireball and the rising star are pure light.
    const size = (u.type === UnitType.MIRV ? 1.5 : 1.0) * Math.pow(S, 0.8);
    this.effects.trail(at.clone(), size, u.type === UnitType.MIRV ? "star" : "fire");
    this.effects.trail(at.clone(), size * 0.5, u.type === UnitType.MIRV ? "star" : "fire");
  }
}
