// Renderer, lights and the camera rig. The camera orbits a point on the
// ground: drag to pan, wheel to zoom at the cursor, right-drag (or Q/E, R/F)
// to turn and tilt.

import * as THREE from "three";
import { Terrain } from "./Terrain";

export interface PickHit {
  x: number;
  y: number;
  point: THREE.Vector3;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 2, 9000);
  readonly sun = new THREE.Vector3(0.45, 0.72, 0.35).normalize();

  target = new THREE.Vector3();
  distance = 700;
  yaw = 0;
  pitch = 0.95;

  onClick: (hit: PickHit | null, button: number, ev: PointerEvent) => void = () => {};
  onHover: (hit: PickHit | null, ev: PointerEvent) => void = () => {};

  private goal = { x: 0, z: 0, distance: 700, yaw: 0, pitch: 0.95 };
  private keys = new Set<string>();
  private ray = new THREE.Raycaster();
  private drag: {
    button: number;
    sx: number;
    sy: number;
    moved: boolean;
    grab: THREE.Vector3 | null;
  } | null = null;

  readonly canvas: HTMLCanvasElement;
  private life = new AbortController();

  /**
   * @param interactive false for a backdrop nobody steers (the landing page)
   */
  constructor(
    readonly terrain: Terrain,
    interactive = true,
  ) {
    // A fresh canvas each time: a WebGL context can't be handed from one
    // renderer to the next.
    const old = document.getElementById("stage")!;
    const canvas = (this.canvas = document.createElement("canvas"));
    canvas.id = "stage";
    old.replaceWith(canvas);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0.66, 0.76, 0.86);
    this.scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x4a4436, 1.25));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
    sun.position.copy(this.sun).multiplyScalar(1000);
    this.scene.add(sun);
    this.scene.add(terrain.group);

    this.goal.distance = this.distance = Math.max(terrain.width, terrain.height) * 0.85;
    this.resize();
    const on = { signal: this.life.signal };
    window.addEventListener("resize", () => this.resize(), on);
    if (!interactive) return;
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", () => (this.drag = null));
    canvas.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener(
      "keydown",
      (e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        this.keys.add(e.code);
      },
      on,
    );
    window.addEventListener("keyup", (e) => this.keys.delete(e.code), on);
    window.addEventListener("blur", () => this.keys.clear(), on);
  }

  dispose() {
    this.life.abort();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  /** Turn the camera by hand (the landing page's slow orbit). */
  orbit(yaw: number, pitch: number, distance: number, x: number, z: number) {
    this.goal.yaw = yaw;
    this.goal.pitch = pitch;
    this.goal.distance = distance;
    this.goal.x = x;
    this.goal.z = z;
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  pick(clientX: number, clientY: number): PickHit | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
    this.ray.setFromCamera(ndc, this.camera);
    return this.terrain.pick(this.ray.ray);
  }

  /** Where the cursor's ray crosses the sea-level plane. */
  private planePoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
    this.ray.setFromCamera(ndc, this.camera);
    const { origin, direction } = this.ray.ray;
    if (direction.y > -0.01) return null;
    const t = -origin.y / direction.y;
    return origin.clone().addScaledVector(direction, t);
  }

  private down(e: PointerEvent) {
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = {
      button: e.button,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      grab: e.button === 0 ? this.planePoint(e.clientX, e.clientY) : null,
    };
  }

  private move(e: PointerEvent) {
    const d = this.drag;
    if (!d) {
      this.onHover(this.pick(e.clientX, e.clientY), e);
      return;
    }
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) {
      d.moved = true;
    }
    if (!d.moved) return;
    if (d.button === 0 && d.grab) {
      const now = this.planePoint(e.clientX, e.clientY);
      if (now) {
        this.goal.x += d.grab.x - now.x;
        this.goal.z += d.grab.z - now.z;
        this.target.x = this.goal.x;
        this.target.z = this.goal.z;
        this.place();
      }
    } else if (d.button !== 0) {
      this.goal.yaw -= e.movementX * 0.005;
      this.goal.pitch = Math.min(1.5, Math.max(0.35, this.goal.pitch + e.movementY * 0.004));
    }
  }

  private up(e: PointerEvent) {
    const d = this.drag;
    this.drag = null;
    if (d && !d.moved) this.onClick(this.pick(e.clientX, e.clientY), d.button, e);
  }

  private wheel(e: WheelEvent) {
    e.preventDefault();
    const before = this.planePoint(e.clientX, e.clientY);
    const factor = Math.exp(Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.16);
    const next = Math.min(2600, Math.max(22, this.goal.distance * factor));
    if (before) {
      // Keep the point under the cursor where it is.
      const k = 1 - next / this.goal.distance;
      this.goal.x += (before.x - this.goal.x) * k;
      this.goal.z += (before.z - this.goal.z) * k;
    }
    this.goal.distance = next;
  }

  focus(tx: number, ty: number, distance?: number) {
    this.goal.x = this.terrain.worldX(tx);
    this.goal.z = this.terrain.worldZ(ty);
    if (distance !== undefined) this.goal.distance = distance;
  }

  /** How much to blow models up so they stay readable from afar. */
  get unitScale(): number {
    return Math.min(9, Math.max(1, this.distance / 110));
  }

  update(dt: number) {
    const k = this.keys;
    const speed = this.goal.distance * 0.9 * dt;
    let fx = 0;
    let fz = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) fz -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) fz += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) fx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) fx += 1;
    if (fx || fz) {
      const s = Math.sin(this.yaw);
      const c = Math.cos(this.yaw);
      this.goal.x += (fx * c + fz * s) * speed;
      this.goal.z += (fz * c - fx * s) * speed;
    }
    if (k.has("KeyQ")) this.goal.yaw += dt * 1.4;
    if (k.has("KeyE")) this.goal.yaw -= dt * 1.4;
    if (k.has("KeyR")) this.goal.pitch = Math.min(1.5, this.goal.pitch + dt);
    if (k.has("KeyF")) this.goal.pitch = Math.max(0.35, this.goal.pitch - dt);

    const hw = this.terrain.width / 2;
    const hh = this.terrain.height / 2;
    this.goal.x = Math.min(hw, Math.max(-hw, this.goal.x));
    this.goal.z = Math.min(hh, Math.max(-hh, this.goal.z));

    const a = 1 - Math.exp(-dt * 12);
    this.target.x += (this.goal.x - this.target.x) * a;
    this.target.z += (this.goal.z - this.target.z) * a;
    this.distance += (this.goal.distance - this.distance) * a;
    this.yaw += (this.goal.yaw - this.yaw) * a;
    this.pitch += (this.goal.pitch - this.pitch) * a;
    this.place();
  }

  private place() {
    const t = this.terrain;
    const ground = t.surfaceAt(t.tileX(this.target.x), t.tileY(this.target.z));
    this.target.y += (ground - this.target.y) * 0.2;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    // Never dip under the hills.
    const under =
      t.surfaceAt(t.tileX(this.camera.position.x), t.tileY(this.camera.position.z)) + 3;
    if (this.camera.position.y < under) this.camera.position.y = under;
    this.camera.lookAt(this.target);
    this.camera.near = Math.max(1, this.distance * 0.02);
    this.camera.far = this.distance * 4 + 4000;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
