// Procedural realm generator. Produces the terrain files the engine expects
// (same byte layout as its map.bin / map4x.bin / map16x.bin) plus a smooth
// height field for the 3D renderer, all from a seed.
//
// Terrain byte: bit 7 land, bit 6 shoreline, bit 5 ocean, bits 0-4 magnitude
// (land: elevation 0-30, water: distance to land / 2).

import {
  GameMapSize,
  GameMapType,
} from "@crusades/engine-api/game/GameTypes";
import {
  MapFiles,
  MapManifest,
  Nation,
} from "@crusades/engine-api/game/MapFiles";

export type RealmStyle = "continent" | "isles" | "twin" | "inland";

export const REALM_STYLES: Record<GameMapType, RealmStyle> = {
  [GameMapType.Aldermark]: "continent",
  [GameMapType.SunderedIsles]: "isles",
  [GameMapType.TwinCrowns]: "twin",
  [GameMapType.Middenmere]: "inland",
};

export interface RealmOptions {
  map: GameMapType;
  seed: number;
  width?: number;
  height?: number;
  kingdoms?: number;
}

export interface Realm {
  /** Handed to the engine, which takes the buffers over. */
  files: MapFiles;
  width: number;
  height: number;
  /** A copy of the full-size terrain bytes for the client. */
  terrain: Uint8Array;
  numLandTiles: number;
  /**
   * Per tile: land elevation as a continuous 0..30 magnitude, water as
   * minus the distance to land in tiles.
   */
  elevation: Float32Array;
}

