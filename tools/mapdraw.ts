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
  /** Water cut out of the land after the lakes: channels, gulfs. */
  water?: P[][];
  /** Land put back last of all: islands standing in a lake or channel. */
  isles?: P[][];
}

const TILES_PER_UNIT = 10;

/** An island as a rough many-sided shape: `lumps` bends its outline in and out. */
function isle(cx: number, cy: number, rx: number, ry: number, turn: number, lumps: number[]): P[] {
  const n = lumps.length;
  return lumps.map((k, i): P => {
    const a = turn + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  });
}

/** The Crown Isles: nine large islands in a ring, each a different shape, around a greater one. */
function crownIsles(): Sketch {
  const C = 65;
  const shapes = [
    [1.0, 0.8, 1.1, 0.9, 1.15, 0.85, 1.0, 0.9, 1.1, 0.8],
    [0.9, 1.15, 0.8, 1.0, 0.9, 1.2, 0.85, 1.05, 0.8, 1.1],
    [1.1, 0.9, 0.85, 1.15, 1.0, 0.8, 1.1, 0.95, 0.85, 1.05],
  ];
  const land: P[][] = [];
  const ranges: Range[] = [];
  const lakes: Sketch["lakes"] = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    // The ring is not quite round, and no two islands are the same size.
    const reach = 46 + (i % 3 === 1 ? 3 : i % 3 === 2 ? -2 : 0);
    const cx = C + Math.cos(a) * reach;
    const cy = C + Math.sin(a) * reach;
    const along = 12.5 + (i % 2) * 1.5;
    const across = 9 + ((i * 2) % 3);
    // Long side lying along the ring.
    land.push(isle(cx, cy, across, along, a, shapes[i % shapes.length]));
    ranges.push({ line: [[cx - Math.sin(a) * 5, cy + Math.cos(a) * 5], [cx + Math.sin(a) * 5, cy - Math.cos(a) * 5]], width: 1.8, height: 18 + (i % 3) * 5 });
    if (i % 3 === 0) lakes.push([cx + Math.cos(a) * 2, cy + Math.sin(a) * 2, 1.8, 1.6]);
  }
  // The great island at the centre, with a crater lake ringed by mountains.
  land.push(isle(C, C, 21, 19, 0.3, [1.0, 0.85, 1.1, 0.9, 1.15, 0.8, 1.05, 0.9, 1.1, 0.85, 1.0, 0.9]));
  lakes.push([C, C, 4.5, 4]);
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2;
    const a1 = ((i + 1) / 6) * Math.PI * 2;
    ranges.push({ line: [[C + Math.cos(a0) * 10, C + Math.sin(a0) * 9], [C + Math.cos(a1) * 10, C + Math.sin(a1) * 9]], width: 1.8, height: 28 });
  }
  return { width: 130, height: 130, seed: 59, land, lakes, ranges };
}

