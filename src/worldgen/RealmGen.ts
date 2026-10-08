// Realms: real-world terrain loaded from public/maps/<id>/, with the seats
// of the kingdoms and their names drawn from the game's seed.
//
// Terrain byte (the engine's own format): bit 7 land, bit 6 shoreline,
// bit 5 ocean, bits 0-4 magnitude (land: elevation 0-30, 31 impassable;
// water: distance to land / 2). "main" is the map the game is played on,
// "mini" a half-size copy the engine's pathfinder uses.
//
// The terrain files are OpenFront map data (CC BY-SA 4.0, see NOTICE.md).

import { GameMapSize, GameMapType } from "@crusades/engine-api/game/GameTypes";
import { MapFiles, MapManifest, Nation } from "@crusades/engine-api/game/MapFiles";

/** public/maps/<id>/info.json */
export interface MapInfoFile {
  source: string;
  width: number;
  height: number;
  numLandTiles: number;
  miniWidth: number;
  miniHeight: number;
  miniNumLandTiles: number;
}

export const MAP_DIR: Record<GameMapType, string> = {
  [GameMapType.Earth]: "earth",
  [GameMapType.Europe]: "europe",
  [GameMapType.Mediterranean]: "mediterranean",
  [GameMapType.Greece]: "greece",
};

/** Kingdoms a map holds by default: the counts the upstream maps use. */
export const DEFAULT_KINGDOMS: Record<GameMapType, number> = {
  [GameMapType.Earth]: 107,
  [GameMapType.Europe]: 52,
  [GameMapType.Mediterranean]: 38,
  [GameMapType.Greece]: 29,
};
/** Clans (the small AI realms) by default, as upstream. */
export const DEFAULT_CLANS = 400;
export const MAX_KINGDOMS = 120;
export const MAX_CLANS = 400;

export interface RealmOptions {
  map: GameMapType;
  seed: number;
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


interface Layer {
  w: number;
  h: number;
  land: Uint8Array;
  mag: Float32Array;
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


/**
 * Builds a Realm from a map's terrain files. Pure and synchronous, so the
 * browser, the game server and the headless tool all call it with the
 * bytes they fetched or read.
 */
export function buildRealm(
  opts: RealmOptions,
  info: MapInfoFile,
  main: Uint8Array,
  mini: Uint8Array,
): Realm {
  const w = info.width;
  const h = info.height;
  const n = w * h;
  if (main.length !== n) throw new Error(`${opts.map}: main terrain is ${main.length} bytes, expected ${n}`);
  if (mini.length !== info.miniWidth * info.miniHeight) throw new Error(`${opts.map}: mini terrain has the wrong size`);

  const land = new Uint8Array(n);
  const mag = new Float32Array(n);
  const dist = new Uint16Array(n);
  const elevation = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const b = main[i];
    const m = b & 0x1f;
    if (b & 0x80) {
      // Impassable (31) counts as mountain for the picture but never as land to settle.
      land[i] = m === 31 ? 0 : 1;
      mag[i] = Math.min(30, m);
      elevation[i] = Math.min(30, m);
      dist[i] = m === 31 ? 1 : 0;
    } else {
      dist[i] = m * 2;
      elevation[i] = -(m * 2 + 1);
    }
  }

  const rand = mulberry32(opts.seed * 2654435761 + 97);
  const kingdoms = opts.kingdoms ?? 12;
  const spots = seats({ w, h, land, mag }, dist, rand, kingdoms);
  const names = realmNames(rand, kingdoms + 40);
  const nations: Nation[] = spots.map((c, i) => ({ coordinates: c, name: names[i] }));
  const additionalNations = names.slice(spots.length).map((name) => ({ name }));

  const manifest: MapManifest = {
    name: opts.map,
    map: { width: w, height: h, num_land_tiles: info.numLandTiles },
    map4x: { width: info.miniWidth, height: info.miniHeight, num_land_tiles: info.miniNumLandTiles },
    map16x: { width: info.miniWidth >> 1, height: info.miniHeight >> 1, num_land_tiles: 0 },
    nations,
    additionalNations,
  };

  return {
    files: {
      map: opts.map,
      mapSize: GameMapSize.Normal,
      manifest,
      mapBin: main,
      map4xBin: mini,
    },
    width: w,
    height: h,
    terrain: main.slice(),
    numLandTiles: info.numLandTiles,
    elevation,
  };
}

/** In the browser: fetch the map's files and build the realm. */
export async function loadRealm(opts: RealmOptions): Promise<Realm> {
  const base = `/maps/${MAP_DIR[opts.map]}`;
  const [info, main, mini] = await Promise.all([
    fetch(`${base}/info.json`).then((r) => {
      if (!r.ok) throw new Error(`Could not load the ${opts.map} map`);
      return r.json() as Promise<MapInfoFile>;
    }),
    fetch(`${base}/main.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}/mini.bin`).then((r) => r.arrayBuffer()),
  ]);
  return buildRealm(opts, info, new Uint8Array(main), new Uint8Array(mini));
}
