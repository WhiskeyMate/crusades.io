// Draws a map from an outline written by hand: coastlines as polygons,
// inland seas as ellipses, mountain ranges as lines. Coasts are roughened
// with seeded fractal noise so they do not look ruled. Writes main.bin and
// a starter info.json; run tools/mapfix.ts on the result to derive the rest
// (shoreline, ocean, depths, the half-size routing map).
//
//   npx tsx tools/mapdraw.ts <name>      then      npx tsx tools/mapfix.ts public/maps/<name>
//
// Coordinates are in units of TILES_PER_UNIT tiles, x to the east, y to the south.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type P = [number, number];
interface Range {
  line: P[];
  /** Half-width of the range, in units. */
  width: number;
  /** Peak height, 0-30. */
  height: number;
}
interface Sketch {
  width: number;
  height: number;
  seed: number;
  land: P[][];
  /** Inland water: [centre x, centre y, radius x, radius y]. */
  lakes: [number, number, number, number][];
  ranges: Range[];
}

const TILES_PER_UNIT = 10;

const SKETCHES: Record<string, Sketch> = {
  // Two continents either side of a narrow sea: a long one running north to
  // south in the west, a broad one stretching east.
  westeros: {
    width: 160,
    height: 100,
    seed: 11,
    land: [
      // The western continent.
      [
        [14, 2], [24, 1], [34, 3], [38, 8], [37, 12], [39, 16], [36, 22], [38, 28], [35, 33], [36, 38],
        [31, 40], [33, 42], [29, 43], [30, 46], [36, 45], [41, 46], [42, 49], [38, 51], [40, 54], [36, 56],
        [35, 60], [38, 62], [37, 64], [34, 63], [36, 66], [40, 68], [39, 72], [41, 75], [37, 77], [34, 78],
        [38, 80], [44, 82], [47, 85], [42, 87], [36, 89], [30, 90], [25, 88], [20, 86], [17, 88], [13, 86],
        [12, 82], [14, 78], [11, 74], [12, 70], [9, 66], [10, 62], [8, 58], [11, 55], [13, 52], [17, 51],
        [19, 48], [16, 46], [18, 43], [21, 42], [20, 38], [16, 36], [13, 33], [15, 29], [12, 26], [10, 22],
        [13, 18], [11, 14], [13, 10], [11, 6],
      ],
      // Its islands: north-east, north-west, the western isles, the eastern bay, the south-west.
      [[41, 10], [45, 9], [46, 14], [42, 15]],
      [[7, 16], [11, 15], [11, 19], [7, 20]],
      [[6, 47], [9, 46], [10, 50], [7, 51]],
      [[8, 52], [11, 52], [11, 56], [8, 56]],
      [[11, 47], [14, 46], [15, 49], [12, 50]],
      [[42, 58], [45, 58], [45, 61], [42, 61]],
      [[43, 69], [46, 68], [46, 73], [43, 73]],
      [[41, 77], [44, 77], [44, 80], [41, 80]],
      [[8, 89], [15, 89], [15, 93], [8, 93]],
      // Stepping stones across the strait.
      [[48, 82], [51, 82], [51, 85], [48, 85]],
      [[51, 86], [54, 86], [54, 89], [51, 89]],
      // The eastern continent.
      [
        [56, 40], [62, 36], [70, 38], [76, 35], [84, 33], [92, 30], [105, 28], [120, 26], [135, 24], [150, 24],
        [160, 26], [160, 70], [150, 72], [142, 78], [133, 74], [125, 79], [117, 74], [110, 78], [106, 72], [108, 66],
        [104, 62], [100, 66], [99, 72], [96, 77], [92, 81], [88, 85], [84, 80], [80, 83], [76, 78], [72, 81],
        [68, 78], [64, 83], [60, 80], [57, 85], [54, 81], [58, 75], [62, 72], [60, 68], [56, 70], [54, 64],
        [56, 58], [58, 52], [54, 46],
      ],
      // Its islands: the northern isle, the great southern isle, the ruined peninsula's remains.
      [[71, 31], [75, 31], [75, 34], [71, 34]],
      [[100, 16], [111, 15], [112, 23], [101, 24]],
      [[127, 84], [138, 82], [141, 88], [130, 91]],
      [[84, 87], [88, 87], [88, 91], [84, 91]],
      [[90, 86], [94, 85], [95, 89], [91, 90]],
      // The jungle coast across the southern sea, and the isles off the south-west.
      [[92, 96], [104, 94], [118, 95], [132, 94], [146, 96], [160, 95], [160, 100], [92, 100]],
      [[36, 95], [44, 94], [52, 96], [54, 100], [36, 100]],
    ],
    lakes: [
      [30.5, 60, 1.6, 1.8],
      [30, 21, 1.3, 2.2],
      [120, 48, 2.4, 2.0],
      [84, 58, 2.6, 1.6],
    ],
    ranges: [
      { line: [[13, 3], [14, 8], [16, 12]], width: 2.2, height: 28 },
      { line: [[15, 15], [17, 22], [16, 28]], width: 2.0, height: 22 },
      { line: [[33, 46], [36, 48], [39, 50]], width: 2.2, height: 28 },
      { line: [[12, 58], [15, 62], [14, 68]], width: 2.2, height: 22 },
      { line: [[19, 82], [26, 84], [33, 84], [38, 82]], width: 2.0, height: 26 },
      { line: [[66, 42], [69, 48], [68, 54]], width: 2.4, height: 22 },
      { line: [[140, 28], [142, 44], [141, 60], [143, 70]], width: 3.2, height: 30 },
      { line: [[100, 34], [112, 36]], width: 2.0, height: 18 },
      { line: [[86, 72], [90, 76]], width: 2.0, height: 24 },
    ],
  },

  // The north-west of a great continent: a long western seaboard with deep
  // gulfs, a spine of mountains down the middle, and a walled land in the
  // south-east.
  middleearth: {
    width: 140,
    height: 100,
    seed: 23,
    land: [
      [
        [30, 0], [26, 3], [21, 6], [25, 9], [29, 11], [25, 14], [20, 18], [16, 22], [18, 25], [23, 27],
        [27, 29], [23, 31], [17, 33], [15, 38], [17, 43], [22, 47], [26, 52], [29, 56], [30, 61], [26, 64],
        [23, 67], [27, 70], [33, 67], [38, 66], [42, 69], [46, 72], [44, 77], [49, 76], [54, 74], [57, 77],
        [55, 82], [51, 86], [47, 90], [45, 93], [49, 95], [46, 100], [140, 100], [140, 0],
      ],
      [[50, 79], [54, 78], [54, 82], [50, 83]],
      [[13, 26], [16, 26], [16, 29], [13, 29]],
    ],
    lakes: [
      [112, 38, 7, 5],
      [98, 75, 5.5, 3.2],
      [38, 22, 1.8, 2.2],
      [86, 22, 1.2, 2.4],
    ],
    ranges: [
      // The spine.
      { line: [[57, 10], [60, 22], [59, 34], [57, 46], [56, 54]], width: 2.6, height: 30 },
      // The white range running east from the south-western cape.
      { line: [[36, 63], [46, 61], [56, 61], [66, 63]], width: 2.4, height: 28 },
      // The walls of the black land: north, west and south.
      { line: [[80, 61], [92, 59], [104, 60]], width: 2.0, height: 30 },
      { line: [[80, 61], [80, 72], [82, 82]], width: 2.0, height: 30 },
      { line: [[82, 82], [92, 85], [102, 84]], width: 2.0, height: 26 },
      // The blue mountains by the western sea, in two parts.
      { line: [[28, 12], [27, 18], [26, 25]], width: 1.8, height: 24 },
      { line: [[24, 32], [25, 38], [26, 43]], width: 1.8, height: 22 },
      // The grey mountains of the north, and the hills beyond.
      { line: [[60, 9], [72, 8], [84, 9]], width: 2.0, height: 24 },
      { line: [[97, 14], [104, 14]], width: 1.6, height: 20 },
      { line: [[40, 6], [50, 5]], width: 1.8, height: 20 },
    ],
  },
};

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Midpoint displacement: breaks each edge into a wandering line. */
function roughen(poly: P[], rand: () => number, edgeX: number, edgeY: number): P[] {
  let pts = poly;
  for (let level = 0; level < 5; level++) {
    const next: P[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      next.push(a);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      // An edge that runs along the border of the map stays straight.
      const onEdge =
        (a[0] === b[0] && (a[0] <= 0 || a[0] >= edgeX)) || (a[1] === b[1] && (a[1] <= 0 || a[1] >= edgeY));
      const k = onEdge ? 0 : (rand() - 0.5) * 0.42 * len;
      next.push([(a[0] + b[0]) / 2 - (dy / (len || 1)) * k, (a[1] + b[1]) / 2 + (dx / (len || 1)) * k]);
    }
    pts = next;
  }
  return pts;
}

