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
  /** Tiles to a unit, if not the usual ten: fewer for a map that is mostly land, to keep it a playable size. */
  scale?: number;
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


// ---------------------------------------------------------------- more lands
// A second batch of invented maps. Each is a plain idea (two lands and a
// neck between, a wheel, a river with three fords) so that a glance at the
// picture says how the war will go.

/** A round outline of `n` corners. */
function disc(cx: number, cy: number, rx: number, ry: number, n = 28): P[] {
  return Array.from({ length: n }, (_, i): P => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry]);
}

/** A slice of a ring: between two radii and two angles. */
function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, steps = 10): P[] {
  const out: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]);
  }
  return out;
}

/** The Hourglass: two lands, north and south, and the one neck that joins them. */
function hourglass(): Sketch {
  const rnd = dice(151);
  return {
    width: 110,
    height: 150,
    seed: 151,
    land: [
      isle(55, 38, 42, 30, 0.2, lumpy(rnd, 16)),
      isle(55, 112, 42, 30, 1.1, lumpy(rnd, 16)),
      // The neck.
      [[50, 58], [60, 58], [59, 92], [51, 92]],
      isle(14, 75, 5, 7, 0.4, lumpy(rnd, 9)),
      isle(96, 75, 5, 7, 2.0, lumpy(rnd, 9)),
    ],
    lakes: [[40, 34, 5, 4], [70, 116, 5, 4]],
    ranges: [
      { line: [[30, 46], [55, 52], [80, 46]], width: 2.2, height: 26 },
      { line: [[30, 104], [55, 98], [80, 104]], width: 2.2, height: 26 },
    ],
  };
}

/** The Three Sisters: three great islands at the corners of a triangle, and a small one between. */
function threeSisters(): Sketch {
  const rnd = dice(157);
  const land: P[][] = [];
  const ranges: Range[] = [];
  const C: P = [70, 68];
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
    const cx = C[0] + Math.cos(a) * 40;
    const cy = C[1] + Math.sin(a) * 38;
    land.push(isle(cx, cy, 26 + i * 2, 23 - i, a, lumpy(rnd, 15)));
    ranges.push({ line: [[cx - 9, cy - 4], [cx + 9, cy + 4]], width: 2.2, height: 22 + i * 3 });
  }
  land.push(isle(C[0], C[1] + 4, 6.5, 6, 0.5, lumpy(rnd, 10)));
  return { width: 140, height: 135, seed: 157, land, lakes: [[70, 28, 4, 3.4]], ranges };
}

/** The Wheel: a hub, a rim, and six spokes of land between them; six seas between the spokes. */
function wheel(): Sketch {
  const C = 70;
  const water: P[][] = [];
  const isles: P[][] = [];
  const rnd = dice(163);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    // Each sea is a slice of the ring, stopping short of its neighbours: the gap is the spoke.
    water.push(sector(C, C, 22, 47, a + 0.2, a + Math.PI / 3 - 0.2));
    if (i % 2 === 0) isles.push(isle(C + Math.cos(a + Math.PI / 6) * 35, C + Math.sin(a + Math.PI / 6) * 35, 4.2, 3.6, a, lumpy(rnd, 8)));
  }
  return {
    width: 140,
    height: 140,
    seed: 163,
    land: [isle(C, C, 62, 62, 0.1, lumpy(rnd, 24).map((k) => 0.94 + (k - 1) * 0.35))],
    lakes: [],
    water,
    isles,
    ranges: [
      { line: [[C - 6, C], [C + 6, C]], width: 2.6, height: 30 },
      { line: [[C, C - 6], [C, C + 6]], width: 2.6, height: 30 },
    ],
  };
}

/** The Crossing: one land in the shape of a cross, its four arms broad at the ends. */
function crossing(): Sketch {
  const C = 70;
  const arm = (dx: number, dy: number): P[] => {
    // From a waist near the middle out to a flared end.
    const px = -dy;
    const py = dx;
    return [
      [C + dx * 8 + px * 9, C + dy * 8 + py * 9],
      [C + dx * 40 + px * 12, C + dy * 40 + py * 12],
      [C + dx * 58 + px * 22, C + dy * 58 + py * 22],
      [C + dx * 62, C + dy * 62],
      [C + dx * 58 - px * 22, C + dy * 58 - py * 22],
      [C + dx * 40 - px * 12, C + dy * 40 - py * 12],
      [C + dx * 8 - px * 9, C + dy * 8 - py * 9],
    ];
  };
  const rnd = dice(167);
  return {
    width: 140,
    height: 140,
    seed: 167,
    land: [
      disc(C, C, 15, 15, 16), arm(1, 0), arm(-1, 0), arm(0, 1), arm(0, -1),
      // An isle in each quarter of the sea.
      isle(28, 28, 8, 7, 0.3, lumpy(rnd, 10)), isle(112, 28, 7, 8, 1.2, lumpy(rnd, 10)),
      isle(28, 112, 7, 8, 2.2, lumpy(rnd, 10)), isle(112, 112, 8, 7, 0.8, lumpy(rnd, 10)),
    ],
    lakes: [[C, C, 4.5, 4.5]],
    ranges: [
      { line: [[C + 30, C - 6], [C + 44, C + 6]], width: 2, height: 24 },
      { line: [[C - 30, C + 6], [C - 44, C - 6]], width: 2, height: 24 },
      { line: [[C - 6, C - 30], [C + 6, C - 44]], width: 2, height: 24 },
      { line: [[C + 6, C + 30], [C - 6, C + 44]], width: 2, height: 24 },
    ],
  };
}

