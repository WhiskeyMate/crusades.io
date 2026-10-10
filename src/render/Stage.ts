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
  /** A box dragged out with shift held, in screen pixels: for choosing units. */
  onBox: (x0: number, y0: number, x1: number, y1: number) => void = () => {};
  /** True while the map is being dragged, so the cursor can show a closed hand. */
  dragging = false;
  private marquee: HTMLElement | null = null;

  private goal = { x: 0, z: 0, distance: 700, yaw: 0, pitch: 0.95 };
  private keys = new Set<string>();
  private ray = new THREE.Raycaster();
  private drag: {
    button: number;
    sx: number;
    sy: number;
    moved: boolean;
    box: boolean;
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
    // The browser can take the graphics away (a driver fault, too little
    // video memory, the card being handed to another program). Nothing is
    // drawn after that, so whoever owns the stage is told.
    canvas.addEventListener("webglcontextlost", () => {
      if (!this.closing) this.onLost?.();
    });
    // Phones have very dense screens and modest graphics chips: draw a little
    // under their full resolution there.
    const phone = window.matchMedia("(pointer: coarse)").matches;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, phone ? 1.5 : 2));
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
    canvas.addEventListener("pointerdown", (e) => (e.pointerType === "touch" ? this.touchDown(e) : this.down(e)));
    canvas.addEventListener("pointermove", (e) => (e.pointerType === "touch" ? this.touchMove(e) : this.move(e)));
    canvas.addEventListener("pointerup", (e) => (e.pointerType === "touch" ? this.touchUp(e) : this.up(e)));
    canvas.addEventListener("pointercancel", (e) => {
      this.drag = null;
      this.fingers.delete(e.pointerId);
      this.pinch = null;
      window.clearTimeout(this.pressTimer);
    });
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

  /** Called if the browser takes the graphics away while the stage is in use. */
  onLost?: () => void;
  private closing = false;

  dispose() {
    this.closing = true;
    this.canvas.dataset.closing = "1";
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

  // ---- Touch: one finger pans, two pinch to zoom and twist to turn, a tap
  // is a click, and a finger held still is a right-click.
  private fingers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; angle: number; mx: number; my: number } | null = null;
  private pressTimer = 0;
  /** True from a long press until that finger lifts, so the lift is not also a tap. */
  private pressed = false;

  private touchDown(e: PointerEvent) {
    this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    window.clearTimeout(this.pressTimer);
    if (this.fingers.size === 1) {
      this.pressed = false;
      this.down(e);
      const x = e.clientX;
      const y = e.clientY;
      this.pressTimer = window.setTimeout(() => {
        const d = this.drag;
        if (!d || d.moved || this.fingers.size !== 1) return;
        this.pressed = true;
        this.drag = null;
        navigator.vibrate?.(12);
        this.onClick(this.pick(x, y), 2, e);
      }, 480);
    } else if (this.fingers.size === 2) {
      // A second finger: this is a pinch, not a drag or a tap.
      this.drag = null;
      this.pinch = this.measure();
    }
  }

  private measure() {
    const [a, b] = Array.from(this.fingers.values());
    return {
      dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  }

  private touchMove(e: PointerEvent) {
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    f.x = e.clientX;
    f.y = e.clientY;
    if (this.fingers.size === 1) {
      this.move(e);
      return;
    }
    if (this.fingers.size !== 2 || !this.pinch) return;
    const now = this.measure();
    const was = this.pinch;
    // Zoom about the point between the fingers, as the wheel does about the cursor.
    const before = this.planePoint(was.mx, was.my);
    const next = Math.min(2600, Math.max(22, this.goal.distance * (was.dist / now.dist)));
    if (before) {
      const k = 1 - next / this.goal.distance;
      this.goal.x += (before.x - this.goal.x) * k;
      this.goal.z += (before.z - this.goal.z) * k;
    }
    this.goal.distance = next;
    // Twist to turn.
    let turn = now.angle - was.angle;
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    this.goal.yaw -= turn;
    // Both fingers sliding together moves the map.
    const from = this.planePoint(was.mx, was.my);
    const to = this.planePoint(now.mx, now.my);
    if (from && to) {
      this.goal.x += from.x - to.x;
      this.goal.z += from.z - to.z;
    }
    this.pinch = now;
  }

  private touchUp(e: PointerEvent) {
    window.clearTimeout(this.pressTimer);
    const count = this.fingers.size;
    this.fingers.delete(e.pointerId);
    if (count >= 2) {
      // Lifting out of a pinch: whatever finger remains does not start a drag or count as a tap.
      this.pinch = null;
      this.drag = null;
      this.pressed = true;
      return;
    }
    if (this.pressed) {
      this.pressed = false;
      this.drag = null;
      return;
    }
    // There is no hover on a touch screen: tell the game where the finger was first.
    if (this.drag && !this.drag.moved) this.onHover(this.pick(e.clientX, e.clientY), e);
    this.up(e);
  }

  private down(e: PointerEvent) {
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = {
      button: e.button,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      grab: e.button === 0 && !e.shiftKey ? this.planePoint(e.clientX, e.clientY) : null,
      box: e.button === 0 && e.shiftKey,
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
    if (d.box) {
      // Shift-drag: stretch a selection box instead of moving the map.
      if (!this.marquee) {
        this.marquee = document.createElement("div");
        this.marquee.className = "marquee";
        document.body.appendChild(this.marquee);
      }
      const m = this.marquee.style;
      m.left = `${Math.min(d.sx, e.clientX)}px`;
      m.top = `${Math.min(d.sy, e.clientY)}px`;
      m.width = `${Math.abs(e.clientX - d.sx)}px`;
      m.height = `${Math.abs(e.clientY - d.sy)}px`;
      return;
    }
    this.dragging = true;
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
    this.dragging = false;
    if (this.marquee) {
      this.marquee.remove();
      this.marquee = null;
    }
    if (d && d.box && d.moved) {
      this.onBox(Math.min(d.sx, e.clientX), Math.min(d.sy, e.clientY), Math.max(d.sx, e.clientX), Math.max(d.sy, e.clientY));
      return;
    }
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
