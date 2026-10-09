// Whole alternative model sets sold in the store: troops, fleets and
// architecture that are different shapes, not recolours. Each is built from
// the same primitives as the base models and registered as a variant, so the
// renderer picks it up by name. Importing this file registers them.

import * as THREE from "three";
import { box, build, cone, cyl, gable, hull, log, Model, paint, Part, prow, register } from "./Models";

const T = 0xffffff; // team colour (painted white, tinted per owner)
const SKIN = 0xd9b38c;
const STEEL = 0x9aa0a6;
const WOOD = 0x6b4a2e;
const WOODL = 0x9a7648;
const CLOTH = 0xf0e6cc;

/** A sphere, optionally squashed; `team` parts take the owner's colour. */
export function ball(r: number, x: number, y: number, z: number, color: number, team = false, sx = 1, sy = 1, sz = 1): Part {
  const g = new THREE.SphereGeometry(r, 8, 6);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return { g: paint(g, team ? T : color), team };
}

/** The top half of a sphere, standing on y. */
export function dome(r: number, x: number, y: number, z: number, color: number, team = false, sy = 1): Part {
  const g = new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return { g: paint(g, team ? T : color), team };
}

/** An onion dome: a bulb drawn up to a point. */
export function onion(r: number, x: number, y: number, z: number, color: number, team = false): Part[] {
  return [
    ball(r, x, y + r * 0.85, z, color, team, 1, 1.1, 1),
    cone(r * 0.55, r * 1.2, x, y + r * 1.55, z, color, 8, team),
    cyl(r * 0.5, r * 0.6, r * 0.3, x, y, z, color, 8, team),
  ];
}

/** A flat triangle visible from both sides (sails). */
export function tri(a: number[], b: number[], c: number[], color: number, team = false): Part {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
  return { g: paint(g, team ? T : color), team };
}

export function ring(n: number, r: number, each: (x: number, z: number, a: number, i: number) => Part | Part[] | null): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = each(Math.sin(a) * r, Math.cos(a) * r, a, i);
    if (p) out.push(...(Array.isArray(p) ? p : [p]));
  }
  return out;
}

export function ballista(y: number): Part[] {
  return [
    box(0.22, 0.22, 2.3, 0, y + 0.6, 0.1, WOOD, false, 0, -0.3),
    box(2.0, 0.12, 0.14, 0, y + 1.05, 0.75, WOODL),
    box(0.5, 0.5, 0.7, 0, y + 0.25, -0.1, WOOD),
  ];
}

export function crystal(y: number): Part {
  const g = new THREE.OctahedronGeometry(0.34, 0);
  g.scale(1, 1.6, 1);
  g.translate(0, y, 0);
  return { g: paint(g, 0x9ff3ff), team: false };
}

export function flag(x: number, y: number, z: number): Part[] {
  return [cyl(0.04, 0.04, 1.5, x, y, z, WOOD, 5), box(0.9, 0.5, 0.05, x + 0.47, y + 0.95, z, 0, true)];
}

// ===================================================================== troops

export function legs(color: number, w = 0.11): Part[] {
  return [box(w, 0.38, 0.14, -0.08, 0, 0, color), box(w, 0.38, 0.14, 0.08, 0, 0, color)];
}

function viking(): Model {
  return build([
    ...legs(0x4a3a2a, 0.12),
    box(0.38, 0.4, 0.24, 0, 0.36, 0, 0, true),
    box(0.4, 0.07, 0.26, 0, 0.42, 0, 0x3b2a1a),
    box(0.22, 0.2, 0.2, 0, 0.76, 0, SKIN),
    box(0.2, 0.16, 0.07, 0, 0.68, 0.11, 0xb5651d),
    cyl(0.12, 0.14, 0.13, 0, 0.92, 0, STEEL, 8),
    cone(0.04, 0.22, -0.15, 0.96, 0, 0xe8dcc0, 5),
    cone(0.04, 0.22, 0.15, 0.96, 0, 0xe8dcc0, 5),
    log(0.21, 0.05, -0.25, 0.5, 0.1, 0, 10, true),
    log(0.07, 0.07, -0.25, 0.5, 0.12, STEEL, 6),
    cyl(0.022, 0.022, 0.95, 0.26, 0.2, 0.05, WOODL, 4),
    box(0.18, 0.16, 0.03, 0.33, 1.0, 0.05, 0xc8ccd2),
  ]);
}

function archer(): Model {
  return build([
    ...legs(0x3d4a2c),
    box(0.32, 0.38, 0.2, 0, 0.38, 0, 0, true),
    box(0.2, 0.18, 0.18, 0, 0.76, 0.02, SKIN),
    box(0.26, 0.24, 0.24, 0, 0.78, -0.04, 0x2f4a2a),
    cone(0.13, 0.16, 0, 1.0, -0.06, 0x2f4a2a, 4),
    // The bow: a stave bent in three pieces, and its string.
    box(0.03, 0.34, 0.03, 0.27, 0.5, 0.14, WOOD),
    box(0.03, 0.3, 0.03, 0.27, 0.82, 0.1, WOOD, false, 0, 0.35),
    box(0.03, 0.3, 0.03, 0.27, 0.24, 0.1, WOOD, false, 0, -0.35),
    box(0.008, 0.86, 0.008, 0.27, 0.24, 0.02, CLOTH),
    box(0.1, 0.32, 0.1, -0.08, 0.46, -0.15, 0x5b3f27),
    box(0.08, 0.08, 0.02, -0.08, 0.78, -0.15, 0, true),
  ]);
}

