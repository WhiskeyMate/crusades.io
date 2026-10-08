// The fighting you can see. The engine only says which tiles changed hands;
// from that this works out where each front is and which way it is moving,
// and stands a company of soldiers on it, facing the enemy, advancing as the
// line advances. Defenders line up opposite them.

import * as THREE from "three";
import { GameState, TickDelta } from "../client/GameState";
import { RGB } from "../client/Heraldry";
import { Effects } from "./Effects";
import { modelFor, MODELS, Pool } from "./Models";
import "./Styles";
import { Stage } from "./Stage";
import { Terrain } from "./Terrain";

const CELL = 9;
const MAX_SOLDIERS = 9000;
/** Camera distances: troops start to appear, and are fully there. */
const SHOW_WITHIN = 300;
const FULL_WITHIN = 230;

interface Company {
  owner: number;
  foe: number;
  /** Tile coordinates, where it stands now and where the front has moved to. */
  x: number;
  y: number;
  gx: number;
  gy: number;
  dx: number;
  dy: number;
  heat: number;
  last: number;
  seed: number;
}

interface Tally {
  sx: number;
  sy: number;
  n: number;
  dx: number;
  dy: number;
  foe: number;
}

export class Armies {
  private companies = new Map<number, Company>();
  private soldiers: Pool;
  /** Soldier pools for bought troop variants, made on first use. */
  private variants = new Map<string, Pool>();
  private group: THREE.Group;
  private banners: Pool;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private cols: number;

  constructor(
    private stage: Stage,
    private terrain: Terrain,
    private state: GameState,
    private effects: Effects,
  ) {
    const group = (this.group = new THREE.Group());
    stage.scene.add(group);
    this.soldiers = new Pool(MODELS.soldier, MAX_SOLDIERS, group);
    this.banners = new Pool(MODELS.banner, 1200, group);
    this.cols = Math.ceil(terrain.width / CELL);
  }

  onTick(delta: TickDelta) {
    const map = this.state.map;
    const w = map.width();
    const tick = delta.tick;
    const c = delta.conquests;
    const tallies = new Map<number, Tally>();
    for (let i = 0; i < c.length; i += 3) {
      const tile = c[i];
      const owner = c[i + 2];
      const x = tile % w;
      const y = (tile / w) | 0;
      const key = (((y / CELL) | 0) * this.cols + ((x / CELL) | 0)) * 4096 + owner;
      let t = tallies.get(key);
      if (!t) {
        t = { sx: 0, sy: 0, n: 0, dx: 0, dy: 0, foe: 0 };
        tallies.set(key, t);
      }
      t.sx += x;
      t.sy += y;
      t.n++;
      if (c[i + 1] !== 0) t.foe = c[i + 1];
      // Ground already ours lies behind the line; push away from it.
      if (x > 0 && map.ownerID(tile - 1) === owner) t.dx += 1;
      if (x < w - 1 && map.ownerID(tile + 1) === owner) t.dx -= 1;
      if (tile >= w && map.ownerID(tile - w) === owner) t.dy += 1;
      if (tile < w * (map.height() - 1) && map.ownerID(tile + w) === owner) t.dy -= 1;
    }
    for (const [key, t] of tallies) {
      const cx = t.sx / t.n;
      const cy = t.sy / t.n;
      const len = Math.hypot(t.dx, t.dy);
      let co = this.companies.get(key);
      if (!co) {
        co = {
          owner: key & 4095, foe: t.foe, x: cx, y: cy, gx: cx, gy: cy,
          dx: len > 0 ? t.dx / len : 0, dy: len > 0 ? t.dy / len : 1,
          heat: 0, last: tick, seed: Math.random() * 100,
        };
        // Step out from behind the line rather than popping up on it.
        co.x -= co.dx * 3;
        co.y -= co.dy * 3;
        this.companies.set(key, co);
      }
      if (len > 0.5) {
        const nx = co.dx * 0.6 + (t.dx / len) * 0.4;
        const ny = co.dy * 0.6 + (t.dy / len) * 0.4;
        const nl = Math.hypot(nx, ny) || 1;
        co.dx = nx / nl;
        co.dy = ny / nl;
      }
      co.gx = cx - co.dx * 1.2;
      co.gy = cy - co.dy * 1.2;
      co.foe = t.foe;
      co.heat = Math.min(1, co.heat + t.n / 22);
      co.last = tick;
    }
    for (const [key, co] of this.companies) {
      if (co.last === tick) continue;
      co.heat *= 0.9;
      if (co.heat < 0.05) this.companies.delete(key);
    }
  }