const MIN_ISLAND = 30;
const MIN_LAKE = 200;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Noise {
  private perm = new Uint8Array(512);
  constructor(rand: () => number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private grad(h: number, x: number, y: number): number {
    switch (h & 7) {
      case 0:
        return x + y;
      case 1:
        return x - y;
      case 2:
        return -x + y;
      case 3:
        return -x - y;
      case 4:
        return x;
      case 5:
        return -x;
      case 6:
        return y;
      default:
        return -y;
    }
  }

  /** Perlin noise, roughly -1..1. */
  at(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const p = this.perm;
    const X = xi & 255;
    const Y = yi & 255;
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    const x1 = this.grad(aa, xf, yf) * (1 - u) + this.grad(ba, xf - 1, yf) * u;
    const x2 =
      this.grad(ab, xf, yf - 1) * (1 - u) + this.grad(bb, xf - 1, yf - 1) * u;
    return (x1 * (1 - v) + x2 * v) * 0.9;
  }

  fbm(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += this.at(x * f, y * f) * amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum;
  }

  ridged(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.at(x * f, y * f));
      sum += n * n * amp;
      amp *= 0.5;
      f *= 2.1;
    }
    return sum;
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Shape bias per layout: positive pulls up land, negative sinks it. */
function shape(style: RealmStyle, u: number, v: number, aspect: number) {
  // u, v in -1..1 from the map centre.
  const edge = Math.max(Math.abs(u), Math.abs(v));
  const rim = -1.6 * smooth(0.82, 1.0, edge);
  switch (style) {
    case "continent": {
      const d = Math.hypot(u * 0.95, v * 1.05);
      return 0.42 - d * d * 0.95 + rim;
    }
    case "isles":
      return -0.02 + rim;
    case "twin": {
      const dl = Math.hypot((u + 0.5) * 1.5, v * 1.05);
      const dr = Math.hypot((u - 0.5) * 1.5, v * 1.05);
      const d = Math.min(dl, dr);
      const strait = -0.35 * (1 - smooth(0.0, 0.16, Math.abs(u)));
      return 0.4 - d * d * 1.25 + strait + rim;
    }
    case "inland": {
      const d = Math.hypot(u * (aspect > 1 ? 1 : aspect), v);
      return -0.5 + smooth(0.2, 0.75, d) * 0.95;
    }
  }
}

const LAND_FRACTION: Record<RealmStyle, number> = {
  continent: 0.44,
  isles: 0.3,
  twin: 0.4,
  inland: 0.62,
};

/** Labels 4-connected regions of equal `kind`; returns sizes by label. */
function label(
  kind: Uint8Array,
  w: number,
  h: number,
): { labels: Int32Array; sizes: number[] } {
  const n = w * h;
  const labels = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (labels[s] !== -1) continue;
    const id = sizes.length;
    const k = kind[s];
    let top = 0;
    let size = 0;
    stack[top++] = s;
    labels[s] = id;
    while (top > 0) {
      const t = stack[--top];
      size++;
      const x = t % w;
      if (x > 0 && labels[t - 1] === -1 && kind[t - 1] === k) {
        labels[t - 1] = id;
        stack[top++] = t - 1;
      }
      if (x < w - 1 && labels[t + 1] === -1 && kind[t + 1] === k) {
        labels[t + 1] = id;
        stack[top++] = t + 1;
      }
      if (t >= w && labels[t - w] === -1 && kind[t - w] === k) {
        labels[t - w] = id;
        stack[top++] = t - w;
      }
      if (t < n - w && labels[t + w] === -1 && kind[t + w] === k) {
        labels[t + w] = id;
        stack[top++] = t + w;
      }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

/** Sinks tiny islands and (optionally) fills tiny lakes, in place. */
function removeSmall(
  land: Uint8Array,
  mag: Float32Array,
  w: number,
  h: number,
  minIsland: number,
  minLake: number,
) {
  const { labels, sizes } = label(land, w, h);
  for (let i = 0; i < land.length; i++) {
    const size = sizes[labels[i]];
    if (land[i] === 1 && size < minIsland) {
      land[i] = 0;
      mag[i] = 0;
    } else if (land[i] === 0 && minLake > 0 && size < minLake) {
      land[i] = 1;
      mag[i] = 0;
    }
  }
}

interface Layer {
  w: number;
  h: number;
  land: Uint8Array;
  mag: Float32Array;
}

interface Packed {
  data: Uint8Array;
  numLand: number;
  /** Water distance to land in tiles (0 on land). */
  dist: Uint16Array;
}

/** Ocean flag, shoreline bits, water depth, then the engine's byte layout. */
function pack(layer: Layer): Packed {
  const { w, h, land, mag } = layer;
  const n = w * h;
  const { labels, sizes } = label(land, w, h);
  let ocean = -1;
  let best = 0;
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (land[i] === 1) continue;
    const l = labels[i];
    if (seen.has(l)) continue;
    seen.add(l);
    if (sizes[l] > best) {
      best = sizes[l];
      ocean = l;
    }
  }

  const data = new Uint8Array(n);
  const dist = new Uint16Array(n).fill(0xffff);
  const queue = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  let numLand = 0;
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const me = land[i];
    let shore = false;
    if (x > 0 && land[i - 1] !== me) shore = true;
    else if (x < w - 1 && land[i + 1] !== me) shore = true;
    else if (i >= w && land[i - w] !== me) shore = true;
    else if (i < n - w && land[i + w] !== me) shore = true;
    let b = 0;
    if (me === 1) {
      b |= 0x80;
      numLand++;
      dist[i] = 0;
    } else if (labels[i] === ocean) {
      b |= 0x20;
    }
    if (shore) {
      b |= 0x40;
      if (me === 0) {
        dist[i] = 0;
        queue[qt++] = i;
      }
    }
    data[i] = b;
  }
  while (qh < qt) {
    const t = queue[qh++];
    const d = dist[t] + 1;
    const x = t % w;
    if (x > 0 && land[t - 1] === 0 && dist[t - 1] === 0xffff) {
      dist[t - 1] = d;
      queue[qt++] = t - 1;
    }
    if (x < w - 1 && land[t + 1] === 0 && dist[t + 1] === 0xffff) {
      dist[t + 1] = d;
      queue[qt++] = t + 1;
    }
    if (t >= w && land[t - w] === 0 && dist[t - w] === 0xffff) {
      dist[t - w] = d;
      queue[qt++] = t - w;
    }
    if (t < n - w && land[t + w] === 0 && dist[t + w] === 0xffff) {
      dist[t + w] = d;
      queue[qt++] = t + w;
    }
  }
  for (let i = 0; i < n; i++) {
    if (land[i] === 1) {
      data[i] |= Math.min(30, Math.max(0, Math.ceil(mag[i])));
    } else {
      const d = dist[i] === 0xffff ? 62 : dist[i];
      data[i] |= Math.min(31, Math.ceil(d / 2));
    }
  }
  return { data, numLand, dist };
}

/** Halves the grid; water wins a 2x2 block so straits survive. */
function shrink(layer: Layer): Layer {
  const w = layer.w >> 1;
  const h = layer.h >> 1;
  const land = new Uint8Array(w * h);
  const mag = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = y * 2 * layer.w + x * 2;
      const b = a + 1;
      const c = a + layer.w;
      const d = c + 1;
      const i = y * w + x;
      if (
        layer.land[a] === 0 ||
        layer.land[b] === 0 ||
        layer.land[c] === 0 ||
        layer.land[d] === 0
      ) {
        land[i] = 0;
      } else {
        land[i] = 1;
        mag[i] = layer.mag[d];
      }
    }
  }
  return { w, h, land, mag };
}