function peasant(): Model {
  return build([
    ...legs(0x5a4a3a),
    box(0.34, 0.38, 0.2, 0, 0.38, 0, 0x8a6a45),
    box(0.36, 0.08, 0.22, 0, 0.5, 0, 0, true),
    box(0.2, 0.2, 0.2, 0, 0.76, 0, SKIN),
    cyl(0.24, 0.26, 0.03, 0, 0.94, 0, 0xd9c36a, 10),
    cone(0.13, 0.13, 0, 0.97, 0, 0xd9c36a, 8),
    cyl(0.02, 0.02, 1.35, 0.24, 0.1, 0.06, WOODL, 4),
    box(0.22, 0.03, 0.03, 0.24, 1.42, 0.06, 0x6e747c),
    box(0.02, 0.22, 0.02, 0.14, 1.44, 0.06, 0x6e747c),
    box(0.02, 0.22, 0.02, 0.24, 1.44, 0.06, 0x6e747c),
    box(0.02, 0.22, 0.02, 0.34, 1.44, 0.06, 0x6e747c),
  ]);
}

function skeleton(): Model {
  const BONE = 0xe9e4d4;
  return build([
    box(0.06, 0.4, 0.06, -0.08, 0, 0, BONE),
    box(0.06, 0.4, 0.06, 0.08, 0, 0, BONE),
    box(0.24, 0.07, 0.12, 0, 0.38, 0, BONE),
    box(0.05, 0.3, 0.05, 0, 0.42, -0.02, BONE),
    box(0.28, 0.04, 0.16, 0, 0.5, 0, BONE),
    box(0.3, 0.04, 0.17, 0, 0.58, 0, BONE),
    box(0.26, 0.04, 0.15, 0, 0.66, 0, BONE),
    box(0.2, 0.2, 0.2, 0, 0.76, 0, BONE),
    box(0.05, 0.06, 0.02, -0.05, 0.86, 0.1, 0x16110d),
    box(0.05, 0.06, 0.02, 0.05, 0.86, 0.1, 0x16110d),
    box(0.12, 0.03, 0.02, 0, 0.78, 0.1, 0x16110d),
    box(0.04, 0.34, 0.04, 0.2, 0.4, 0, BONE),
    box(0.05, 0.75, 0.03, 0.22, 0.5, 0.12, 0x7a5a45),
    box(0.16, 0.04, 0.05, 0.22, 0.5, 0.12, 0x3b3128),
    box(0.05, 0.3, 0.24, -0.22, 0.38, 0.05, 0, true),
    box(0.05, 0.1, 0.1, -0.22, 0.3, 0.14, 0x16110d),
  ]);
}

function cavalry(): Model {
  const HORSE = 0x6e4a2e;
  return build([
    box(0.09, 0.45, 0.09, -0.12, 0, 0.32, HORSE),
    box(0.09, 0.45, 0.09, 0.12, 0, 0.32, HORSE),
    box(0.09, 0.45, 0.09, -0.12, 0, -0.32, HORSE),
    box(0.09, 0.45, 0.09, 0.12, 0, -0.32, HORSE),
    box(0.32, 0.34, 0.92, 0, 0.42, 0, HORSE),
    box(0.38, 0.32, 0.66, 0, 0.36, -0.02, 0, true),
    box(0.16, 0.44, 0.2, 0, 0.62, 0.5, HORSE, false, 0, 0.5),
    box(0.15, 0.16, 0.32, 0, 0.98, 0.72, HORSE),
    box(0.16, 0.1, 0.34, 0, 1.06, 0.7, 0, true),
    box(0.06, 0.3, 0.1, 0, 0.5, -0.5, 0x2a2018, false, 0, -0.5),
    box(0.28, 0.36, 0.2, 0, 0.78, -0.06, 0, true),
    box(0.3, 0.1, 0.22, 0, 0.96, -0.06, STEEL),
    box(0.2, 0.22, 0.2, 0, 1.14, -0.06, 0xb4bac2),
    box(0.21, 0.03, 0.21, 0, 1.24, -0.06, 0x3b3f45),
    cone(0.05, 0.2, 0, 1.36, -0.06, 0, 5, true),
    cyl(0.022, 0.022, 2.0, 0.26, 0.6, 0.15, WOODL, 4),
    cone(0.045, 0.2, 0.26, 2.6, 0.15, 0xd8dce2, 4),
    box(0.3, 0.14, 0.02, 0.42, 2.38, 0.15, 0, true),
    box(0.05, 0.38, 0.26, -0.2, 0.74, 0.02, 0, true),
  ]);
}

