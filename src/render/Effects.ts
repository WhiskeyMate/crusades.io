// Fire, smoke, shockwaves and the dragon. Particles are simulated in the
// vertex shader: the CPU only writes a particle's birth state once.

import * as THREE from "three";
import { RGB } from "../client/Heraldry";

const P_VERT = /* glsl */ `
attribute vec3 aVel;
attribute vec3 aColor;
attribute vec4 aLife; // birth, life, size at birth, size at death
uniform float uTime;
uniform float uPx;
uniform float uGravity;
varying vec3 vColor;
varying float vT;
void main() {
  float age = uTime - aLife.x;
  float t = age / aLife.y;
  if (age < 0.0 || t > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec3 p = position + aVel * age * (1.0 - 0.4 * t);
  p.y += uGravity * age * age;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(900.0, mix(aLife.z, aLife.w, t) * uPx / max(1.0, -mv.z));
  vColor = aColor;
  vT = t;
}`;

const P_FRAG = /* glsl */ `
uniform float uAdditive;
varying vec3 vColor;
varying float vT;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, r);
  float fade = uAdditive > 0.5 ? pow(1.0 - vT, 1.4) : sin(3.14159 * sqrt(vT)) * 0.5;
  vec3 c = uAdditive > 0.5 ? mix(vColor, vColor * vec3(1.0, 0.45, 0.2), vT) : vColor;
  gl_FragColor = vec4(c, a * fade);
}`;

class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private life: Float32Array;
  private next = 0;
  private dirty = false;
  readonly material: THREE.ShaderMaterial;

  constructor(
    private max: number,
    additive: boolean,
    gravity: number,
  ) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.life = new Float32Array(max * 4).fill(-1000);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("aVel", new THREE.BufferAttribute(this.vel, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3));
    g.setAttribute("aLife", new THREE.BufferAttribute(this.life, 4));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPx: { value: 1000 },
        uGravity: { value: gravity },
        uAdditive: { value: additive ? 1 : 0 },
      },
      vertexShader: P_VERT,
      fragmentShader: P_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
  }

  emit(
    time: number,
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    r: number, g: number, b: number,
    life: number, s0: number, s1: number,
  ) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.life[i * 4] = time;
    this.life[i * 4 + 1] = life;
    this.life[i * 4 + 2] = s0;
    this.life[i * 4 + 3] = s1;
    this.dirty = true;
  }

  flush(time: number, px: number) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uPx.value = px;
    if (!this.dirty) return;
    this.dirty = false;
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.aVel.needsUpdate = true;
    a.aColor.needsUpdate = true;
    a.aLife.needsUpdate = true;
  }
}

interface Pulse {
  mesh: THREE.Mesh;
  t0: number;
  dur: number;
  r0: number;
  r1: number;
  flat: boolean;
}

export interface Blast {
  x: number;
  z: number;
  radius: number;
  t0: number;
  dur: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Dragon {
  readonly group = new THREE.Group();
  private wings: THREE.Mesh[] = [];
  private tail: THREE.Mesh[] = [];
  private phase = Math.random() * 6;

  constructor(color: RGB) {
    const hide = new THREE.MeshLambertMaterial({ color: 0x5c1512 });
    const belly = new THREE.MeshLambertMaterial({ color: 0xc9a25a });
    const membrane = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color[0] * 0.8 + 0.1, color[1] * 0.8, color[2] * 0.8),
      side: THREE.DoubleSide,
    });
    const horn = new THREE.MeshLambertMaterial({ color: 0x2a2320 });

    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hide);
    body.scale.set(0.9, 0.8, 2.4);
    this.group.add(body);
    const chest = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), belly);
    chest.scale.set(0.8, 0.6, 2.0);
    chest.position.set(0, -0.3, 0.2);
    this.group.add(chest);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.55, 2.2, 7), hide);
    neck.rotation.x = Math.PI / 2 - 0.35;
    neck.position.set(0, 0.5, 2.9);
    this.group.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.3), hide);
    head.position.set(0, 0.95, 4.2);
    this.group.add(head);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 1.1), belly);
    jaw.position.set(0, 0.6, 4.3);
    jaw.rotation.x = 0.25;
    this.group.add(jaw);
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.8, 5), horn);
      h.position.set(s * 0.25, 1.4, 3.7);
      h.rotation.x = -0.9;
      this.group.add(h);
      const eye = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.12, 0.16),
        new THREE.MeshBasicMaterial({ color: 0xffd040 }),
      );
      eye.position.set(s * 0.36, 1.05, 4.45);
      this.group.add(eye);
    }
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42 - i * 0.065, 0.5 - i * 0.065, 1.1, 6),
        hide,
      );
      seg.rotation.x = Math.PI / 2;
      seg.position.set(0, 0, -2.4 - i * 1.0);
      this.group.add(seg);
      this.tail.push(seg);
    }
    for (const s of [-1, 1]) {
      // prettier-ignore
      const v = new Float32Array([
        0, 0, 1.2,   s * 3.2, 0.3, 1.6,   s * 5.6, 0.1, -0.2,
        0, 0, 1.2,   s * 5.6, 0.1, -0.2,  s * 3.6, 0, -1.6,
        0, 0, 1.2,   s * 3.6, 0, -1.6,    s * 1.8, 0, -1.2,
        0, 0, 1.2,   s * 1.8, 0, -1.2,    0, 0, -1.4,
      ]);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(v, 3));
      g.computeVertexNormals();
      const wing = new THREE.Mesh(g, membrane);
      wing.position.set(s * 0.5, 0.5, 0.3);
      this.group.add(wing);
      this.wings.push(wing);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 5.8, 5), hide);
      arm.rotation.z = (s * Math.PI) / 2;
      arm.rotation.y = s * 0.25;
      arm.position.set(s * 2.8, 0.15, 0.6);
      wing.add(arm);
    }
  }

  animate(time: number) {
    const flap = Math.sin(time * 5.5 + this.phase);
    this.wings[0].rotation.z = flap * 0.55 + 0.1;
    this.wings[1].rotation.z = -flap * 0.55 - 0.1;
    for (let i = 0; i < this.tail.length; i++) {
      this.tail[i].position.x = Math.sin(time * 3 + i * 0.8) * 0.12 * i;
      this.tail[i].position.y = Math.sin(time * 5.5 + this.phase - 1 - i * 0.4) * 0.08 * i;
    }
    this.group.position.y += flap * -0.15;
  }
}