function fill(mask: Uint8Array, w: number, h: number, poly: P[], value: number) {
  const xs: number[] = [];
  for (let y = 0; y < h; y++) {
    const py = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a[1] <= py === b[1] <= py) continue;
      xs.push(a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const x1 = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) mask[y * w + x] = value;
    }
  }
}

function noise2(seed: number) {
  const hash = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * sx;
    const b = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  return (x: number, y: number) => smooth(x, y) * 0.55 + smooth(x * 2.3, y * 2.3) * 0.3 + smooth(x * 5.1, y * 5.1) * 0.15;
}

const name = process.argv[2];
const sketch = SKETCHES[name];
if (!sketch) throw new Error(`usage: mapdraw <${Object.keys(SKETCHES).join("|")}>`);

const S = TILES_PER_UNIT;
const w = sketch.width * S;
const h = sketch.height * S;
const rand = mulberry32(sketch.seed);
const land = new Uint8Array(w * h);
for (const poly of sketch.land) {
  const rough = roughen(poly, rand, sketch.width, sketch.height).map(([x, y]): P => [x * S, y * S]);
  fill(land, w, h, rough, 1);
}
for (const [cx, cy, rx, ry] of sketch.lakes) {
  const pts: P[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 0.8 + rand() * 0.4;
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  fill(land, w, h, roughen(pts, rand, sketch.width, sketch.height).map(([x, y]): P => [x * S, y * S]), 0);
}

// Heights: gentle rolling country, rising into the ranges.
const rolling = noise2(sketch.seed * 7 + 1);
const crags = noise2(sketch.seed * 13 + 5);
const mag = new Float32Array(w * h);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) mag[y * w + x] = 1 + rolling(x / 70, y / 70) * 9;
}
for (const r of sketch.ranges) {
  const half = r.width * S;
  for (let s = 0; s + 1 < r.line.length; s++) {
    const ax = r.line[s][0] * S;
    const ay = r.line[s][1] * S;
    const bx = r.line[s + 1][0] * S;
    const by = r.line[s + 1][1] * S;
    const reach = half * 1.6;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + reach));
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2));
        const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
        // The edge of a range wanders, and its crest is broken into peaks.
        const edge = half * (0.75 + crags(x / 26, y / 26) * 0.7);
        if (d >= edge) continue;
        const rise = (1 - d / edge) ** 0.8 * r.height * (0.75 + crags(x / 9, y / 9) * 0.4);
        const i = y * w + x;
        if (rise > mag[i]) mag[i] = rise;
      }
    }
  }
}

const out = new Uint8Array(w * h);
let count = 0;
for (let i = 0; i < out.length; i++) {
  if (!land[i]) continue;
  count++;
  out[i] = 0x80 | Math.max(0, Math.min(30, Math.round(mag[i])));
}
const dir = join("public", "maps", name);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "main.bin"), out);
writeFileSync(join(dir, "info.json"), JSON.stringify({ source: `drawn:${name}`, width: w, height: h, numLandTiles: count }));
console.log(`${dir}: ${w}x${h}, land ${((count / out.length) * 100).toFixed(1)}%`);