function chicken(): Model {
  const WHITE = 0xf4f1e6;
  return build([
    box(0.04, 0.2, 0.04, -0.08, 0, 0, 0xf0b030),
    box(0.04, 0.2, 0.04, 0.08, 0, 0, 0xf0b030),
    ball(0.26, 0, 0.42, 0, WHITE, false, 0.9, 0.9, 1.15),
    box(0.06, 0.26, 0.18, 0, 0.42, -0.32, WHITE, false, 0, -0.6),
    ball(0.15, 0, 0.78, 0.16, WHITE),
    box(0.05, 0.1, 0.14, 0, 0.88, 0.14, 0xd0322a),
    box(0.07, 0.06, 0.12, 0, 0.74, 0.32, 0xf0b030),
    box(0.04, 0.08, 0.04, 0, 0.66, 0.28, 0xd0322a),
    box(0.03, 0.04, 0.02, -0.08, 0.82, 0.27, 0x16110d),
    box(0.03, 0.04, 0.02, 0.08, 0.82, 0.27, 0x16110d),
    cyl(0.17, 0.19, 0.07, 0, 0.6, 0.1, 0, 8, true),
    box(0.06, 0.2, 0.3, -0.25, 0.36, 0, WHITE),
    box(0.06, 0.2, 0.3, 0.25, 0.36, 0, WHITE),
    cyl(0.015, 0.015, 0.9, 0.3, 0.3, 0.1, WOODL, 4),
    cone(0.035, 0.14, 0.3, 1.2, 0.1, 0xc8ccd2, 4),
  ]);
}

register("viking", { soldier: viking() });
register("archer", { soldier: archer() });
register("peasant", { soldier: peasant() });
register("skeleton", { soldier: skeleton() });
register("cavalry", { soldier: cavalry() });
register("chicken", { soldier: chicken() });

// ====================================================================== fleets

/** Norse ships: clinker hulls, a dragon at the prow, a striped sail, shields on the rail. */
function norse(len: number, w: number, sailW: number, sailH: number, mast: number, cargo = false): Model {
  const DARK = 0x3d2a1a;
  const parts: Part[] = [
    ...hull(w, 0.42, len, 0x5a3b22),
    box(w * 0.85, 0.05, len * 0.95, 0, 0.42, 0, WOODL),
    box(0.14, 1.15, 0.14, 0, 0.25, len / 2 + len * 0.26, DARK, false, 0, 0.4),
    box(0.2, 0.22, 0.36, 0, 1.22, len / 2 + len * 0.26 + 0.52, 0x7a1f1a),
    box(0.16, 0.06, 0.3, 0, 1.14, len / 2 + len * 0.26 + 0.56, 0xe8dcc0),
    cone(0.04, 0.2, -0.07, 1.42, len / 2 + len * 0.26 + 0.44, 0xe8dcc0, 4),
    cone(0.04, 0.2, 0.07, 1.42, len / 2 + len * 0.26 + 0.44, 0xe8dcc0, 4),
    box(0.14, 0.95, 0.14, 0, 0.25, -len / 2 - len * 0.16, DARK, false, 0, -0.45),
    ball(0.13, 0, 1.08, -len / 2 - len * 0.16 - 0.42, DARK),
    cyl(0.06, 0.08, mast, 0, 0.42, 0.1, WOOD, 6),
    log(0.045, sailW + 0.3, 0, 0.42 + mast - 0.1, 0.16, WOOD, 5, false, true),
  ];
  const strips = 6;
  for (let i = 0; i < strips; i++) {
    const x = (i - (strips - 1) / 2) * (sailW / strips);
    const team = i % 2 === 0;
    parts.push(box(sailW / strips, sailH, 0.05, x, 0.42 + mast - 0.1 - sailH, 0.18, CLOTH, team));
  }
  const n = Math.max(3, Math.round(len / 0.55));
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + 0.3 + (i * (len - 0.6)) / (n - 1);
    for (const side of [-1, 1]) {
      parts.push(log(0.17, 0.05, side * (w / 2 + 0.03), 0.42, z, 0xd9c36a, 8, i % 2 === 0, true));
      if (!cargo) parts.push(box(1.15, 0.04, 0.07, side * (w / 2 + 0.55), 0.3, z, WOODL, false, 0, 0, side * -0.25));
    }
  }
  if (cargo) {
    parts.push(box(w * 0.6, 0.35, 0.6, 0, 0.47, -len * 0.25, 0x8a7a55), cyl(0.18, 0.18, 0.32, 0.2, 0.47, len * 0.22, WOOD, 6));
  }
  return build(parts);
}

