// The land and the sea. One displaced mesh for the ground whose shader also
// paints who owns each tile (read straight from the game's tile-state
// buffer), and one translucent plane for the water.

import * as THREE from "three";
import { GameState } from "../client/GameState";
import { clothId } from "../store/Cloths";
import { mulberry32, Noise, Realm } from "../worldgen/RealmGen";
import { CLOTH_GLSL, glyphAtlas } from "./Cloth";

const TERRAIN_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const COMMON = /* glsl */ `
precision highp float;
precision highp int;
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm2(vec2 p) {
  return vnoise(p) * 0.6 + vnoise(p * 2.7 + 13.1) * 0.4;
}`;

const TERRAIN_FRAG = /* glsl */ `
${COMMON}
${CLOTH_GLSL}
uniform sampler2D tState;
uniform sampler2D tPalette;
uniform sampler2D tHeight;
uniform sampler2D tRoads;
uniform sampler2D tTerrain;
uniform sampler2D tPattern;
uniform vec2 uMap;
uniform vec3 uSun;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform int uHover;
uniform float uSpawnPulse;
uniform vec4 uBlasts[4];
// Range rings: x, z, radius (tiles), kind (0 keep, 1 ballista, 2 market,
// 3 spacing, 4 blast: outer, 5 blast: inner). Rings of one kind are drawn as
// their union: one outline around the merged area, one flat fill inside.
uniform vec4 uRings[32];
uniform int uRingCount;
varying vec3 vWorld;

ivec2 stateAt(ivec2 t) {
  t = clamp(t, ivec2(0), ivec2(uMap) - 1);
  vec4 s = texelFetch(tState, t, 0);
  return ivec2(int(s.r * 255.0 + 0.5), int(s.g * 255.0 + 0.5));
}
int ownerOf(ivec2 s) { return s.x + (s.y & 15) * 256; }
bool landAt(ivec2 t) {
  return texelFetch(tTerrain, clamp(t, ivec2(0), ivec2(uMap) - 1), 0).r > 0.5;
}

void main() {
  vec2 tile = vWorld.xz + uMap * 0.5;
  vec2 uv = tile / uMap;
  vec2 px = 1.0 / uMap;
  float hL = texture(tHeight, uv - vec2(px.x, 0.0)).r;
  float hR = texture(tHeight, uv + vec2(px.x, 0.0)).r;
  float hD = texture(tHeight, uv - vec2(0.0, px.y)).r;
  float hU = texture(tHeight, uv + vec2(0.0, px.y)).r;
  vec3 n = normalize(vec3(hL - hR, 2.0, hD - hU));
  float h = vWorld.y;
  float slope = 1.0 - n.y;

  float big = fbm2(tile * 0.035);
  float fine = fbm2(tile * 0.45);
  vec3 grass = mix(vec3(0.29, 0.41, 0.19), vec3(0.43, 0.50, 0.25), big);
  grass *= 0.92 + fine * 0.16;
  vec3 heath = mix(vec3(0.50, 0.47, 0.27), vec3(0.42, 0.44, 0.24), fine);
  vec3 rock = mix(vec3(0.40, 0.38, 0.36), vec3(0.54, 0.51, 0.47), fine);
  vec3 snow = vec3(0.93, 0.95, 0.98);
  vec3 sand = vec3(0.80, 0.73, 0.53);

  vec3 col = mix(grass, heath, smoothstep(1.2, 2.2, h + big));
  col = mix(col, rock, clamp(smoothstep(2.6, 4.2, h) + smoothstep(0.16, 0.34, slope), 0.0, 1.0));
  col = mix(col, snow, smoothstep(4.4, 5.8, h + fine * 1.2) * (1.0 - smoothstep(0.35, 0.6, slope)));
  col = mix(sand, col, smoothstep(0.08, 0.5, h));
  if (h < 0.0) {
    col = mix(sand * 0.75, vec3(0.10, 0.19, 0.25), smoothstep(0.0, 2.5, -h));
  }


  ivec2 ti = ivec2(floor(tile));
  vec2 f = fract(tile);
  ivec2 st = stateAt(ti);
  float glow = 0.0;
  // What the game says this tile is, not what the smoothed mesh happens to
  // show: a one-tile islet is land and gets its owner's colour.
  bool isLand = landAt(ti);
  if (isLand && h < 0.1) col = sand;

  // Who holds this spot. The game works in square tiles; drawn as they are,
  // every border is a staircase. So each of the nine tiles around votes with
  // a smooth weight and the strongest claim wins, which rounds the corners.
  // Water has no vote, so a realm runs right out to the waterline wherever
  // the smoothed shore shows more dry ground than the tile grid has land.
  int cand[4];
  float cw[4];
  int nc = 0;
  vec2 d = f - 0.5;
  vec3 wx = vec3(0.5 * (0.5 - d.x) * (0.5 - d.x), 0.75 - d.x * d.x, 0.5 * (0.5 + d.x) * (0.5 + d.x));
  vec3 wy = vec3(0.5 * (0.5 - d.y) * (0.5 - d.y), 0.75 - d.y * d.y, 0.5 * (0.5 + d.y) * (0.5 + d.y));
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) {
      ivec2 t = ti + ivec2(i - 1, j - 1);
      if (!landAt(t)) continue;
      int id = ownerOf(stateAt(t));
      float w = wx[i] * wy[j];
      bool found = false;
      for (int k = 0; k < 4; k++) {
        if (k < nc && cand[k] == id) { cw[k] += w; found = true; }
      }
      if (!found && nc < 4) { cand[nc] = id; cw[nc] = w; nc++; }
    }
  }
  int o = 0;
  float best = 0.0, second = 0.0, total = 0.0;
  for (int k = 0; k < 4; k++) {
    if (k >= nc) break;
    total += cw[k];
    if (cw[k] > best) { second = best; best = cw[k]; o = cand[k]; }
    else if (cw[k] > second) second = cw[k];
  }
  // The mesh has one vertex for every four tiles, so a channel a tile or two
  // wide is bridged by dry ground. Where the game says water and the mesh
  // says land, paint the water on: every strait a longship must cross shows.
  float sea = -texture(tHeight, uv).r;
  bool wet = sea > 0.02 && h > -0.02;
  bool held = nc > 0 && !wet && (isLand || h > 0.0);
  if (held && o != 0) {
    vec4 pc = texelFetch(tPalette, ivec2(o & 63, o >> 6), 0);
    // The border runs where two claims are level.
    float margin = (best - second) / max(total, 1e-4);
    float fw = max(fwidth(tile.x), fwidth(tile.y));
    float edge = second > 0.0 ? 1.0 - smoothstep(0.0, max(0.26, fw * 1.1), margin) : 0.0;
    float lum = dot(col, vec3(0.3, 0.55, 0.15));
    vec3 fill = pc.rgb * (0.55 + lum * 0.9);
    // A bought cloth figures the realm's colour (see render/Cloth.ts).
    int pat = int(texelFetch(tPattern, ivec2(o & 63, o >> 6), 0).r * 255.0 + 0.5);
    fill = cloth(pat, tile, fill);
    float mine = step(0.99, pc.a);
    float ally = step(0.7, pc.a) * (1.0 - mine);
    float amount = 0.46;
    if (o == uHover) amount += 0.14 + 0.05 * sin(uTime * 5.0);
    col = mix(col, fill, amount);
    vec3 line = mix(pc.rgb * 0.42, vec3(1.0, 0.88, 0.45), mine * 0.85);
    line = mix(line, vec3(0.55, 0.95, 0.65), ally * 0.7);
    col = mix(col, line, edge * 0.92);
    if ((st.y & 64) != 0) {
      // Land under a keep's protection: a faint stone hatch.
      float hatch = step(0.82, fract((tile.x + tile.y) * 0.5));
      col = mix(col, pc.rgb * 0.35, hatch * 0.35);
    }
  }
  float road = texture(tRoads, uv).r;
  col = mix(col, vec3(0.62, 0.52, 0.36), smoothstep(0.2, 0.55, road) * 0.9);
  if (wet) {
    float ripple = fbm2(tile * 0.9 + vec2(uTime * 0.5, -uTime * 0.35));
    vec3 waterCol = mix(vec3(0.20, 0.52, 0.56), vec3(0.09, 0.30, 0.42), smoothstep(0.1, 1.2, sea));
    waterCol *= 0.9 + 0.22 * ripple;
    // Foam where it laps the bank.
    waterCol = mix(waterCol, vec3(0.93, 0.96, 0.97), (1.0 - smoothstep(0.02, 0.1, sea)) * 0.55);
    col = mix(col, waterCol, smoothstep(0.02, 0.05, sea));
    n = mix(n, vec3(0.0, 1.0, 0.0), 0.85);
  }
  if ((st.y & 32) != 0 && isLand) {
    // Scorched by sorcery: char, with embers still glowing in the cracks.
    float crack = fbm2(tile * 0.9 + 7.0);
    float ember = smoothstep(0.62, 0.78, crack) * (0.55 + 0.45 * sin(uTime * 2.0 + crack * 40.0));
    col = mix(col, vec3(0.07, 0.055, 0.05), 0.86);
    glow = ember;
  }

  float diff = max(dot(n, uSun), 0.0);
  vec3 lit = col * (vec3(0.42, 0.46, 0.55) + vec3(1.05, 0.97, 0.84) * diff * 0.85);
  lit += vec3(1.0, 0.42, 0.08) * glow * 0.9;
  if (uSpawnPulse > 0.0 && held && o == 0) {
    lit += vec3(0.25, 0.22, 0.08) * uSpawnPulse * (0.5 + 0.5 * sin(uTime * 3.0));
  }
  {
    float fw = max(fwidth(tile.x), fwidth(tile.y));
    float lw = max(0.7, fw * 1.6);
    // Per kind: are we inside the union, and how close to its outline.
    float insideK[6];
    float lineK[6];
    for (int k = 0; k < 6; k++) { insideK[k] = 0.0; lineK[k] = 0.0; }
    for (int i = 0; i < 32; i++) {
      if (i >= uRingCount) break;
      vec4 r = uRings[i];
      int k = int(r.w + 0.5);
      float d = distance(vWorld.xz, r.xy);
      if (d < r.z - lw) insideK[k] = 1.0;
      float line = 1.0 - smoothstep(0.0, lw, abs(d - r.z));
      if (line <= 0.0) continue;
      // Only an outline not buried inside another ring of the same kind.
      bool buried = false;
      for (int j = 0; j < 32; j++) {
        if (j >= uRingCount) break;
        if (j == i) continue;
        vec4 q = uRings[j];
        if (int(q.w + 0.5) != k) continue;
        if (distance(vWorld.xz, q.xy) < q.z - lw) { buried = true; break; }
      }
      if (buried) continue;
      if (k == 3) {
        // Spacing ring: dashed, so it reads as a limit rather than a reach.
        float ang = atan(vWorld.z - r.y, vWorld.x - r.x);
        line *= step(0.5, fract(ang * 6.0 / 3.14159));
      }
      lineK[k] = max(lineK[k], line);
    }
    for (int k = 0; k < 6; k++) {
      vec3 rc = k == 0 ? vec3(1.0, 0.5, 0.3)
              : k == 1 ? vec3(0.45, 0.8, 1.0)
              : k == 2 ? vec3(1.0, 0.85, 0.4)
              : k == 3 ? vec3(1.0, 1.0, 1.0)
              : k == 4 ? vec3(1.0, 0.35, 0.15)
              : vec3(1.0, 0.15, 0.05);
      float fill = k == 3 ? 0.0 : k == 4 ? 0.1 : k == 5 ? 0.18 : 0.07;
      lit = mix(lit, rc, lineK[k] * 0.9);
      lit += rc * insideK[k] * fill;
    }
  }
  for (int i = 0; i < 4; i++) {
    vec4 b = uBlasts[i];
    lit += vec3(1.0, 0.55, 0.2) * b.w * (1.0 - smoothstep(0.0, b.z, distance(vWorld.xz, b.xy)));
  }
  float dist = length(cameraPosition - vWorld);
  lit = mix(lit, uFog, smoothstep(uFogNear, uFogFar, dist) * 0.85);
  gl_FragColor = vec4(lit, 1.0);
}`;