/** The Crescent: a horned moon of land about a wide bay, and an island in the bay. */
function crescent(): Sketch {
  const rnd = dice(173);
  return {
    width: 140,
    height: 130,
    seed: 173,
    land: [isle(62, 65, 56, 56, 0.3, lumpy(rnd, 22).map((k) => 0.95 + (k - 1) * 0.4))],
    lakes: [[26, 64, 5, 6]],
    // The bay: a rounder bite out of the eastern side.
    water: [disc(92, 65, 40, 37, 30)],
    isles: [isle(96, 65, 12, 10, 0.6, lumpy(rnd, 12)), isle(120, 38, 4.5, 4, 1.4, lumpy(rnd, 8)), isle(120, 94, 4.5, 4, 2.4, lumpy(rnd, 8))],
    ranges: [
      { line: [[30, 30], [20, 55], [22, 80], [34, 102]], width: 2.4, height: 28 },
      { line: [[92, 62], [100, 68]], width: 1.8, height: 20 },
    ],
  };
}

/** The Great River: one land, and a broad river through the midst of it with three fords. */
function greatRiver(): Sketch {
  const rnd = dice(179);
  const course = curve([[36, -4], [44, 14], [70, 26], [96, 38], [104, 56], [86, 70], [58, 78], [48, 96], [66, 112], [96, 118], [112, 134]], 14);
  // The river is cut in four reaches; the land left between them is a ford.
  const reach = (from: number, to: number) => band(course.slice(Math.floor(from * course.length), Math.ceil(to * course.length)), () => 3.4);
  return {
    width: 150,
    height: 130,
    seed: 179,
    scale: 8,
    land: [isle(75, 65, 70, 60, 0.15, lumpy(rnd, 26).map((k) => 0.96 + (k - 1) * 0.3))],
    lakes: [[24, 40, 5, 4], [122, 84, 6, 4.5]],
    water: [reach(0, 0.21), reach(0.27, 0.5), reach(0.56, 0.78), reach(0.84, 1)],
    ranges: [
      { line: [[14, 70], [26, 92], [40, 106]], width: 2.4, height: 28 },
      { line: [[110, 20], [128, 38], [134, 58]], width: 2.4, height: 28 },
    ],
  };
}

/** The Lakelands: more water inside the land than around it. */
function lakelands(): Sketch {
  const rnd = dice(181);
  const lakes: Sketch["lakes"] = [];
  const placed: [number, number, number][] = [];
  let guard = 0;
  while (placed.length < 15 && guard++ < 3000) {
    const r = 5 + rnd() * 6;
    const x = 22 + rnd() * 106;
    const y = 20 + rnd() * 90;
    if (placed.some(([px, py, pr]) => Math.hypot(px - x, py - y) < pr + r + 7)) continue;
    placed.push([x, y, r]);
    lakes.push([x, y, r * (0.9 + rnd() * 0.5), r * (0.8 + rnd() * 0.4)]);
  }
  return {
    width: 150,
    height: 130,
    seed: 181,
    land: [isle(75, 65, 70, 60, 0.4, lumpy(rnd, 24).map((k) => 0.96 + (k - 1) * 0.3))],
    lakes,
    ranges: [
      { line: [[18, 30], [30, 16], [52, 10]], width: 2, height: 24 },
      { line: [[100, 120], [124, 110], [136, 92]], width: 2, height: 24 },
    ],
  };
}

