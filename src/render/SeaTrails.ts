// The ribbons longships lay on the water: one flat band per ship, from where
// it put to sea to where it is now, figured in its owner's chosen trail. All
// ribbons share one mesh that is rewritten each frame.

import * as THREE from "three";
import { ATLAS_COLS, ATLAS_ROWS } from "../store/Cloths";
import { Trail } from "../store/Trails";
import { glyphAtlas, NOISE_GLSL } from "./Cloth";

const VERT = /* glsl */ `
attribute vec2 aUv;
attribute vec3 aA;
attribute vec3 aB;
attribute vec3 aC;
attribute vec3 aStyle; // style, glyph, opacity
varying vec2 vUv;
varying vec3 vA;
varying vec3 vB;
varying vec3 vC;
varying vec3 vStyle;
void main() {
  vUv = aUv;
  vA = aA;
  vB = aB;
  vC = aC;
  vStyle = aStyle;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// vUv.x runs along the ribbon in ribbon-widths (so every pattern keeps its
// shape whatever the width); vUv.y runs across it, 0 to 1.
const FRAG = /* glsl */ `
${NOISE_GLSL}
uniform sampler2D tGlyphs;
uniform float uTime;
varying vec2 vUv;
varying vec3 vA;
varying vec3 vB;
varying vec3 vC;
varying vec3 vStyle;
vec3 cycle(float t) {
  t = fract(t) * 3.0;
  if (t < 1.0) return mix(vA, vB, t);
  if (t < 2.0) return mix(vB, vC, t - 1.0);
  return mix(vC, vA, t - 2.0);
}
vec3 hue(float t) {
  return 0.55 + 0.45 * cos(6.2832 * (t + vec3(0.0, 0.33, 0.67)));
}
void main() {
  float u = vUv.x;
  float v = vUv.y;
  float c = abs(v - 0.5) * 2.0; // 0 on the centre line, 1 at either edge
  int style = int(vStyle.x + 0.5);
  vec3 col = vA;
  float alpha = 1.0;
  if (style == 1) col = cycle(u * 0.09);
  else if (style == 2) col = cycle(uTime * 0.22);
  else if (style == 3) col = c < 0.3 ? vA : c < 0.42 ? vC : vB;
  else if (style == 4) col = mix(vA, vB, step(0.5, fract((u + c * 0.55) * 0.9)));
  else if (style == 5) col = mix(vA, vB, mod(floor(u * 2.0) + floor(v * 2.0), 2.0));
  else if (style == 6) col = mix(vA, vB, step(0.5, fract((u + v) * 0.8)));
  else if (style == 7) col = (c < 0.13 && fract(u * 0.6) < 0.55) ? vB : vA;
  else if (style == 8) col = hue(u * 0.07);
  else if (style == 9) col = hue(u * 0.07 - uTime * 0.35);
  else if (style == 10) {
    float gi = floor(vStyle.y + 0.5);
    vec2 cell = vec2(mod(gi, ${ATLAS_COLS}.0), floor(gi / ${ATLAS_COLS}.0));
    // The glyph stands upright as you look along the ship's course.
    vec2 f = vec2(1.0 - v, 1.0 - fract(u * 0.8)) * 0.86 + 0.07;
    vec4 g = texture2D(tGlyphs, vec2((cell.x + f.x) / ${ATLAS_COLS}.0, 1.0 - (cell.y + f.y) / ${ATLAS_ROWS}.0));
    col = mix(vA, g.rgb, g.a);
  }
  else if (style == 11) col = c + 0.16 * cos(u * 7.0) > 0.66 ? vB : vA;
  else if (style == 12) {
    float n = fbm2(vec2(u * 1.6 - uTime * 2.2, v * 3.0 + uTime * 0.4));
    float heat = n + (1.0 - c) * 0.45;
    col = mix(vA, vB, smoothstep(0.35, 0.7, heat));
    col = mix(col, vC, smoothstep(0.8, 1.05, heat));
    alpha = smoothstep(1.25, 0.75, c + n * 0.55);
  }
  else if (style == 13) {
    vec2 g = vec2(u * 3.0, v * 4.0);
    float h = hash21(floor(g));
    float tw = 0.5 + 0.5 * sin(uTime * 3.0 + h * 40.0);
    float d = length(fract(g) - 0.5);
    col = mix(vA, vB, step(0.72, h) * tw * (1.0 - smoothstep(0.12, 0.36, d)));
  }
  else if (style == 14) col = v < 0.3333 ? vA : v < 0.6667 ? vB : vC;

  // A dark hem so the ribbon reads on any water, then a soft edge.
  if (style != 12) col = mix(col, col * 0.22, smoothstep(0.8, 0.88, c));
  alpha *= 1.0 - smoothstep(0.93, 1.0, c);
  alpha *= vStyle.z;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha * 0.94);
}`;

/** Floats per vertex: position 3, uv 2, three colours 9, style 3. */
const STRIDE = 17;

export class SeaTrails {
  readonly mesh: THREE.Mesh;
  private data: Float32Array;
  private index: Uint32Array;
  private buffer: THREE.InterleavedBuffer;
  private geo: THREE.BufferGeometry;
  private uniforms: Record<string, THREE.IUniform>;
  private nv = 0;
  private ni = 0;

  constructor(parent: THREE.Object3D, private maxVerts = 120000) {
    this.data = new Float32Array(maxVerts * STRIDE);
    this.index = new Uint32Array(maxVerts * 3);
    this.buffer = new THREE.InterleavedBuffer(this.data, STRIDE);
    this.buffer.setUsage(THREE.DynamicDrawUsage);
    this.geo = new THREE.BufferGeometry();
    const attr = (name: string, size: number, offset: number) =>
      this.geo.setAttribute(name, new THREE.InterleavedBufferAttribute(this.buffer, size, offset));
    attr("position", 3, 0);
    attr("aUv", 2, 3);
    attr("aA", 3, 5);
    attr("aB", 3, 8);
    attr("aC", 3, 11);
    attr("aStyle", 3, 14);
    const idx = new THREE.BufferAttribute(this.index, 1);
    idx.setUsage(THREE.DynamicDrawUsage);
    this.geo.setIndex(idx);
    this.uniforms = { tGlyphs: { value: glyphAtlas() }, uTime: { value: 0 } };
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
  }

  begin(time: number) {
    this.nv = 0;
    this.ni = 0;
    this.uniforms.uTime.value = time;
  }

  /**
   * One ribbon through `n` points (world x in xs, z in zs), `width` across,
   * lying at height `y`. `team` is the owner's colour, for trails that use it.
   */
  add(xs: ArrayLike<number>, zs: ArrayLike<number>, n: number, y: number, width: number, trail: Trail, team: readonly number[]) {
    if (n < 2 || this.nv + n * 2 > this.maxVerts) return;
    const ink = (i: number) => {
      const c = trail.colors[i];
      return c === "team" ? team : c;
    };
    const a = ink(0);
    const b = ink(1);
    const c = ink(2);
    const half = width / 2;
    const d = this.data;
    const first = this.nv;
    let along = 0;
    for (let i = 0; i < n; i++) {
      const p = Math.max(0, i - 1);
      const q = Math.min(n - 1, i + 1);
      let tx = xs[q] - xs[p];
      let tz = zs[q] - zs[p];
      const len = Math.hypot(tx, tz) || 1;
      tx /= len;
      tz /= len;
      if (i > 0) along += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
      // The ribbon fades in over its first width, so it has no hard square end.
      const fade = Math.min(1, along / width + 0.15);
      for (let side = 0; side < 2; side++) {
        const s = side === 0 ? -1 : 1;
        let o = this.nv * STRIDE;
        d[o++] = xs[i] - tz * half * s;
        d[o++] = y;
        d[o++] = zs[i] + tx * half * s;
        d[o++] = along / width;
        d[o++] = side;
        d[o++] = a[0]; d[o++] = a[1]; d[o++] = a[2];
        d[o++] = b[0]; d[o++] = b[1]; d[o++] = b[2];
        d[o++] = c[0]; d[o++] = c[1]; d[o++] = c[2];
        d[o++] = trail.style;
        d[o++] = trail.glyph ?? 0;
        d[o++] = fade;
        this.nv++;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const v = first + i * 2;
      this.index[this.ni++] = v;
      this.index[this.ni++] = v + 1;
      this.index[this.ni++] = v + 2;
      this.index[this.ni++] = v + 1;
      this.index[this.ni++] = v + 3;
      this.index[this.ni++] = v + 2;
    }
  }

  end() {
    this.geo.setDrawRange(0, this.ni);
    // Send only what was written: the buffers are sized for a sea full of ships.
    const idx = this.geo.index as THREE.BufferAttribute;
    this.buffer.clearUpdateRanges();
    idx.clearUpdateRanges();
    if (this.nv === 0) return;
    this.buffer.addUpdateRange(0, this.nv * STRIDE);
    idx.addUpdateRange(0, this.ni);
    this.buffer.needsUpdate = true;
    idx.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