/** Southern galleys: two masts with slanted triangular sails, a bronze ram, a tented stern. */
function lateen(len: number, w: number, masts: number, cargo = false): Model {
  const BRONZE = 0xb08d4a;
  const parts: Part[] = [
    ...hull(w, 0.62, len, 0x6a4a2c),
    box(w * 0.86, 0.07, len * 0.94, 0, 0.62, 0, WOODL),
    box(w * 0.9, 0.5, len * 0.2, 0, 0.69, -len * 0.38, WOOD),
    gable(w * 1.0, 0.4, len * 0.24, 0, 1.19, -len * 0.38, 0, true),
    prow(0.14, 0.9, 1, 0, 0.2, len / 2 + len * 0.3, BRONZE),
    log(0.07, 0.6, 0, 0.82, len * 0.42, BRONZE, 6),
  ];
  for (let m = 0; m < masts; m++) {
    const z = masts === 1 ? 0.1 : len * 0.2 - m * len * 0.4;
    const h = 2.6 - m * 0.4;
    parts.push(cyl(0.07, 0.09, h, 0, 0.62, z, WOOD, 6));
    parts.push(box(0.06, 0.06, 2.9 - m * 0.4, 0, 0.62 + h * 0.9, z, WOOD, false, 0, 0.5));
    parts.push(tri([0, 0.62 + h * 1.25, z - 1.2 + m * 0.2], [0.02, 0.62 + h * 0.5, z + 1.2 - m * 0.2], [0, 0.95, z - 0.2], CLOTH, true));
  }
  if (!cargo) {
    for (let i = 0; i < 6; i++) {
      for (const side of [-1, 1]) {
        parts.push(box(1.3, 0.05, 0.08, side * (w / 2 + 0.6), 0.36, -len * 0.3 + i * (len * 0.12), WOODL, false, 0, 0, side * -0.26));
      }
    }
  } else {
    parts.push(box(w * 0.5, 0.4, 0.7, 0, 0.69, len * 0.1, 0x8a7a55), box(w * 0.4, 0.3, 0.5, 0, 0.69, len * 0.3, 0xb89f6e));
  }
  return build(parts);
}

/** Eastern junks: a slab hull with a high stern, and battened sails. */
function junk(len: number, w: number, masts: number): Model {
  const RED = 0x7a2f22;
  const parts: Part[] = [
    box(w, 0.6, len, 0, 0, 0, RED),
    box(w * 1.02, 0.12, len * 1.02, 0, 0.6, 0, 0x3d2a1a),
    box(w, 0.75, len * 0.26, 0, 0.6, -len * 0.37, RED),
    box(w * 1.04, 0.1, len * 0.28, 0, 1.35, -len * 0.37, 0x3d2a1a),
    box(w * 0.9, 0.45, len * 0.16, 0, 0.5, len * 0.5, RED, false, 0, -0.35),
    box(0.1, 0.9, 0.5, 0, -0.2, -len * 0.52, 0x3d2a1a),
    gable(w * 0.8, 0.3, len * 0.2, 0, 1.45, -len * 0.37, 0, true),
  ];
  for (let m = 0; m < masts; m++) {
    const z = masts === 1 ? 0.2 : len * 0.3 - (m * len * 0.6) / (masts - 1);
    const h = m === Math.floor(masts / 2) ? 3.1 : 2.5;
    const sw = m === Math.floor(masts / 2) ? w * 1.5 : w * 1.2;
    parts.push(cyl(0.07, 0.09, h, 0, 0.6, z, WOOD, 6));
    parts.push(box(sw, h * 0.72, 0.05, 0.12, 0.6 + h * 0.24, z + 0.1, 0, true));
    for (let b = 0; b < 5; b++) {
      parts.push(box(sw + 0.1, 0.035, 0.07, 0.12, 0.6 + h * 0.24 + (b * h * 0.72) / 4 - 0.02, z + 0.1, 0x3d2a1a));
    }
  }
  return build(parts);
}

/** A very large rubber duck. */
function duck(s: number, crate = false): Model {
  const Y = 0xf7d038;
  const parts: Part[] = [
    ball(1.0, 0, 0.55, 0, Y, false, 0.95, 0.72, 1.35),
    ball(0.5, 0, 0.9, -1.25, Y, false, 0.8, 0.6, 0.9),
    ball(0.62, 0, 1.55, 0.85, Y),
    box(0.5, 0.12, 0.5, 0, 1.42, 1.5, 0xf08a1c),
    box(0.44, 0.08, 0.4, 0, 1.3, 1.46, 0xd9701a),
    ball(0.09, -0.3, 1.72, 1.32, 0x16110d),
    ball(0.09, 0.3, 1.72, 1.32, 0x16110d),
    ball(0.5, -0.82, 0.62, -0.05, Y, false, 0.4, 0.62, 1.1),
    ball(0.5, 0.82, 0.62, -0.05, Y, false, 0.4, 0.62, 1.1),
    cyl(0.6, 0.62, 0.16, 0, 1.08, 0.82, 0, 10, true),
    cyl(0.04, 0.04, 1.3, 0, 1.2, -0.5, WOOD, 5),
    box(0.8, 0.5, 0.05, 0.42, 2.0, -0.5, 0, true),
  ];
  if (crate) parts.push(box(0.7, 0.5, 0.7, 0, 1.15, -0.1, 0x8a7a55));
  return build(parts, s);
}