/** The Fjord Coast: a land along the east, and long arms of the sea reaching into it from the west. */
function fjords(): Sketch {
  const rnd = dice(191);
  const water: P[][] = [];
  const isles: P[][] = [];
  for (let i = 0; i < 6; i++) {
    const y = 14 + i * 21;
    const reach = 62 + (i % 2) * 22 + rnd() * 10;
    const bend = (rnd() - 0.5) * 16;
    const line = curve([[-4, y], [reach * 0.4, y + bend * 0.5], [reach * 0.75, y + bend], [reach, y + bend * 0.6]], 10);
    water.push(band(line, (t) => 4.6 - t * 1.6));
    if (i % 2 === 1) isles.push(isle(10 + rnd() * 6, y + 10.5, 3.6, 3, rnd() * 3, lumpy(rnd, 8)));
  }
  return {
    width: 140,
    height: 140,
    seed: 191,
    scale: 8,
    land: [[[0, 0], [118, 0], [124, 12], [120, 30], [128, 48], [122, 70], [130, 92], [124, 112], [128, 130], [120, 140], [0, 140]]],
    lakes: [[104, 34, 4, 5], [108, 100, 4.5, 4]],
    water,
    isles,
    ranges: [{ line: [[112, 8], [108, 40], [114, 72], [108, 104], [114, 132]], width: 2.6, height: 30 }],
  };
}

/** The Honeycomb: nineteen six-sided islands, fitted together with a strait round each. */
function honeycomb(): Sketch {
  const land: P[][] = [];
  const ranges: Range[] = [];
  const R = 14.2;
  const gap = 2.6;
  const C: P = [75, 68];
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      if (Math.abs(q + r) > 2) continue;
      const cx = C[0] + (R + gap) * 1.5 * q;
      const cy = C[1] + (R + gap) * Math.sqrt(3) * (r + q / 2);
      land.push(Array.from({ length: 6 }, (_, i): P => [cx + Math.cos((i / 6) * Math.PI * 2) * R, cy + Math.sin((i / 6) * Math.PI * 2) * R]));
      if (q === 0 && r === 0) ranges.push({ line: [[cx - 5, cy], [cx + 5, cy]], width: 2.4, height: 30 });
    }
  }
  return { width: 150, height: 136, seed: 193, land, lakes: [], ranges };
}

/** The Ladder: two long lands side by side, and five rungs across the water between. */
function ladder(): Sketch {
  const rnd = dice(197);
  const land: P[][] = [
    isle(28, 70, 22, 66, 0.1, lumpy(rnd, 20).map((k) => 0.96 + (k - 1) * 0.3)),
    isle(102, 70, 22, 66, 0.9, lumpy(rnd, 20).map((k) => 0.96 + (k - 1) * 0.3)),
  ];
  for (let i = 0; i < 5; i++) {
    const y = 18 + i * 26;
    land.push([[40, y - 3.6], [90, y - 3.6], [90, y + 3.6], [40, y + 3.6]]);
  }
  return {
    width: 130,
    height: 140,
    seed: 197,
    scale: 8,
    land,
    lakes: [],
    ranges: [
      { line: [[16, 20], [14, 70], [18, 120]], width: 2.2, height: 28 },
      { line: [[114, 20], [116, 70], [112, 120]], width: 2.2, height: 28 },
    ],
  };
}

/** The Star: a land of five points about a lake. */
function star(): Sketch {
  const C = 70;
  const pts: P[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 64 : 30;
    pts.push([C + Math.cos(a) * r, C + 4 + Math.sin(a) * r]);
  }
  const ranges: Range[] = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    ranges.push({ line: [[C + Math.cos(a) * 22, C + 4 + Math.sin(a) * 22], [C + Math.cos(a) * 44, C + 4 + Math.sin(a) * 44]], width: 1.8, height: 24 });
  }
  return { width: 140, height: 140, seed: 199, land: [pts], lakes: [[C, C + 4, 9, 9]], ranges };
}

/** The Pinwheel: four arms sweeping round from one middle, each curling the same way. */
function pinwheel(): Sketch {
  const C = 70;
  const land: P[][] = [disc(C, C, 14, 14, 18)];
  const rnd = dice(211);
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * Math.PI * 2;
    const pts: P[] = [];
    for (let k = 0; k <= 30; k++) {
      const t = k / 30;
      const a = a0 + t * 1.9;
      const r = 10 + t * 50;
      pts.push([C + Math.cos(a) * r, C + Math.sin(a) * r]);
    }
    land.push(band(pts, (t) => 7 + Math.sin(t * Math.PI) * 5));
  }
  return {
    width: 140,
    height: 140,
    seed: 211,
    land,
    lakes: [],
    isles: [],
    ranges: [{ line: [[C - 4, C - 4], [C + 4, C + 4]], width: 2.4, height: 30 }],
  };
}

