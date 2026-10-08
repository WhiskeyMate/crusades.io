// The landing page's backdrop: a real game with no human in it. AI kingdoms
// and clans fight over a generated realm while the camera drifts around it.

import { Difficulty, GameMapType } from "@crusades/engine-api/game/GameTypes";
import { GameUpdateType } from "@crusades/engine-api/game/GameUpdates";
import { Session, soloSession } from "./client/Session";
import { DEFAULT_KINGDOMS } from "./worldgen/RealmGen";
import { Armies } from "./render/Armies";
import { plantWoods } from "./render/Decor";
import { Effects } from "./render/Effects";
import { GroundNames } from "./render/GroundNames";
import { Stage } from "./render/Stage";
import { Terrain } from "./render/Terrain";
import { Units } from "./render/Units";

const REALMS = [GameMapType.Europe, GameMapType.Mediterranean, GameMapType.Greece, GameMapType.Earth];

export class Attract {
  private session: Session;
  private terrain: Terrain;
  private stage: Stage;
  private effects = new Effects();
  private units: Units;
  private armies: Armies;
  private names: GroundNames;
  private raf = 0;
  private last = performance.now();
  private time = 0;
  private stopped = false;
  private paletteDirty = true;

  /** The realm has to be fetched first, so construction is async. */
  static async create(): Promise<Attract> {
    const map = REALMS[(Math.random() * REALMS.length) | 0];
    const session = await soloSession({
      name: "",
      map,
      seed: 1 + ((Math.random() * 99999) | 0),
      difficulty: Difficulty.Hard,
      clans: 250,
      kingdoms: DEFAULT_KINGDOMS[map],
      sandbox: false,
      spectate: true,
    });
    return new Attract(session);
  }

  private constructor(session: Session) {
    this.session = session;
    const state = this.session.state;
    this.terrain = new Terrain(this.session.realm, state);
    this.stage = new Stage(this.terrain, false);
    plantWoods(this.session.realm, this.terrain, this.stage.scene);
    this.stage.scene.add(this.effects.group);
    this.units = new Units(this.stage, this.terrain, state, this.effects);
    this.armies = new Armies(this.stage, this.terrain, state, this.effects);
    this.names = new GroundNames(
      this.stage.scene, this.terrain, state, this.stage.renderer.capabilities.getMaxAnisotropy(),
    );
    // Hurry through the opening, when nothing moves, then settle to a pace
    // at which the fronts visibly advance.
    this.session.speed = 8;
    this.session.onTick = (d) => {
      if (!state.inSpawnPhase) this.session.speed = 2;
      if (d.tiles.length > 0) this.terrain.tilesChanged();
      if (d.updates[GameUpdateType.Player].length > 0) this.paletteDirty = true;
      if (d.roadsChanged) this.terrain.syncRoads();
      this.armies.onTick(d);
      for (const u of d.died) this.units.forget(u);
    };
  }

  async start() {
    await this.session.start();
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
    this.stage.dispose();
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // Nothing to draw for a tab nobody is looking at.
    if (document.hidden) return;
    this.time += dt;
    const session = this.session;
    const alpha = Math.min(1, Math.max(0, (now - session.lastTickAt) / session.tickMs()));
    if (this.paletteDirty) {
      this.paletteDirty = false;
      this.terrain.syncPalette();
    }
    // A slow figure through the realm: low enough to see the armies.
    const t = this.time * 0.035;
    const w = this.terrain.width;
    const h = this.terrain.height;
    this.stage.orbit(
      t * 0.9, 0.5, 210 + Math.sin(t * 1.7) * 40, Math.sin(t) * w * 0.22, Math.sin(t * 2) * h * 0.14,
    );
    this.stage.update(dt);
    const u = this.terrain.uniforms;
    u.uTime.value = this.time;
    u.uFogNear.value = 500 + this.stage.distance * 1.2;
    u.uFogFar.value = 2400 + this.stage.distance * 3;
    this.units.update(alpha, dt, this.time);
    this.armies.update(dt, this.time);
    this.effects.update(this.time, window.innerHeight, this.stage.camera.fov);
    this.names.update();
    this.stage.render();
  }
}