register("norse", { galley: norse(4.2, 1.1, 2.6, 1.5, 3.0), longship: norse(3.0, 0.85, 1.7, 1.0, 2.1), cog: norse(2.8, 1.35, 2.0, 1.3, 2.6, true) });
register("lateen", { galley: lateen(4.0, 1.25, 2), longship: lateen(2.9, 0.9, 1), cog: lateen(2.8, 1.45, 2, true) });
register("junk", { galley: junk(3.8, 1.35, 3), longship: junk(2.6, 0.95, 1), cog: junk(3.0, 1.5, 2) });
register("duck", { galley: duck(1.25), longship: duck(0.85), cog: duck(1.05, true) });

// ================================================================ architecture

// ---- Desert: sandstone, flat roofs, domes and minarets.
const SAND = 0xd9c391;
const SAND_D = 0xb89f6e;

function flatHouse(x: number, z: number, ry: number, s = 1, domed = false): Part[] {
  const p = [
    box(0.9 * s, 0.6 * s, 0.8 * s, 0, 0, 0, SAND, false, ry),
    box(0.98 * s, 0.09 * s, 0.88 * s, 0, 0.6 * s, 0, SAND_D, false, ry),
    box(0.18 * s, 0.32 * s, 0.05, 0, 0, 0.4 * s, 0x5b3f27, false, ry),
  ];
  if (domed) p.push(dome(0.3 * s, 0, 0.66 * s, 0, 0, true));
  for (const q of p) q.g.translate(x, 0, z);
  return p;
}

function palm(x: number, z: number): Part[] {
  const p: Part[] = [cyl(0.06, 0.09, 1.3, x, 0, z, 0x7a5a3a, 5)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    p.push(box(0.7, 0.04, 0.16, x + Math.sin(a) * 0.3, 1.25, z + Math.cos(a) * 0.3, 0x3f7a34, false, a + Math.PI / 2, 0, -0.35));
  }
  return p;
}

const desert = (): Record<string, Model> => ({
  town: build([
    ...ring(10, 2.45, (x, z, a, i) => (i === 2 ? null : box(1.62, 0.6, 0.26, x, 0, z, SAND, false, a))),
    ...ring(5, 2.45, (x, z) => box(0.4, 0.95, 0.4, x, 0, z, SAND_D)),
    ...flatHouse(-1.1, -0.9, 0.3),
    ...flatHouse(1.1, -1.0, -0.4, 1, true),
    ...flatHouse(1.2, 0.8, 1.2, 0.9),
    ...flatHouse(-1.3, 0.9, 2.0, 0.9, true),
    box(1.1, 0.95, 1.1, 0, 0, 0, SAND),
    dome(0.6, 0, 0.95, 0, 0, true, 1.1),
    cyl(0.13, 0.16, 2.4, 0.75, 0, 0.75, SAND_D, 8),
    cyl(0.22, 0.22, 0.1, 0.75, 1.9, 0.75, SAND, 8),
    cone(0.18, 0.5, 0.75, 2.4, 0.75, 0, 8, true),
    ...palm(-0.3, 1.5),
    ...palm(0.5, -1.7),
  ]),
  keep: build([
    box(3.5, 0.5, 3.5, 0, 0, 0, SAND_D),
    box(2.3, 2.3, 2.3, 0, 0.5, 0, SAND),
    ...ring(12, 1.25, (x, z) => box(0.3, 0.26, 0.3, Math.sign(x) * Math.min(1.1, Math.abs(x) * 1.2), 2.8, Math.sign(z) * Math.min(1.1, Math.abs(z) * 1.2), SAND_D)),
    ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [box(0.85, 3.0, 0.85, sx * 1.4, 0, sz * 1.4, SAND), dome(0.46, sx * 1.4, 3.0, sz * 1.4, 0, true, 1.1)])),
    dome(0.95, 0, 2.8, 0, 0, true, 0.9),
    box(0.6, 1.1, 0.08, 0, 0.5, 1.16, 0x5b3f27),
    ...flag(0, 3.6, 0),
  ]),
  harbour: build([
    box(3.6, 0.22, 0.9, 0, 0.1, 0.6, WOODL),
    box(0.9, 0.22, 2.6, -1.1, 0.1, 1.9, WOODL),
    box(0.9, 0.22, 2.2, 1.2, 0.1, 1.7, WOODL),
    box(1.9, 0.95, 1.3, -0.6, 0.1, -0.7, SAND),
    dome(0.6, -0.6, 1.05, -0.7, 0, true),
    cyl(0.22, 0.28, 2.6, 1.3, 0.1, -0.8, SAND_D, 8),
    cone(0.28, 0.5, 1.3, 2.7, -0.8, 0, 8, true),
    cyl(0.2, 0.2, 0.36, 0.5, 0.32, 0.5, WOOD, 6),
    box(0.5, 0.36, 0.5, 0.0, 0.32, 0.8, 0x8a7a55),
    ...[[-1.5, 3.0], [-0.7, 3.0], [0.8, 2.6], [1.6, 2.6]].map(([x, z]) => cyl(0.09, 0.09, 0.9, x, -0.4, z, WOOD, 5)),
  ]),
  market: build([
    box(2.8, 0.7, 1.3, 0, 0, -1.0, SAND),
    box(2.9, 0.1, 1.4, 0, 0.7, -1.0, SAND_D),
    ...[-0.9, 0, 0.9].map((x) => box(0.5, 0.5, 0.06, x, 0, -0.34, 0x5b3f27)),
    ...[-1.2, 0, 1.2].flatMap((x, i) => [
      cyl(0.03, 0.03, 0.9, x - 0.4, 0, 0.6, WOOD, 4),
      cyl(0.03, 0.03, 0.9, x + 0.4, 0, 0.6, WOOD, 4),
      cyl(0.03, 0.03, 0.9, x - 0.4, 0, 1.4, WOOD, 4),
      cyl(0.03, 0.03, 0.9, x + 0.4, 0, 1.4, WOOD, 4),
      box(0.95, 0.06, 0.95, x, 0.9, 1.0, [0xd9c36a, 0xa8358f, 0x2c6fb3][i], i === 1),
      box(0.6, 0.3, 0.5, x, 0, 1.0, WOODL),
    ]),
    ...palm(2.0, -0.2),
    box(1.2, 0.03, 0.8, 0, 0.01, 2.0, 0, true),
  ]),
  mageTower: build([
    cyl(1.05, 1.25, 0.6, 0, 0, 0, SAND_D, 10),
    cyl(0.5, 0.72, 4.2, 0, 0.6, 0, SAND, 10),
    cyl(0.85, 0.6, 0.25, 0, 3.6, 0, SAND_D, 10),
    cyl(0.85, 0.85, 0.12, 0, 3.85, 0, SAND, 10),
    cyl(0.4, 0.5, 1.1, 0, 4.8, 0, SAND, 10),
    ...onion(0.62, 0, 5.9, 0, 0, true),
    crystal(7.9),
  ]),
  ballistaTower: build([
    box(2.3, 1.9, 2.3, 0, 0, 0, SAND),
    box(2.5, 0.2, 2.5, 0, 1.9, 0, SAND_D),
    ...ring(8, 1.2, (x, z) => box(0.4, 0.34, 0.4, Math.sign(Math.round(x * 2)) * 1.05, 2.1, Math.sign(Math.round(z * 2)) * 1.05, SAND_D)),
    ...ballista(2.1),
    ...flag(-0.9, 2.1, -0.9),
  ]),
});