/** A deterministic stream of numbers for the sketches that scatter things. */
function dice(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth line through the given points (Catmull-Rom), `per` samples to each span. */
function curve(points: P[], per = 10): P[] {
  const out: P[] = [];
  const at = (i: number) => points[Math.min(points.length - 1, Math.max(0, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (p2[1] - p0[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** A band of land along a line: `half(t)` is its half-width at fraction t of the way. */
function band(line: P[], half: (t: number) => number): P[] {
  const left: P[] = [];
  const right: P[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const hw = half(i / (line.length - 1));
    left.push([line[i][0] + nx * hw, line[i][1] + ny * hw]);
    right.push([line[i][0] - nx * hw, line[i][1] - ny * hw]);
  }
  return [...left, ...right.reverse()];
}

const lumpy = (rnd: () => number, n = 10) => Array.from({ length: n }, () => 0.82 + rnd() * 0.36);

/** Mirrormere: a ring of land round an inland sea, with one strait out to the ocean. */
function mirrormere(): Sketch {
  const C = 65;
  const rnd = dice(71);
  const outer = isle(C, C, 56, 54, 0.2, lumpy(rnd, 16));
  return {
    width: 130,
    height: 130,
    seed: 71,
    land: [outer],
    lakes: [[C, C + 1, 27, 24]],
    // The strait: south, out of the mere to the open sea.
    water: [[[C - 4, C + 18], [C + 4, C + 18], [C + 7, 130], [C - 7, 130]]],
    isles: [
      isle(C - 7, C - 5, 6.5, 5, 0.4, lumpy(rnd, 9)),
      isle(C + 10, C + 4, 4.5, 5.5, 1.1, lumpy(rnd, 8)),
      isle(C - 1, C + 12, 3.2, 2.8, 2.0, lumpy(rnd, 8)),
    ],
    ranges: [
      { line: [[22, 40], [20, 62], [26, 86]], width: 2.4, height: 28 },
      { line: [[44, 18], [66, 14], [90, 20]], width: 2.2, height: 26 },
      { line: [[108, 44], [112, 66], [104, 90]], width: 2.4, height: 28 },
      { line: [[38, 106], [50, 112]], width: 2.0, height: 22 },
      { line: [[82, 110], [94, 104]], width: 2.0, height: 22 },
    ],
  };
}

/** The Serpent: one long land winding from corner to corner, pinched to a neck at every bend. */
function serpent(): Sketch {
  const spine = curve(
    [[10, 16], [48, 12], [96, 14], [138, 22], [148, 40], [126, 52], [84, 50], [42, 48], [16, 58], [14, 76], [40, 88], [84, 86], [124, 84], [150, 90]],
    12,
  );
  // Broad along the straights, narrow where it turns back on itself.
  const half = (t: number) => 6.2 + 4.2 * Math.abs(Math.sin(t * Math.PI * 4.5)) ** 1.5;
  const rnd = dice(83);
  return {
    width: 160,
    height: 100,
    seed: 83,
    land: [
      band(spine, half),
      // Islands in the bights, where the coils leave room.
      isle(60, 31, 6, 4, 0.3, lumpy(rnd, 9)),
      isle(108, 34, 5, 4.2, 1.2, lumpy(rnd, 9)),
      isle(62, 68, 6.5, 4.4, 0.7, lumpy(rnd, 9)),
      isle(104, 68, 5, 4, 2.1, lumpy(rnd, 9)),
      isle(142, 64, 4.5, 4, 0.9, lumpy(rnd, 8)),
    ],
    lakes: [],
    ranges: [
      { line: [[40, 12], [70, 13], [100, 15]], width: 1.8, height: 24 },
      { line: [[110, 51], [80, 50], [50, 48]], width: 1.8, height: 26 },
      { line: [[50, 88], [80, 86], [112, 85]], width: 1.8, height: 24 },
    ],
  };
}

/** The Four Realms: four lands at the corners, a cross of sea between them, and one isle where the arms meet. */
function fourRealms(): Sketch {
  const rnd = dice(97);
  const land: P[][] = [];
  const ranges: Range[] = [];
  const lakes: Sketch["lakes"] = [];
  const corners: P[] = [[34, 34], [106, 34], [34, 106], [106, 106]];
  corners.forEach(([cx, cy], i) => {
    // Each realm is its own shape and leans a different way.
    land.push(isle(cx, cy, 27 + (i % 2) * 3, 28 - (i % 2) * 3, i * 0.7, lumpy(rnd, 14)));
    const out = [cx < 70 ? -1 : 1, cy < 70 ? -1 : 1];
    ranges.push({ line: [[cx + out[0] * 14, cy - out[1] * 6], [cx + out[0] * 6, cy + out[1] * 12]], width: 2.2, height: 22 + i * 2 });
    if (i % 2 === 0) lakes.push([cx - out[0] * 4, cy - out[1] * 4, 2.6, 2.2]);
  });
  // The isle at the crossing, and stepping stones along each arm.
  land.push(isle(70, 70, 8, 8, 0.4, lumpy(rnd, 10)));
  for (const [x, y] of [[70, 30], [70, 110], [30, 70], [110, 70]] as P[]) land.push(isle(x, y, 3.6, 3.6, rnd() * 3, lumpy(rnd, 8)));
  return { width: 140, height: 140, seed: 97, land, lakes, ranges };
}

/** The Shattered Isles: no mainland at all, only islands, large and small. */
function shatteredIsles(): Sketch {
  const rnd = dice(113);
  const land: P[][] = [];
  const ranges: Range[] = [];
  const placed: [number, number, number][] = [];
  let guard = 0;
  while (placed.length < 30 && guard++ < 4000) {
    // Fewer big ones, many middling.
    const r = placed.length < 6 ? 11 + rnd() * 4 : 5 + rnd() * 5;
    const x = r + 3 + rnd() * (160 - 2 * r - 6);
    const y = r + 3 + rnd() * (110 - 2 * r - 6);
    if (placed.some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + r + 4.5)) continue;
    placed.push([x, y, r]);
    land.push(isle(x, y, r * (0.85 + rnd() * 0.35), r * (0.85 + rnd() * 0.35), rnd() * 6, lumpy(rnd, 11)));
    if (r > 10) {
      const a = rnd() * Math.PI;
      ranges.push({ line: [[x - Math.cos(a) * r * 0.5, y - Math.sin(a) * r * 0.5], [x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5]], width: 1.8, height: 22 });
    }
  }
  return { width: 160, height: 110, seed: 113, land, lakes: [], ranges };
}

/** The Maelstrom: a single land coiled round and round to a stronghold at its heart. */
function maelstrom(): Sketch {
  const C = 65;
  const pts: P[] = [];
  const turns = 2.35;
  for (let i = 0; i <= 150; i++) {
    const t = i / 150;
    const a = t * turns * Math.PI * 2 + 0.6;
    const r = 9 + t * 47;
    pts.push([C + Math.cos(a) * r, C + Math.sin(a) * r]);
  }
  const rnd = dice(131);
  return {
    width: 130,
    height: 130,
    seed: 131,
    // The arm keeps its width; the sea between the coils is as wide again.
    land: [band(pts, (t) => 5.2 + Math.sin(t * Math.PI * 9) * 0.9), isle(C, C, 9.5, 9, 0.2, lumpy(rnd, 10))],
    lakes: [],
    ranges: [
      { line: [[C - 3, C - 3], [C + 3, C + 3]], width: 2.4, height: 30 },
      { line: [[C + Math.cos(2.2) * 30, C + Math.sin(2.2) * 30], [C + Math.cos(2.9) * 34, C + Math.sin(2.9) * 34]], width: 1.6, height: 22 },
      { line: [[C + Math.cos(5.4) * 46, C + Math.sin(5.4) * 46], [C + Math.cos(6.0) * 49, C + Math.sin(6.0) * 49]], width: 1.6, height: 22 },
    ],
  };
}

const SKETCHES: Record<string, Sketch> = {
  crownisles: crownIsles(),
  mirrormere: mirrormere(),
  serpent: serpent(),
  fourrealms: fourRealms(),
  shattered: shatteredIsles(),
  maelstrom: maelstrom(),

  // The Sundered Sea. A broad continent in the west with a great bay cut
  // into its southern coast; in the east a long one, pinched to an isthmus
  // two thirds of the way down, with a hook of land curling west from its
  // foot. A chain of islands runs down the strait between them. All of it
  // invented for this game.
  sundered: {
    width: 160,
    height: 100,
    seed: 31,
    land: [
      // The western continent.
      [
        [10, 22], [18, 16], [28, 14], [36, 9], [42, 5], [48, 8], [46, 15], [52, 18], [60, 15], [70, 17],
        [80, 14], [88, 18], [94, 24], [97, 32], [93, 39], [96, 46], [91, 52], [94, 59], [89, 66], [83, 70],
        [78, 76], [70, 79], [64, 74], [60, 66], [56, 60], [50, 62], [47, 70], [42, 77], [34, 80], [26, 77],
        [20, 80], [13, 76], [8, 68], [11, 60], [6, 52], [9, 44], [5, 36], [8, 28],
      ],
      // The eastern continent: north lobe, isthmus, south lobe, and the hook.
      [
        [126, 4], [136, 3], [146, 6], [151, 13], [148, 20], [152, 27], [149, 34], [153, 41], [150, 48], [144, 52],
        [140, 57], [138, 61], [139, 65], [144, 68], [148, 74], [146, 81], [149, 87], [143, 93], [134, 95], [127, 91],
        [123, 85], [118, 82], [114, 86], [110, 83], [113, 77], [119, 74], [124, 70], [129, 66], [132, 62], [130, 57],
        [125, 53], [121, 47], [124, 42], [119, 38], [116, 32], [120, 28], [125, 30], [128, 25], [123, 20], [118, 17],
        [121, 11],
      ],
      // The islands of the strait, north to south.
      [[100, 20], [105, 19], [106, 24], [101, 25]],
      [[103, 36], [108, 35], [109, 40], [104, 41]],
      [[100, 52], [104, 51], [105, 56], [100, 57]],
      [[106, 64], [110, 63], [110, 68], [106, 68]],
      // A northern isle, and three in the southern sea.
      [[60, 3], [72, 2], [74, 8], [62, 9]],
      [[30, 88], [40, 86], [44, 92], [33, 95]],
      [[56, 86], [66, 85], [68, 92], [57, 93]],
      [[84, 86], [94, 84], [98, 90], [86, 94]],
    ],
    lakes: [
      [30, 45, 3.0, 2.2],
      [76, 40, 2.6, 2.0],
      [136, 30, 2.0, 2.6],
      [135, 80, 2.0, 1.6],
    ],
    ranges: [
      { line: [[14, 30], [22, 44], [18, 60]], width: 2.6, height: 28 },
      { line: [[60, 24], [72, 30], [84, 28]], width: 2.2, height: 24 },
      { line: [[40, 60], [44, 70]], width: 2.0, height: 22 },
      { line: [[140, 10], [142, 24], [138, 40], [141, 50]], width: 2.4, height: 30 },
      { line: [[128, 74], [138, 84]], width: 2.0, height: 24 },
    ],
  },

  // Ironspine. One great land open to the sea on the east and south, split
  // corner to corner by a mountain chain, with a mountain-walled province in
  // the north-west and a great lake at its heart. All of it invented for
  // this game.
  ironspine: {
    width: 140,
    height: 100,
    seed: 47,
    land: [
      [
        [0, 0], [112, 0], [116, 6], [122, 10], [118, 16], [124, 22], [130, 26], [126, 33], [120, 36], [125, 42],
        [132, 46], [128, 54], [121, 57], [116, 63], [120, 70], [114, 76], [106, 78], [100, 84], [92, 82], [86, 88],
        [78, 92], [70, 89], [62, 94], [54, 91], [48, 96], [40, 93], [34, 100], [0, 100],
      ],
      [[130, 12], [137, 11], [138, 18], [131, 19]],
      [[134, 34], [139, 33], [139, 40], [134, 40]],
      [[104, 90], [114, 88], [116, 95], [105, 96]],
      [[124, 80], [131, 79], [132, 85], [125, 86]],
    ],
    lakes: [
      [72, 52, 8.0, 5.0],
      [28, 70, 5.0, 3.5],
      [96, 30, 3.0, 4.0],
      [18, 18, 4.0, 2.6],
    ],
    ranges: [
      // The spine, from the north down to the south-east coast.
      { line: [[44, 8], [52, 22], [56, 36], [54, 48], [58, 62], [68, 72], [82, 76]], width: 2.6, height: 30 },
      // The walls of the north-western province: south and east.
      { line: [[4, 34], [20, 36], [34, 33]], width: 2.0, height: 30 },
      { line: [[34, 33], [36, 20], [34, 6]], width: 2.0, height: 30 },
      // Lesser ranges: the eastern coast, the east of the lake, the south-west.
      { line: [[104, 12], [110, 24], [108, 38]], width: 2.0, height: 22 },
      { line: [[88, 50], [100, 56]], width: 2.0, height: 22 },
      { line: [[10, 84], [22, 88]], width: 1.8, height: 20 },
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
for (const poly of sketch.water ?? []) {
  fill(land, w, h, roughen(poly, rand, sketch.width, sketch.height).map(([x, y]): P => [x * S, y * S]), 0);
}
for (const poly of sketch.isles ?? []) {
  fill(land, w, h, roughen(poly, rand, sketch.width, sketch.height).map(([x, y]): P => [x * S, y * S]), 1);
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