const NAME_HEADS = [
  "Ald", "Bren", "Cael", "Dun", "Eld", "Fen", "Gar", "Hal", "Isen", "Kel",
  "Lor", "Mar", "Nor", "Os", "Pen", "Rav", "Sel", "Thorn", "Ul", "Val",
  "Wyn", "Yar", "Ash", "Black", "Grey", "Storm", "Stag", "Wolf", "Oaken",
  "Hart", "Crow", "Winter", "Gold", "Iron", "Amber", "Mist", "Bram", "Corv",
  "Eder", "Tarn",
];
const NAME_TAILS = [
  "mark", "wick", "ford", "holm", "mere", "gard", "stead", "moor", "vale",
  "fell", "reach", "shire", "wold", "burn", "haven", "crest", "mont", "dale",
  "hold", "watch", "marsh", "cliffe", "garth", "minster",
];
const TITLES = [
  "Kingdom of", "Duchy of", "Earldom of", "Principality of", "March of",
  "County of", "Barony of", "Bishopric of", "Free City of", "Grand Duchy of",
];

function realmNames(rand: () => number, count: number): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  let guard = 0;
  while (out.length < count && guard++ < 5000) {
    const place =
      NAME_HEADS[(rand() * NAME_HEADS.length) | 0] +
      NAME_TAILS[(rand() * NAME_TAILS.length) | 0];
    if (used.has(place)) continue;
    used.add(place);
    out.push(`${TITLES[(rand() * TITLES.length) | 0]} ${place}`);
  }
  return out;
}

/** Spread seats of power over the lowlands by farthest-point sampling. */
function seats(
  layer: Layer,
  dist: Uint16Array,
  rand: () => number,
  count: number,
): [number, number][] {
  const { w, h, land, mag } = layer;
  // Distance from the sea, so seats sit a little inland.
  const candidates: number[] = [];
  let guard = 0;
  while (candidates.length < 3000 && guard++ < 400000) {
    const x = 6 + ((rand() * (w - 12)) | 0);
    const y = 6 + ((rand() * (h - 12)) | 0);
    const i = y * w + x;
    if (land[i] !== 1 || mag[i] >= 12) continue;
    if (
      land[i - 5] !== 1 ||
      land[i + 5] !== 1 ||
      land[i - 5 * w] !== 1 ||
      land[i + 5 * w] !== 1
    ) {
      continue;
    }
    if (dist[i] !== 0) continue;
    candidates.push(i);
  }
  const chosen: number[] = [];
  const minD = new Float64Array(candidates.length).fill(Infinity);
  for (let k = 0; k < count && candidates.length > 0; k++) {
    let bestI = 0;
    if (k === 0) {
      bestI = (rand() * candidates.length) | 0;
    } else {
      let bestD = -1;
      for (let c = 0; c < candidates.length; c++) {
        if (minD[c] > bestD) {
          bestD = minD[c];
          bestI = c;
        }
      }
    }
    const pick = candidates[bestI];
    chosen.push(pick);
    const px = pick % w;
    const py = (pick / w) | 0;
    for (let c = 0; c < candidates.length; c++) {
      const dx = (candidates[c] % w) - px;
      const dy = ((candidates[c] / w) | 0) - py;
      const d = dx * dx + dy * dy;
      if (d < minD[c]) minD[c] = d;
    }
  }
  return chosen.map((i) => [i % w, (i / w) | 0]);
}