// ---- Nordic: dark timber, steep roofs, palisades.
const TIMBER = 0x4a3526;
const TIMBER_L = 0x6e5236;

function longhouse(x: number, z: number, ry: number, s = 1): Part[] {
  const p = [
    box(0.8 * s, 0.38 * s, 1.6 * s, 0, 0, 0, TIMBER, false, ry),
    gable(1.0 * s, 0.75 * s, 1.75 * s, 0, 0.38 * s, 0, 0, true, ry),
    box(0.05, 0.36 * s, 0.05, 0, 0.95 * s, 0.86 * s, TIMBER_L, false, ry, 0, 0.6),
    box(0.05, 0.36 * s, 0.05, 0, 0.95 * s, 0.86 * s, TIMBER_L, false, ry, 0, -0.6),
  ];
  for (const q of p) q.g.translate(x, 0, z);
  return p;
}

const palisade = (r: number, n: number, y = 0, h = 0.85, gate = -1) =>
  ring(n, r, (x, z, _a, i) => (i === gate ? null : [cyl(0.085, 0.1, h, x, y, z, TIMBER_L, 5), cone(0.085, 0.16, x, y + h, z, TIMBER, 5)]));

const nordic = (): Record<string, Model> => ({
  town: build([
    ...palisade(2.5, 26, 0, 0.85, 5),
    ...longhouse(-1.2, -0.7, 0.2),
    ...longhouse(1.1, -0.9, -0.5),
    ...longhouse(1.2, 0.9, 1.3, 0.85),
    ...longhouse(-1.2, 1.0, 1.9, 0.85),
    // The stave church: roof on roof on roof.
    box(0.9, 0.6, 0.9, 0, 0, 0.1, TIMBER),
    cone(0.85, 0.6, 0, 0.6, 0.1, 0, 4, true),
    box(0.55, 0.45, 0.55, 0, 1.0, 0.1, TIMBER),
    cone(0.55, 0.55, 0, 1.45, 0.1, 0, 4, true),
    box(0.25, 0.35, 0.25, 0, 1.85, 0.1, TIMBER),
    cone(0.24, 0.9, 0, 2.2, 0.1, 0, 4, true),
  ]),
  keep: build([
    cyl(2.0, 2.6, 0.9, 0, 0, 0, 0x5d7038, 12),
    ...palisade(1.85, 20, 0.9, 0.8, 3),
    box(1.5, 2.4, 1.5, 0, 0.9, 0, TIMBER),
    box(1.95, 0.7, 1.95, 0, 3.0, 0, TIMBER_L),
    cone(1.5, 1.2, 0, 3.7, 0, 0, 4, true),
    box(0.5, 0.9, 0.08, 0, 0.9, 0.76, 0x2a1d13),
    ...flag(0, 4.6, 0),
  ]),
  harbour: build([
    box(3.6, 0.22, 0.9, 0, 0.1, 0.6, TIMBER_L),
    box(0.9, 0.22, 2.8, -1.1, 0.1, 2.0, TIMBER_L),
    box(0.9, 0.22, 2.2, 1.2, 0.1, 1.7, TIMBER_L),
    box(1.3, 0.5, 2.0, -0.6, 0.1, -0.9, TIMBER),
    gable(1.6, 1.0, 2.2, -0.6, 0.6, -0.9, 0, true),
    ...hull(0.5, 0.25, 1.5, 0x5a3b22).map((p) => (p.g.translate(1.3, 0.3, -0.6), p)),
    cyl(0.04, 0.04, 1.2, 0.4, 0.32, 0.3, TIMBER, 4),
    cyl(0.04, 0.04, 1.2, 1.0, 0.32, 0.3, TIMBER, 4),
    box(0.75, 0.05, 0.05, 0.7, 1.4, 0.3, TIMBER),
    ...[[-1.5, 3.2], [-0.7, 3.2], [0.8, 2.6], [1.6, 2.6]].map(([x, z]) => cyl(0.09, 0.09, 0.9, x, -0.4, z, TIMBER, 5)),
  ]),
  market: build([
    box(1.2, 0.5, 2.9, 0, 0, -0.9, TIMBER, false, Math.PI / 2),
    gable(1.5, 1.05, 3.1, 0, 0.5, -0.9, 0, true, Math.PI / 2),
    box(0.06, 0.5, 0.06, -1.55, 1.3, -0.9, TIMBER_L, false, 0, 0, 0.6),
    box(0.06, 0.5, 0.06, -1.55, 1.3, -0.9, TIMBER_L, false, 0, 0, -0.6),
    ...[-1.0, 0.2, 1.3].flatMap((x, i) => [
      box(0.7, 0.3, 0.5, x, 0, 1.0, TIMBER_L),
      gable(0.8, 0.34, 0.95, x, 0.78, 1.0, [0x8a2f2f, 0xd9c36a, 0x3d5f8a][i], false, Math.PI / 2),
      cyl(0.03, 0.03, 0.78, x - 0.4, 0, 1.0, TIMBER, 4),
      cyl(0.03, 0.03, 0.78, x + 0.4, 0, 1.0, TIMBER, 4),
    ]),
    cyl(0.3, 0.3, 0.3, -1.9, 0, 1.3, 0x77736b, 8),
    ...flag(2.0, 0, 1.4),
  ]),
  mageTower: build([
    ...ring(7, 1.5, (x, z, a) => box(0.3, 0.9 + (a % 1) * 0.4, 0.16, x, 0, z, 0x8a8f96, false, a)),
    box(0.9, 4.4, 0.9, 0, 0, 0, TIMBER),
    box(1.25, 0.5, 1.25, 0, 4.0, 0, TIMBER_L),
    box(1.0, 0.1, 1.0, 0, 2.2, 0, TIMBER_L),
    cone(1.0, 2.2, 0, 4.5, 0, 0, 4, true),
    crystal(7.9),
  ]),
  ballistaTower: build([
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => cyl(0.12, 0.16, 1.9, sx * 0.9, 0, sz * 0.9, TIMBER, 6))),
    box(2.3, 0.05, 0.1, 0, 0.9, 0.9, TIMBER_L, false, 0, 0, 0.5),
    box(2.3, 0.05, 0.1, 0, 0.9, -0.9, TIMBER_L, false, 0, 0, -0.5),
    box(2.4, 0.18, 2.4, 0, 1.9, 0, TIMBER_L),
    ...ring(12, 1.15, (x, z) => cyl(0.05, 0.05, 0.5, Math.sign(Math.round(x * 2)) * 1.12, 2.08, Math.sign(Math.round(z * 2)) * 1.12, TIMBER, 4)),
    ...ballista(2.08),
    ...flag(-0.9, 2.08, -0.9),
  ]),
});

