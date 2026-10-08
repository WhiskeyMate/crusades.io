// One running game: the session, the 3D stage and the HUD, wired together.

import * as THREE from "three";
import {
  Nukes,
  Structures,
  UnitType,
} from "@crusades/engine-api/game/GameTypes";
import { GameUpdateType } from "@crusades/engine-api/game/GameUpdates";
import { TickDelta, UnitState } from "./client/GameState";
import { UNIT_LORE } from "./client/Lexicon";
import { Session } from "./client/Session";
import { Armies } from "./render/Armies";
import { plantWoods } from "./render/Decor";
import { Effects } from "./render/Effects";
import { GroundNames } from "./render/GroundNames";
import { PickHit, Stage } from "./render/Stage";
import { Terrain } from "./render/Terrain";
import { Units } from "./render/Units";
import { canSail, Hud } from "./ui/Hud";
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
  private groundNames: GroundNames;
  private raf = 0;
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

  constructor(session: Session, onQuit: () => void) {
    this.session = session;
    const state = this.session.state;
    this.terrain = new Terrain(this.session.realm, state);
    this.stage = new Stage(this.terrain);
    plantWoods(this.session.realm, this.terrain, this.stage.scene);
    this.effects = new Effects();
    this.stage.scene.add(this.effects.group);
    this.units = new Units(this.stage, this.terrain, state, this.effects);
    this.armies = new Armies(this.stage, this.terrain, state, this.effects);
    this.groundNames = new GroundNames(
      this.stage.scene, this.terrain, state, this.stage.renderer.capabilities.getMaxAnisotropy(),
    );
    this.hud = new Hud(this.session);
    this.labels = new Labels(document.getElementById("labels")!, this.stage, this.terrain, state);

    this.hud.onQuit = onQuit;
    this.hud.onCancel = () => (this.fleet = []);
    this.hud.onFocus = (tile) =>
      this.stage.focus(state.map.x(tile), state.map.y(tile), Math.min(this.stage.distance, 260));
    this.stage.onClick = (hit, button, ev) => void this.click(hit, button, ev);
    this.stage.onHover = (hit, ev) => {
      const tile = hit ? state.map.ref(hit.x, hit.y) : null;
      this.hoverOwner = tile !== null ? state.map.ownerID(tile) : 0;
      this.hoverTile = tile;
      this.hoverUnit = hit ? this.structureNear(hit.x, hit.y, 4) : null;
      this.hud.hover(tile, ev.clientX, ev.clientY, this.hoverUnit ?? undefined);
    };
    this.session.onTick = (d) => this.tick(d);
    this.session.onError = (msg) => this.hud.toast(`Engine error: ${msg}`, "bad");
  }

  async start() {
    await this.session.start();
    this.last = performance.now();
    const loop = () => {
      if (this.stopped) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.session.stop();
    this.hud.dispose();
    document.getElementById("labels")!.innerHTML = "";
    this.stage.dispose();
  }

  private tick(d: TickDelta) {
    const state = this.session.state;
    if (d.tiles.length > 0) this.terrain.tilesChanged();
    if (d.updates[GameUpdateType.Player].length > 0) this.paletteDirty = true;
    if (d.roadsChanged) this.terrain.syncRoads();
    this.armies.onTick(d);
    for (const u of d.died) this.died(u);
    for (const u of d.captured) {
      if (Structures.has(u.type)) this.at(u, (p) => this.effects.puff(p, 3 * this.stage.unitScale, "dust"));
    }
    this.hud.onTick(d);
    const me = state.me;
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
      case UnitType.Warship:
      case UnitType.TradeShip:
        this.at(u, (p) => this.effects.puff(p, 2.2 * S, "splash"));
        break;
      case UnitType.City:
      case UnitType.DefensePost:
      case UnitType.Port:
      case UnitType.Factory:
      case UnitType.MissileSilo:
      case UnitType.SAMLauncher:
        this.at(u, (p) => this.effects.puff(p, 3.5 * S, "dust"));
        break;
    }
  }

  private async click(hit: PickHit | null, button: number, ev: PointerEvent) {
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
      if (map.isLand(tile) && !map.hasOwner(tile)) {
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
        this.hud.toast(`A ${UNIT_LORE[placing].name} cannot be placed there.`, "warn");
        return;
      }
      if (!ev.shiftKey) this.hud.place(null);
      return;
    }

    if (!map.isLand(tile)) {
      // On the water: send the chosen galleys here, or choose the ones nearby.
      if (this.fleet.length > 0) {
        session.send({ type: "move_warship", unitIds: this.fleet as [number, ...number[]], tile });
        this.fleet = [];
        this.hud.hint(null);
        return;
      }
      const reach = 5 * this.stage.unitScale;
      const near: number[] = [];
      for (const u of state.units.values()) {
        if (u.type !== UnitType.Warship || u.ownerID !== me.smallID) continue;
        if (Math.hypot(map.x(u.pos) - hit.x, map.y(u.pos) - hit.y) <= reach) near.push(u.id);
      }
      if (near.length > 0) {
        this.fleet = near;
        this.hud.hint(
          `${near.length === 1 ? "War galley" : `${near.length} war galleys`} chosen: click the water to send ${near.length === 1 ? "it" : "them"} there. Esc to cancel.`,
        );
      }
      return;
    }
    this.fleet = [];
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
    if (placing !== null && this.hoverTile !== null && Structures.has(placing)) {
      const hx = map.x(this.hoverTile);
      const hy = map.y(this.hoverTile);
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
      for (const { u: b } of near.slice(0, 13)) {
        const r = this.reach(b.type, b.level);
        if (r) put(map.x(b.pos), map.y(b.pos), r[0], r[1]);
      }
    } else if (this.hoverUnit) {
      const r = this.reach(this.hoverUnit.type, this.hoverUnit.level);
      if (r) put(map.x(this.hoverUnit.pos), map.y(this.hoverUnit.pos), r[0], r[1]);
    }
    u.uRingCount.value = n;
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const session = this.session;
    const alpha = session.paused
      ? 1
      : Math.min(1, Math.max(0, (now - session.lastTickAt) / session.tickMs()));

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

    this.units.update(alpha, dt, this.time);
    this.armies.update(dt, this.time);
    this.effects.update(this.time, window.innerHeight, this.stage.camera.fov);
    this.groundNames.update();
    this.stage.render();
    this.labels.update();
  }
}