export function generateRealm(opts: RealmOptions): Realm {
  const style = REALM_STYLES[opts.map];
  const w = (opts.width ?? 1200) & ~3;
  const h = (opts.height ?? 800) & ~3;
  const n = w * h;
  const rand = mulberry32(opts.seed * 2654435761 + 97);
  const noise = new Noise(rand);
  const aspect = w / h;

  const raw = new Float32Array(n);
  const rough = new Float32Array(n);
  const ox = rand() * 500;
  const oy = rand() * 500;
  const freq = style === "isles" ? 5.2 : 3.1;
  for (let y = 0; y < h; y++) {
    const v = (y / (h - 1)) * 2 - 1;
    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1;
      const px = u * aspect * 0.5 * freq + ox;
      const py = v * 0.5 * freq + oy;
      const wx = noise.fbm(px * 0.7 + 31.4, py * 0.7 + 11.9, 3) * 0.9;
      const wy = noise.fbm(px * 0.7 + 71.2, py * 0.7 + 53.7, 3) * 0.9;
      const base = noise.fbm(px + wx, py + wy, 6);
      const i = y * w + x;
      raw[i] = base * 1.15 + shape(style, u, v, aspect);
      const belt = smooth(0.0, 0.32, noise.fbm(px * 0.45 + 200, py * 0.45 + 200, 3) + 0.12);
      rough[i] = noise.ridged(px * 2.2 + wx + 400, py * 2.2 + wy + 400, 4) * belt;
    }
  }

  // Sea level from the wanted land share.
  const sorted = Float32Array.from(raw).sort();
  const sea = sorted[Math.floor(n * (1 - LAND_FRACTION[style]))];

  const land = new Uint8Array(n);
  const mag = new Float32Array(n);
  for (let i = 0; i < n; i++) land[i] = raw[i] > sea ? 1 : 0;
  removeSmall(land, mag, w, h, MIN_ISLAND, MIN_LAKE);

  // Land height: coast-relative rise plus mountain belts, ranked so every
  // realm has the same split of lowland, highland and mountain.
  const hgt = new Float32Array(n);
  const landVals: number[] = [];
  for (let i = 0; i < n; i++) {
    if (land[i] !== 1) continue;
    const rise = Math.max(0, raw[i] - sea);
    hgt[i] = rise * 0.55 + rough[i] * Math.min(1, rise * 6) * 0.9;
    landVals.push(hgt[i]);
  }
  const ranked = Float32Array.from(landVals).sort();
  const q = (p: number) => ranked[Math.min(ranked.length - 1, Math.floor(ranked.length * p))];
  const q0 = ranked[0];
  const q1 = q(0.62);
  const q2 = q(0.86);
  const q3 = ranked[ranked.length - 1];
  for (let i = 0; i < n; i++) {
    if (land[i] !== 1) continue;
    const e = hgt[i];
    let m: number;
    if (e < q1) m = ((e - q0) / (q1 - q0 || 1)) * 9.4;
    else if (e < q2) m = 9.6 + ((e - q1) / (q2 - q1 || 1)) * 9.8;
    else m = 19.6 + Math.pow((e - q2) / (q3 - q2 || 1), 0.75) * 10.4;
    mag[i] = Math.min(30, Math.max(0, m));
  }

  const full: Layer = { w, h, land, mag };
  const fullPacked = pack(full);

  const mid = shrink(full);
  removeSmall(mid.land, mid.mag, mid.w, mid.h, MIN_ISLAND / 2, 0);
  const midPacked = pack(mid);
  const small = shrink(mid);
  const smallPacked = pack(small);

  const elevation = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    elevation[i] = land[i] === 1 ? mag[i] : -(fullPacked.dist[i] === 0xffff ? 62 : fullPacked.dist[i] + 1);
  }

  const kingdoms = opts.kingdoms ?? 12;
  const spots = seats(full, fullPacked.dist, rand, kingdoms);
  const names = realmNames(rand, kingdoms + 40);
  const nations: Nation[] = spots.map((c, i) => ({
    coordinates: c,
    name: names[i],
  }));
  const additionalNations = names.slice(spots.length).map((name) => ({ name }));

  const manifest: MapManifest = {
    name: opts.map,
    map: { width: w, height: h, num_land_tiles: fullPacked.numLand },
    map4x: { width: mid.w, height: mid.h, num_land_tiles: midPacked.numLand },
    map16x: {
      width: small.w,
      height: small.h,
      num_land_tiles: smallPacked.numLand,
    },
    nations,
    additionalNations,
  };

  return {
    files: {
      map: opts.map,
      mapSize: GameMapSize.Normal,
      manifest,
      mapBin: fullPacked.data,
      map4xBin: midPacked.data,
    },
    width: w,
    height: h,
    terrain: fullPacked.data.slice(),
    numLandTiles: fullPacked.numLand,
    elevation,
  };
}