const WATER_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D tHeight;
uniform vec2 uMap;
uniform vec3 uSun;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
varying vec3 vWorld;
void main() {
  vec2 tile = vWorld.xz + uMap * 0.5;
  vec2 uv = clamp(tile / uMap, vec2(0.001), vec2(0.999));
  float depth = -texture(tHeight, uv).r;
  vec2 outside = max(vec2(0.0), max(-tile, tile - uMap));
  depth = max(depth, min(6.0, length(outside) * 0.2 + depth));
  if (depth < -0.02) discard;

  // How many tiles one pixel covers. Waves finer than a pixel only shimmer,
  // so each layer of detail fades out before it gets that small: from high
  // up the sea is a calm gradient, and the chop and ripples come in as the
  // camera drops.
  float fw = max(fwidth(tile.x), fwidth(tile.y));
  float mid = 1.0 - smoothstep(0.08, 0.32, fw);
  float close = 1.0 - smoothstep(0.02, 0.09, fw);

  vec2 p = tile * 0.22;
  float t = uTime * 0.35;
  vec2 d1 = vec2(t, t * 0.6);
  vec2 d2 = vec2(t * 0.8, t * 0.3) - 5.0;
  float w1 = fbm2(p + d1);
  float w2 = fbm2(p * 1.9 - d2);
  vec2 slope = vec2(0.0);
  if (mid > 0.0) {
    float e = 0.35;
    vec2 px = p + vec2(e, 0.0);
    vec2 pz = p + vec2(0.0, e);
    slope = vec2(
      fbm2(px + d1) - w1 + fbm2(px * 1.9 - d2) - w2,
      fbm2(pz + d1) - w1 + fbm2(pz * 1.9 - d2) - w2) * 1.6 * mid;
  }
  if (close > 0.0) {
    vec2 q = tile * 1.7 + vec2(uTime * 0.9, -uTime * 0.6);
    float r0 = vnoise(q);
    slope += vec2(vnoise(q + vec2(0.3, 0.0)) - r0, vnoise(q + vec2(0.0, 0.3)) - r0) * 1.1 * close;
  }
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));

  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(view, n), 0.0), 3.0);
  vec3 shallow = vec3(0.20, 0.52, 0.56);
  vec3 deep = vec3(0.05, 0.17, 0.30);
  vec3 col = mix(shallow, deep, smoothstep(0.2, 4.5, depth));
  // A slow, broad swell so the open sea is not one flat colour from afar.
  col *= 0.93 + 0.14 * fbm2(tile * 0.02 + vec2(t * 0.06, -t * 0.04));
  col = mix(col, vec3(0.62, 0.74, 0.86), fres * 0.55);
  vec3 hv = normalize(view + uSun);
  float gl = max(dot(n, hv), 0.0);
  col += vec3(1.0, 0.93, 0.78) * (pow(gl, 120.0) * 0.8 * mid + pow(gl, 400.0) * 1.2 * close);
  col *= 0.86 + 0.28 * max(dot(n, uSun), 0.0);

  float surf = smoothstep(0.55, 0.0, depth);
  float lap = 0.5 + 0.5 * sin(depth * 9.0 - uTime * 1.8 + w1 * 6.0);
  float foam = surf * mix(0.4, smoothstep(0.35, 0.9, lap * 0.6 + w2 * 0.6), mid);
  col = mix(col, vec3(0.95, 0.97, 0.98), clamp(foam, 0.0, 1.0) * 0.85);

  float alpha = mix(0.55, 0.96, smoothstep(0.0, 2.2, depth));
  alpha = max(alpha, foam);
  float dist = length(cameraPosition - vWorld);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, dist) * 0.85);
  gl_FragColor = vec4(col, alpha);
}`;

export class Terrain {
  readonly width: number;
  readonly height: number;
  readonly heights: Float32Array;
  readonly group = new THREE.Group();
  readonly uniforms: Record<string, THREE.IUniform>;
  private stateTex: THREE.DataTexture;
  private paletteTex: THREE.DataTexture;
  private palette = new Uint8Array(64 * 64 * 4);
  private pattern = new Uint8Array(64 * 64);
  private patternTex: THREE.DataTexture;
  private roadTex: THREE.DataTexture;
  private roadData: Uint8Array<ArrayBuffer>;

  constructor(
    realm: Realm,
    private state: GameState,
  ) {
    const w = (this.width = realm.width);
    const h = (this.height = realm.height);
    this.heights = this.buildHeights(realm);

    const half = new Uint16Array(w * h);
    for (let i = 0; i < half.length; i++) {
      half[i] = THREE.DataUtils.toHalfFloat(this.heights[i]);
    }
    const heightTex = new THREE.DataTexture(
      half,
      w,
      h,
      THREE.RedFormat,
      THREE.HalfFloatType,
    );
    heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
    heightTex.wrapS = heightTex.wrapT = THREE.ClampToEdgeWrapping;
    heightTex.needsUpdate = true;

    const buf = state.map.tileStateBuffer();
    this.stateTex = new THREE.DataTexture(
      new Uint8Array(buf.buffer as ArrayBuffer, buf.byteOffset, buf.byteLength),
      w,
      h,
      THREE.RGFormat,
      THREE.UnsignedByteType,
    );
    this.stateTex.magFilter = this.stateTex.minFilter = THREE.NearestFilter;
    this.stateTex.needsUpdate = true;

    this.paletteTex = new THREE.DataTexture(
      this.palette,
      64,
      64,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.paletteTex.magFilter = this.paletteTex.minFilter = THREE.NearestFilter;
    this.paletteTex.needsUpdate = true;

    const terrainTex = new THREE.DataTexture(
      new Uint8Array(realm.terrain.buffer as ArrayBuffer, realm.terrain.byteOffset, realm.terrain.byteLength),
      w,
      h,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    terrainTex.magFilter = terrainTex.minFilter = THREE.NearestFilter;
    terrainTex.needsUpdate = true;

    this.patternTex = new THREE.DataTexture(this.pattern, 64, 64, THREE.RedFormat, THREE.UnsignedByteType);
    this.patternTex.magFilter = this.patternTex.minFilter = THREE.NearestFilter;
    this.patternTex.needsUpdate = true;

    this.roadData = new Uint8Array(w * h);
    this.roadTex = new THREE.DataTexture(
      this.roadData,
      w,
      h,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.roadTex.magFilter = this.roadTex.minFilter = THREE.LinearFilter;
    this.roadTex.needsUpdate = true;

    this.uniforms = {
      tState: { value: this.stateTex },
      tPalette: { value: this.paletteTex },
      tHeight: { value: heightTex },
      tRoads: { value: this.roadTex },
      tTerrain: { value: terrainTex },
      tPattern: { value: this.patternTex },
      tGlyphs: { value: glyphAtlas() },
      uMap: { value: new THREE.Vector2(w, h) },
      uSun: { value: new THREE.Vector3(0.45, 0.72, 0.35).normalize() },
      uFog: { value: new THREE.Color(0.66, 0.76, 0.86) },
      uFogNear: { value: 900 },
      uFogFar: { value: 3200 },
      uTime: { value: 0 },
      uHover: { value: 0 },
      uSpawnPulse: { value: 0 },
      uBlasts: {
        value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, 0)),
      },
      uRings: {
        value: Array.from({ length: 32 }, () => new THREE.Vector4(0, 0, 1, 0)),
      },
      uRingCount: { value: 0 },
    };

    const sx = w >> 1;
    const sy = h >> 1;
    const geo = new THREE.PlaneGeometry(w, h, sx, sy);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const tx = pos.getX(i) + w / 2 - 0.5;
      const ty = pos.getZ(i) + h / 2 - 0.5;
      pos.setY(i, this.vertexHeight(tx, ty));
    }
    geo.computeBoundingSphere();
    const land = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: TERRAIN_VERT,
        fragmentShader: TERRAIN_FRAG,
      }),
    );
    land.frustumCulled = false;
    this.group.add(land);

    const sea = new THREE.PlaneGeometry(w * 5, h * 5, 1, 1);
    sea.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(
      sea,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: TERRAIN_VERT,
        fragmentShader: WATER_FRAG,
        transparent: true,
        depthWrite: false,
      }),
    );
    water.renderOrder = 1;
    this.group.add(water);
  }

  private buildHeights(realm: Realm): Float32Array {
    const { width: w, height: h, elevation: e } = realm;
    const noise = new Noise(mulberry32(91));
    const raw = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const m = e[i];
        let v: number;
        if (m < 0) {
          v = -(0.3 + Math.min(-m, 26) * 0.2);
        } else if (m <= 10) {
          v = 0.22 + m * 0.11 + noise.fbm(x * 0.06, y * 0.06, 2) * 0.25 * (m / 10);
        } else if (m <= 20) {
          v = 1.1 + (m - 10) * 0.15 + noise.fbm(x * 0.05, y * 0.05, 3) * 0.45;
        } else {
          // Mountains read as mountains from afar but stay gentle enough that
          // a building on them sits on a slope, not a cliff.
          const k = (m - 20) / 10;
          v =
            2.5 +
            k * 2.6 +
            noise.ridged(x * 0.035, y * 0.035, 4) * (0.9 + k * 1.8) -
            0.7;
        }
        raw[i] = v;
      }
    }
    // One soft blur so the coast and the foothills are slopes, not steps.
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - 1);
        const x1 = Math.min(w - 1, x + 1);
        const c = raw[y * w + x];
        const s =
          raw[y0 * w + x0] + raw[y0 * w + x] + raw[y0 * w + x1] +
          raw[y * w + x0] + raw[y * w + x1] +
          raw[y1 * w + x0] + raw[y1 * w + x] + raw[y1 * w + x1];
        let v = c * 0.4 + (s / 8) * 0.6;
        // Keep land above the waterline and water below it.
        if (e[y * w + x] >= 0) v = Math.max(v, 0.2);
        else v = Math.min(v, -0.26);
        out[y * w + x] = v;
      }
    }
    return out;
  }

  /**
   * Height for a mesh vertex, which stands for a 2x2 block of tiles: the
   * highest of them, so a tile-wide islet or spit is not averaged under the
   * sea by its water neighbours.
   */
  private vertexHeight(tx: number, ty: number): number {
    let best = -Infinity;
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const x = Math.min(this.width - 1, Math.max(0, Math.round(tx) + dx));
        const y = Math.min(this.height - 1, Math.max(0, Math.round(ty) + dy));
        best = Math.max(best, this.heights[y * this.width + x]);
      }
    }
    return best;
  }

  /** Ground height at tile coordinates (tile centres are whole numbers). */
  heightAt(tx: number, ty: number): number {
    const w = this.width;
    const h = this.height;
    const x = Math.min(w - 1.001, Math.max(0, tx));
    const y = Math.min(h - 1.001, Math.max(0, ty));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const i = y0 * w + x0;
    const hs = this.heights;
    return (
      (hs[i] * (1 - fx) + hs[i + 1] * fx) * (1 - fy) +
      (hs[i + w] * (1 - fx) + hs[i + w + 1] * fx) * fy
    );
  }

  /** Height a thing standing on this tile should sit at (sea level on water). */
  surfaceAt(tx: number, ty: number): number {
    return Math.max(0, this.heightAt(tx, ty));
  }

  worldX(tx: number): number {
    return tx + 0.5 - this.width / 2;
  }
  worldZ(ty: number): number {
    return ty + 0.5 - this.height / 2;
  }
  tileX(wx: number): number {
    return wx + this.width / 2 - 0.5;
  }
  tileY(wz: number): number {
    return wz + this.height / 2 - 0.5;
  }

  /** Where a ray meets the ground or the sea, as tile coordinates. */
  pick(ray: THREE.Ray): { x: number; y: number; point: THREE.Vector3 } | null {
    const p = new THREE.Vector3();
    let t = 0;
    let prev = 0;
    const maxT = 6000;
    while (t < maxT) {
      p.copy(ray.direction).multiplyScalar(t).add(ray.origin);
      const ground = this.surfaceAt(this.tileX(p.x), this.tileY(p.z));
      const gap = p.y - ground;
      if (gap <= 0) {
        let lo = prev;
        let hi = t;
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2;
          p.copy(ray.direction).multiplyScalar(mid).add(ray.origin);
          if (p.y - this.surfaceAt(this.tileX(p.x), this.tileY(p.z)) > 0) lo = mid;
          else hi = mid;
        }
        const x = Math.round(this.tileX(p.x));
        const y = Math.round(this.tileY(p.z));
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
        return { x, y, point: p };
      }
      prev = t;
      t += Math.max(0.5, gap * 0.4);
    }
    return null;
  }

  tilesChanged() {
    this.stateTex.needsUpdate = true;
  }

  /** Repaint the palette: colour per player, alpha marks self and allies. */
  syncPalette() {
    const me = this.state.me;
    for (const p of this.state.players.values()) {
      const i = p.smallID * 4;
      this.palette[i] = Math.round(p.color[0] * 255);
      this.palette[i + 1] = Math.round(p.color[1] * 255);
      this.palette[i + 2] = Math.round(p.color[2] * 255);
      this.palette[i + 3] =
        p === me ? 255 : me && me.allies.includes(p.smallID) ? 200 : 128;
      this.pattern[p.smallID] = clothId(p.look.territory);
    }
    this.paletteTex.needsUpdate = true;
    this.patternTex.needsUpdate = true;
  }

  syncRoads() {
    this.roadData.fill(0);
    for (const road of this.state.roads.values()) {
      for (const t of road.tiles) this.roadData[t] = 255;
    }
    this.roadTex.needsUpdate = true;
  }
}