/** The Necklace: a mainland in one corner, and a long chain of islands strung from it across the sea. */
function necklace(): Sketch {
  const rnd = dice(223);
  const land: P[][] = [isle(22, 108, 30, 30, 0.2, lumpy(rnd, 16)), isle(134, 22, 20, 18, 1.3, lumpy(rnd, 14))];
  const chain = curve([[44, 84], [56, 56], [78, 42], [102, 46], [116, 36]], 3);
  chain.forEach(([x, y], i) => {
    if (i === 0 || i === chain.length - 1) return;
    land.push(isle(x, y, 6.5 + (i % 3), 5.5 + ((i + 1) % 3), rnd() * 6, lumpy(rnd, 10)));
  });
  // The far side of the sea has its own scattering.
  for (const [x, y] of [[100, 96], [122, 82], [78, 104], [132, 108], [58, 118]] as P[]) land.push(isle(x, y, 7 + rnd() * 3, 6 + rnd() * 3, rnd() * 6, lumpy(rnd, 10)));
  return {
    width: 160,
    height: 130,
    seed: 223,
    land,
    lakes: [],
    ranges: [
      { line: [[10, 96], [24, 112]], width: 2.4, height: 28 },
      { line: [[128, 14], [140, 26]], width: 2, height: 24 },
    ],
  };
}

/** The Great Plain: land from edge to edge, a few lakes and three ranges, and no sea to hide behind. */
function greatPlain(): Sketch {
  return {
    width: 150,
    height: 110,
    seed: 227,
    scale: 8,
    land: [[[3, 3], [147, 3], [147, 107], [3, 107]]],
    lakes: [[40, 30, 7, 5], [104, 76, 8, 6], [76, 54, 5, 4], [124, 26, 5, 4], [26, 82, 5, 4.5]],
    ranges: [
      { line: [[58, 10], [64, 32], [58, 50]], width: 2.4, height: 30 },
      { line: [[90, 100], [86, 78], [94, 60]], width: 2.4, height: 30 },
      { line: [[12, 54], [30, 58]], width: 2, height: 24 },
      { line: [[120, 50], [138, 54]], width: 2, height: 24 },
    ],
  };
}

/** The Delta: a land in the north, and a river that parts into five on its way to the southern sea. */
function delta(): Sketch {
  const water: P[][] = [];
  const mouths = [14, 44, 74, 104, 134];
  for (const x of mouths) {
    const line = curve([[74, 34], [74 + (x - 74) * 0.35, 62], [74 + (x - 74) * 0.8, 96], [x, 134]], 10);
    water.push(band(line, (t) => 2.6 + t * 3.4));
  }
  const rnd = dice(229);
  return {
    width: 150,
    height: 130,
    seed: 229,
    scale: 8,
    land: [[[0, 0], [150, 0], [150, 112], [140, 122], [118, 118], [100, 126], [78, 120], [56, 127], [36, 119], [14, 124], [0, 114]]],
    // The head of the river: a lake where the five arms part.
    lakes: [[74, 30, 8, 6]],
    water,
    ranges: [
      { line: [[14, 14], [50, 10], [90, 12], [134, 16]], width: 2.6, height: 30 },
    ],
  };
}

/** The Horseshoe: one land bent round a deep gulf, open to the south. */
function horseshoe(): Sketch {
  const rnd = dice(233);
  return {
    width: 140,
    height: 140,
    seed: 233,
    land: [isle(70, 66, 62, 58, 0.25, lumpy(rnd, 24).map((k) => 0.96 + (k - 1) * 0.3))],
    lakes: [[70, 22, 6, 4.5]],
    // The gulf, from the middle down and out through the southern coast.
    water: [[[50, 50], [70, 42], [90, 50], [94, 100], [100, 144], [40, 144], [46, 100]]],
    isles: [isle(70, 74, 9, 8, 0.5, lumpy(rnd, 11)), isle(70, 110, 6, 5, 1.4, lumpy(rnd, 9))],
    ranges: [
      { line: [[22, 40], [18, 70], [26, 98]], width: 2.4, height: 28 },
      { line: [[118, 40], [122, 70], [114, 98]], width: 2.4, height: 28 },
    ],
  };
}

const SKETCHES: Record<string, Sketch> = {
  hourglass: hourglass(),
  threesisters: threeSisters(),
  wheel: wheel(),
  crossing: crossing(),
  crescent: crescent(),
  greatriver: greatRiver(),
  lakelands: lakelands(),
  fjords: fjords(),
  honeycomb: honeycomb(),
  ladder: ladder(),
  star: star(),
  pinwheel: pinwheel(),
  necklace: necklace(),
  greatplain: greatPlain(),
  delta: delta(),
  horseshoe: horseshoe(),
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

const S = sketch.scale ?? TILES_PER_UNIT;
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