  private place(
    pool: Pool, tx: number, ty: number, yaw: number, scale: number, color: RGB, lift = 0, lean = 0,
  ) {
    const wx = this.terrain.worldX(tx);
    const wz = this.terrain.worldZ(ty);
    this.e.set(lean, yaw, 0, "YXZ");
    this.q.setFromEuler(this.e);
    this.p.set(wx, this.terrain.surfaceAt(tx, ty) + lift, wz);
    this.s.set(scale, scale, scale);
    this.m.compose(this.p, this.q, this.s);
    pool.add(this.m, color);
  }

  private troops(variantTag: string): Pool {
    if (variantTag === "default") return this.soldiers;
    let p = this.variants.get(variantTag);
    if (!p) {
      p = new Pool(modelFor("soldier", variantTag).model, 3000, this.group);
      p.begin();
      this.variants.set(variantTag, p);
    }
    return p;
  }

  update(dt: number, time: number) {
    this.soldiers.begin();
    this.banners.begin();
    for (const p of this.variants.values()) p.begin();
    const cam = this.stage.camera;
    this.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    // Soldiers are drawn near their true size, so from high up they would be
    // specks: past SHOW_WITHIN they are not drawn at all, and they grow in
    // over the last stretch rather than popping.
    const dist = this.stage.distance;
    if (dist >= SHOW_WITHIN) {
      this.soldiers.end();
      for (const p of this.variants.values()) p.end();
      this.banners.end();
      return;
    }
    const appear = Math.min(1, (SHOW_WITHIN - dist) / (SHOW_WITHIN - FULL_WITHIN));
    const scale = 1.5 * Math.pow(this.stage.unitScale, 0.5) * appear;
    const gap = 0.75 * scale;
    const players = this.state.players;
    const ease = 1 - Math.exp(-dt * 3.5);

    for (const co of this.companies.values()) {
      co.x += (co.gx - co.x) * ease;
      co.y += (co.gy - co.y) * ease;
      this.p.set(this.terrain.worldX(co.x), 1, this.terrain.worldZ(co.y));
      if (!this.frustum.containsPoint(this.p)) continue;
      if (this.soldiers.full) break;
      const owner = players.get(co.owner);
      if (!owner) continue;
      const yaw = Math.atan2(co.dx, co.dy);
      const rx = co.dy;
      const ry = -co.dx;
      const n = 3 + Math.round(co.heat * 11);
      const perRank = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const rank = i < perRank ? 0 : 1;
        const slot = (rank === 0 ? i : i - perRank) - (perRank - 1) / 2;
        const step = Math.sin(time * 9 + co.seed + i * 1.7);
        // The front rank lunges; the rear rank marches in place.
        const push = rank === 0 ? Math.max(0, step) * 0.35 * scale : 0;
        const back = rank * gap * 1.1;
        this.place(
          this.troops(owner.look.troops),
          co.x + rx * slot * gap + co.dx * (push - back),
          co.y + ry * slot * gap + co.dy * (push - back),
          yaw, scale, owner.color, Math.abs(step) * 0.1 * scale, rank === 0 ? step * 0.12 : 0,
        );
      }
      if (co.heat > 0.3) {
        this.place(
          this.banners, co.x - co.dx * gap * 2.2, co.y - co.dy * gap * 2.2,
          yaw + Math.PI / 2 + Math.sin(time * 3 + co.seed) * 0.2, scale * 1.1, owner.color,
        );
      }
      const foe = co.foe !== 0 ? players.get(co.foe) : undefined;
      if (foe && foe.isAlive) {
        const m = Math.max(2, Math.round(n * 0.6));
        const reach = gap * 1.6 + 0.9 * scale;
        for (let i = 0; i < m; i++) {
          const slot = i - (m - 1) / 2;
          const step = Math.sin(time * 8 + co.seed * 2 + i * 2.3);
          const push = Math.max(0, step) * 0.3 * scale;
          this.place(
            this.troops(foe.look.troops),
            co.x + rx * slot * gap + co.dx * (reach - push),
            co.y + ry * slot * gap + co.dy * (reach - push),
            yaw + Math.PI, scale, foe.color, Math.abs(step) * 0.1 * scale, -step * 0.12,
          );
        }
        if (Math.random() < co.heat * 0.2) {
          this.effects.puff(
            this.p.set(
              this.terrain.worldX(co.x + co.dx * reach * 0.5),
              this.terrain.surfaceAt(co.x, co.y) + 0.8 * scale,
              this.terrain.worldZ(co.y + co.dy * reach * 0.5),
            ),
            0.35 * scale, "spark",
          );
        }
      }
      if (Math.random() < co.heat * 0.25) {
        this.effects.dust(
          this.terrain.worldX(co.x - co.dx * gap), this.terrain.surfaceAt(co.x, co.y),
          this.terrain.worldZ(co.y - co.dy * gap), 0.8 * scale,
        );
      }
    }
    this.soldiers.end();
    for (const p of this.variants.values()) p.end();
    this.banners.end();
  }
}
