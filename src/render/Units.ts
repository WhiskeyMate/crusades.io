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
  /** Ships steered tile by tile: where the hull is drawn, trailing the tile it is on, and its smoothed way. */
  gx?: number;
  gz?: number;
  hx?: number;
  hz?: number;
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
  /** War galleys the player has chosen and is about to order: each wears a gold marker. */
  chosen: ReadonlySet<number> = new Set();
  /** The building a click would raise a level rather than build beside: it is ringed in gold. */
  upgrading: number | null = null;

  /** Where a unit was last drawn, in the world; null if it has not been drawn. */
  drawnAt(id: number, out: THREE.Vector3): THREE.Vector3 | null {
    const m = this.memo.get(id);
    return m && m.seen ? out.set(m.x, m.y, m.z) : null;
  }

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
  private where(u: UnitState, alpha: number, out: THREE.Vector3) {
    const map = this.state.map;
    const plan = this.state.plans.gridPlans().get(u.id);
    if (plan && plan.path.length > 2) {
      const s = (this.state.tick - plan.startTick + alpha) / Math.max(1, plan.ticksPerStep);
      const here = this.alongPath(plan.path, s);
      const back = this.alongPath(plan.path, s - 3);
      const ahead = this.alongPath(plan.path, s + 3);
      out.set(this.terrain.worldX(here[0]), 0, this.terrain.worldZ(here[1]));
      return { tx: here[0], ty: here[1], dx: ahead[0] - back[0], dy: ahead[1] - back[1], planned: true };
    }
    const x1 = map.x(u.pos);
    const y1 = map.y(u.pos);
    let x0 = map.x(u.prevPos);
    let y0 = map.y(u.prevPos);
    if (Math.abs(x1 - x0) + Math.abs(y1 - y0) > 40) {
      x0 = x1;
      y0 = y1;
    }
    const tx = x0 + (x1 - x0) * alpha;
    const ty = y0 + (y1 - y0) * alpha;
    out.set(this.terrain.worldX(tx), 0, this.terrain.worldZ(ty));
    return { tx, ty, dx: x1 - x0, dy: y1 - y0, planned: false };
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
          const marked = u.id === this.upgrading;
          // About to be raised a level: it swells and settles, inside a turning ring of gold.
          const swell = marked ? 1.08 + Math.sin(time * 6) * 0.06 : 1;
          this.put(this.pool(structure, look?.buildings ?? "default"), wx, wy, wz, memo.yaw, structScale * grow * rise * swell, color);
          if (marked) {
            const r = structScale * 4.2 * grow;
            for (let i = 0; i < 14; i++) {
              const a = time * 1.6 + (i / 14) * Math.PI * 2;
              this.marks.dot(wx + Math.sin(a) * r, wy + 0.5 * structScale, wz + Math.cos(a) * r, 0.7 * structScale, 1.0, 0.82, 0.3);
            }
            // And an arrow of three marks climbing above it.
            const high = (structure === "mageTower" ? 11 : structure === "keep" ? 8 : 6.2) * structScale * grow;
            for (let i = 0; i < 3; i++) {
              const lift = ((time * 1.4 + i / 3) % 1) * 3 * structScale;
              this.marks.dot(wx, wy + high + lift, wz, (1.3 - i * 0.25) * structScale, 1.0, 0.82, 0.3);
            }
          }
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

      const w = this.where(u, alpha, pos);
      const ship = u.type === UnitType.Warship || u.type === UnitType.TransportShip || u.type === UnitType.TradeShip;
      if (ship && !w.planned) {
        // A war galley is steered one tile at a time, zig-zagging along any
        // slanted course, and pointing it at each step makes it wag. So the
        // hull glides after its tile instead of sitting on it, and the bow
        // follows the way the hull is actually travelling, turned slowly.
        if (memo.gx === undefined || Math.hypot(pos.x - memo.gx, pos.z - memo.gz!) > 25) {
          memo.gx = pos.x;
          memo.gz = pos.z;
          memo.hx = 0;
          memo.hz = 0;
        }
        const follow = Math.min(1, dt * 2.2);
        const mx = (pos.x - memo.gx) * follow;
        const mz = (pos.z - memo.gz!) * follow;
        memo.gx += mx;
        memo.gz! += mz;
        if (dt > 0) {
          const settle = Math.min(1, dt * 1.6);
          memo.hx! += (mx / dt - memo.hx!) * settle;
          memo.hz! += (mz / dt - memo.hz!) * settle;
        }
        if (Math.hypot(memo.hx!, memo.hz!) > 0.6) {
          let d = Math.atan2(memo.hx!, memo.hz!) - memo.yaw;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          memo.yaw += d * Math.min(1, dt * 2.5);
        }
        pos.x = memo.gx;
        pos.z = memo.gz!;
      } else if (w.dx !== 0 || w.dy !== 0) {
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
          this.put(pool, pos.x, bob + 0.05, pos.z, memo.yaw, size, color, hurt, Math.sin(time * 1.1 + u.id) * 0.04, roll);
          if (hurt < 1 && Math.random() < 0.15) {
            this.effects.trail(this.p.set(pos.x, 2 * shipScale, pos.z), 0.5 * shipScale);
          }
          if (this.chosen.has(u.id)) {
            // Chosen: a gold marker bobbing over the mast.
            this.marks.dot(pos.x, bob + 6.2 * size + Math.sin(time * 4) * 0.25 * size, pos.z, 1.1 * size, 1.0, 0.82, 0.3);
          }
          if (u.type === UnitType.Warship && u.health !== undefined && this.stage.distance < 700) {
            this.marks.bar(pos.x, bob + 4.6 * size, pos.z, 2.6 * size, u.health / GALLEY_HEALTH);
          }
          if (u.type === UnitType.TransportShip) this.seaTrail(u, alpha, look?.trails, color, S);
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
  private seaTrail(u: UnitState, alpha: number, variant: string | undefined, color: RGB, S: number) {
    const plan = this.state.plans.gridPlans().get(u.id);
    if (!plan || plan.path.length < 3) return;
    const s = Math.min(plan.path.length - 1, (this.state.tick - plan.startTick + alpha) / Math.max(1, plan.ticksPerStep));
    if (s < 1) return;
    // Long crossings are sampled more coarsely, so a sea full of ships stays cheap.
    const n = Math.min(TRAIL_POINTS, Math.max(2, Math.ceil(s / 1.5) + 1));
    for (let i = 0; i < n; i++) {
      const [tx, ty] = this.alongPath(plan.path, (s * i) / (n - 1));
      this.trailX[i] = this.terrain.worldX(tx);
      this.trailZ[i] = this.terrain.worldZ(ty);
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
    const n = Math.min(240, Math.max(30, Math.round(total / 2)));
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
    const size = 0.8 * Math.pow(S, 0.8);
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

  /** Flight of a fireball, dragon, rising star or falling star. */
  private sorcery(
    u: UnitState, tx: number, ty: number, pos: THREE.Vector3, memo: Memo, S: number, time: number,
  ) {
    const { y, t } = this.arc(u, tx, ty);
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