export class Effects {
  readonly group = new THREE.Group();
  /** Ground glow sources the terrain shader reads. */
  readonly blasts: Blast[] = [];
  private fire = new Particles(16000, true, -1.5);
  private smoke = new Particles(8000, false, 0.6);
  private pulses: Pulse[] = [];
  private ringGeo = new THREE.RingGeometry(0.93, 1, 72);
  private domeGeo = new THREE.IcosahedronGeometry(1, 3);
  time = 0;

  constructor() {
    this.ringGeo.rotateX(-Math.PI / 2);
    this.group.add(this.smoke.points, this.fire.points);
  }

  update(time: number, viewportHeight: number, fovDeg: number) {
    this.time = time;
    const px = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.fire.flush(time, px);
    this.smoke.flush(time, px);
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      const t = (time - p.t0) / p.dur;
      if (t >= 1) {
        this.group.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.pulses.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - t, 3);
      const r = p.r0 + (p.r1 - p.r0) * e;
      p.mesh.scale.set(r, p.flat ? 1 : r, r);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - t, 1.6) * (p.flat ? 0.55 : 0.8);
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      if (time - this.blasts[i].t0 > this.blasts[i].dur) this.blasts.splice(i, 1);
    }
  }

  private pulse(
    pos: THREE.Vector3, color: number, r0: number, r1: number, dur: number, flat: boolean,
  ) {
    const mesh = new THREE.Mesh(
      flat ? this.ringGeo : this.domeGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.copy(pos);
    if (flat) mesh.position.y += 0.6;
    mesh.renderOrder = 5;
    this.group.add(mesh);
    this.pulses.push({ mesh, t0: this.time, dur, r0, r1, flat });
  }

  /** A burning trail behind something flying. */
  trail(p: THREE.Vector3, size: number, hue: "fire" | "star" | "arcane" = "fire") {
    const t = this.time;
    const c = hue === "fire" ? [1.0, 0.62, 0.2] : hue === "star" ? [0.75, 0.85, 1.0] : [0.6, 0.95, 1.0];
    for (let i = 0; i < 3; i++) {
      this.fire.emit(
        t, p.x + rnd(-0.3, 0.3) * size, p.y + rnd(-0.3, 0.3) * size, p.z + rnd(-0.3, 0.3) * size,
        rnd(-1, 1) * size, rnd(-0.5, 1) * size, rnd(-1, 1) * size,
        c[0], c[1], c[2], rnd(0.5, 1.1), size * 2.6, size * 0.4,
      );
    }
    if (Math.random() < 0.6) {
      this.smoke.emit(
        t, p.x, p.y, p.z, rnd(-0.6, 0.6) * size, rnd(0.2, 1.2) * size, rnd(-0.6, 0.6) * size,
        0.2, 0.18, 0.17, rnd(1.5, 2.8), size * 1.5, size * 5,
      );
    }
  }

  /** A sorcerous detonation on the ground; radius is in tiles. */
  explode(pos: THREE.Vector3, radius: number, kind: "fireball" | "dragon" | "star") {
    const t = this.time;
    const big = kind === "dragon";
    const dur = big ? 4.2 : 2.6;
    this.pulse(pos, 0xffc266, radius * 0.1, radius * 0.75, dur * 0.55, false);
    this.pulse(pos, 0xff7a2a, radius * 0.2, radius * 1.15, dur * 0.8, true);
    this.pulse(pos, 0xfff1c9, radius * 0.1, radius * 1.6, dur * 0.5, true);
    this.blasts.push({ x: pos.x, z: pos.z, radius: radius * 1.8, t0: t, dur: dur * 1.6 });
    const n = big ? 900 : kind === "star" ? 160 : 380;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * radius * 0.85;
      const up = rnd(0.2, 1);
      const sp = radius * rnd(0.15, 0.6);
      this.fire.emit(
        t + rnd(0, 0.25), pos.x + Math.cos(a) * d * 0.4, pos.y + rnd(0, radius * 0.15), pos.z + Math.sin(a) * d * 0.4,
        Math.cos(a) * sp, up * radius * 0.55, Math.sin(a) * sp,
        1.0, rnd(0.45, 0.8), rnd(0.1, 0.3), rnd(1.0, dur), radius * rnd(0.25, 0.6), radius * 0.08,
      );
    }
    const s = big ? 420 : kind === "star" ? 60 : 170;
    for (let i = 0; i < s; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * radius * 0.7;
      const g = rnd(0.12, 0.28);
      this.smoke.emit(
        t + rnd(0.1, 1.2), pos.x + Math.cos(a) * d, pos.y + rnd(0, 2), pos.z + Math.sin(a) * d,
        Math.cos(a) * radius * 0.06, rnd(0.25, 0.9) * radius * 0.3, Math.sin(a) * radius * 0.06,
        g + 0.12, g + 0.1, g + 0.09, rnd(3.5, 7.5), radius * 0.3, radius * rnd(0.6, 1.1),
      );
    }
    if (big) {
      // Pillars of flame where the dragon's breath took hold.
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * radius * 0.8;
        const x = pos.x + Math.cos(a) * d;
        const z = pos.z + Math.sin(a) * d;
        for (let i = 0; i < 26; i++) {
          this.fire.emit(
            t + rnd(0.3, 3.0), x + rnd(-2, 2), pos.y, z + rnd(-2, 2),
            rnd(-1, 1), rnd(8, 22), rnd(-1, 1),
            1.0, rnd(0.4, 0.7), 0.12, rnd(1.2, 2.6), radius * 0.16, radius * 0.03,
          );
        }
      }
    }
  }

  /** Something shot out of the sky. */
  airburst(pos: THREE.Vector3, size: number) {
    this.pulse(pos, 0xfff0c0, size * 0.3, size * 3.5, 0.8, false);
    for (let i = 0; i < 70; i++) {
      const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(size * rnd(2, 9));
      this.fire.emit(this.time, pos.x, pos.y, pos.z, v.x, v.y, v.z, 1, rnd(0.6, 0.9), 0.3, rnd(0.6, 1.5), size * 1.6, size * 0.2);
    }
    for (let i = 0; i < 20; i++) {
      this.smoke.emit(this.time, pos.x, pos.y, pos.z, rnd(-3, 3), rnd(-1, 3), rnd(-3, 3), 0.3, 0.28, 0.27, rnd(2, 4), size * 2, size * 7);
    }
  }

  /** Splash, dust or splinters: a small local puff. */
  puff(pos: THREE.Vector3, size: number, kind: "dust" | "splash" | "spark") {
    const t = this.time;
    const c = kind === "dust" ? [0.55, 0.48, 0.38] : kind === "splash" ? [0.85, 0.92, 0.97] : [1, 0.8, 0.4];
    const sys = kind === "spark" ? this.fire : this.smoke;
    const n = kind === "spark" ? 10 : 12;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.5, 2.2) * size;
      sys.emit(
        t, pos.x, pos.y + 0.2, pos.z, Math.cos(a) * sp, rnd(1, 3.5) * size, Math.sin(a) * sp,
        c[0], c[1], c[2], rnd(0.5, 1.3), size * 0.8, size * (kind === "spark" ? 0.2 : 2.6),
      );
    }
  }

  /** A wisp of dust kicked up by marching feet. */
  dust(x: number, y: number, z: number, size: number) {
    this.smoke.emit(
      this.time, x, y + 0.2, z, rnd(-0.6, 0.6) * size, rnd(0.4, 1.2) * size, rnd(-0.6, 0.6) * size,
      0.6, 0.53, 0.42, rnd(0.8, 1.6), size * 0.9, size * 2.8,
    );
  }

  /** Dragon's breath, poured at the ground ahead. */
  breath(from: THREE.Vector3, dir: THREE.Vector3, size: number) {
    for (let i = 0; i < 6; i++) {
      this.fire.emit(
        this.time, from.x, from.y, from.z,
        dir.x * size * rnd(10, 18) + rnd(-2, 2) * size, dir.y * size * rnd(10, 18), dir.z * size * rnd(10, 18) + rnd(-2, 2) * size,
        1.0, rnd(0.5, 0.8), 0.15, rnd(0.5, 1.0), size * 1.5, size * 5,
      );
    }
  }
}