// ---- Eastern: white walls, tent roofs, onion domes.
const WHITE = 0xf1ede2;
const BRICK = 0x9a4a36;
const GOLD = 0xe0b84a;

function tentHouse(x: number, z: number, ry: number, s = 1): Part[] {
  const p = [box(0.8 * s, 0.6 * s, 0.8 * s, 0, 0, 0, WHITE, false, ry), cone(0.68 * s, 0.7 * s, 0, 0.6 * s, 0, 0x7a4a2e, 4)];
  p[1].g.rotateY(ry);
  for (const q of p) q.g.translate(x, 0, z);
  return p;
}

const eastern = (): Record<string, Model> => ({
  town: build([
    ...ring(10, 2.45, (x, z, a, i) => (i === 2 ? null : box(1.62, 0.6, 0.24, x, 0, z, WHITE, false, a))),
    ...ring(5, 2.45, (x, z) => [cyl(0.24, 0.28, 0.9, x, 0, z, WHITE, 8), cone(0.32, 0.6, x, 0.9, z, 0, 8, true)]),
    ...tentHouse(-1.2, -0.9, 0.3),
    ...tentHouse(1.1, -1.1, -0.5),
    ...tentHouse(1.25, 0.8, 1.2, 0.9),
    ...tentHouse(-1.3, 0.9, 2.0, 0.9),
    box(1.2, 1.0, 1.2, 0, 0, 0, WHITE),
    cyl(0.3, 0.3, 0.5, 0, 1.0, 0, WHITE, 8),
    ...onion(0.42, 0, 1.5, 0, 0, true),
    ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [cyl(0.12, 0.12, 0.3, sx * 0.42, 1.0, sz * 0.42, WHITE, 6), ...onion(0.17, sx * 0.42, 1.3, sz * 0.42, GOLD)])),
  ]),
  keep: build([
    box(3.5, 1.5, 3.5, 0, 0, 0, BRICK),
    ...ring(16, 1.7, (x, z) => box(0.28, 0.3, 0.28, Math.max(-1.62, Math.min(1.62, x * 1.4)), 1.5, Math.max(-1.62, Math.min(1.62, z * 1.4)), BRICK)),
    ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [cyl(0.5, 0.56, 2.6, sx * 1.6, 0, sz * 1.6, BRICK, 8), cone(0.62, 1.3, sx * 1.6, 2.6, sz * 1.6, 0, 8, true)])),
    box(1.3, 3.2, 1.3, 0, 0.6, 0, BRICK),
    box(1.5, 0.2, 1.5, 0, 3.8, 0, WHITE),
    cone(0.95, 1.8, 0, 4.0, 0, 0, 4, true),
    ball(0.14, 0, 5.9, 0, GOLD),
    box(0.6, 1.0, 0.08, 0, 0, 1.76, 0x3d2a1a),
  ]),
  harbour: build([
    box(3.6, 0.22, 0.9, 0, 0.1, 0.6, WOODL),
    box(0.9, 0.22, 2.6, -1.1, 0.1, 1.9, WOODL),
    box(0.9, 0.22, 2.2, 1.2, 0.1, 1.7, WOODL),
    box(1.9, 0.9, 1.3, -0.6, 0.1, -0.7, WHITE),
    cone(1.25, 0.9, -0.6, 1.0, -0.7, 0, 4, true),
    cyl(0.2, 0.24, 1.6, 1.3, 0.1, -0.8, WHITE, 8),
    ...onion(0.28, 1.3, 1.7, -0.8, GOLD),
    cyl(0.2, 0.2, 0.36, 0.5, 0.32, 0.5, WOOD, 6),
    ...[[-1.5, 3.0], [-0.7, 3.0], [0.8, 2.6], [1.6, 2.6]].map(([x, z]) => cyl(0.09, 0.09, 0.9, x, -0.4, z, WOOD, 5)),
  ]),
  market: build([
    box(2.9, 0.8, 1.2, 0, 0, -1.0, WHITE),
    ...[-0.95, 0, 0.95].flatMap((x) => [box(0.55, 0.55, 0.06, x, 0, -0.38, 0x3d2a1a), cone(0.62, 0.8, x, 0.8, -1.0, 0, 4, true)]),
    ...[-1.0, 0.2, 1.3].flatMap((x, i) => [
      box(0.7, 0.3, 0.5, x, 0, 1.0, WOODL),
      cone(0.6, 0.45, x, 0.8, 1.0, [0x8a2f2f, GOLD, 0x3d5f8a][i], 4),
      cyl(0.03, 0.03, 0.8, x - 0.36, 0, 0.75, WOOD, 4),
      cyl(0.03, 0.03, 0.8, x + 0.36, 0, 1.25, WOOD, 4),
    ]),
    cyl(0.3, 0.3, 0.3, -1.9, 0, 1.3, 0x77736b, 8),
  ]),
  mageTower: build([
    cyl(1.0, 1.2, 0.6, 0, 0, 0, BRICK, 10),
    cyl(0.55, 0.75, 3.9, 0, 0.6, 0, WHITE, 10),
    cyl(0.8, 0.6, 0.3, 0, 4.2, 0, BRICK, 10),
    cyl(0.5, 0.5, 0.7, 0, 4.5, 0, WHITE, 10),
    ...onion(0.8, 0, 5.2, 0, 0, true),
    crystal(7.9),
  ]),
  ballistaTower: build([
    cyl(1.25, 1.4, 1.9, 0, 0, 0, WHITE, 10),
    cyl(1.42, 1.25, 0.25, 0, 1.9, 0, BRICK, 10),
    ...ring(10, 1.27, (x, z, a) => box(0.4, 0.34, 0.26, x, 2.15, z, BRICK, false, a)),
    ...ballista(2.15),
    ...flag(-0.9, 2.15, -0.7),
  ]),
});

register("desert", desert());
register("nordic", nordic());
register("eastern", eastern());
