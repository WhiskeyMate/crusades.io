// Every model in the game, built from boxes, cylinders and cones at start-up.
// Each one comes as two meshes: a body with baked colours and the parts that
// take the owner's colour (roofs, sails, tabards, banners).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RGB } from "../client/Heraldry";

interface Part {
  g: THREE.BufferGeometry;
  team: boolean;
}

export interface Model {
  body: THREE.BufferGeometry;
  team: THREE.BufferGeometry | null;
}

const tmpColor = new THREE.Color();

function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute("uv");
  const n = out.attributes.position.count;
  const colors = new Float32Array(n * 3);
  tmpColor.setHex(hex);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  out.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  out.computeVertexNormals();
  return out;
}

const TEAM = 0xffffff;

/** A box standing on y. */
function box(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  color: number, team = false, ry = 0, rx = 0, rz = 0,
): Part {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return { g: paint(g, team ? TEAM : color), team };
}

function cyl(
  rTop: number, rBot: number, h: number,
  x: number, y: number, z: number,
  color: number, seg = 8, team = false,
): Part {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y + h / 2, z);
  return { g: paint(g, team ? TEAM : color), team };
}

/** A cylinder lying along z, centred on (x, y, z). */
function log(
  r: number, len: number,
  x: number, y: number, z: number,
  color: number, seg = 8, team = false, alongX = false,
): Part {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (alongX) g.rotateZ(Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return { g: paint(g, team ? TEAM : color), team };
}

function cone(
  r: number, h: number,
  x: number, y: number, z: number,
  color: number, seg = 4, team = false,
): Part {
  const g = new THREE.ConeGeometry(r, h, seg);
  if (seg === 4) g.rotateY(Math.PI / 4);
  g.translate(x, y + h / 2, z);
  return { g: paint(g, team ? TEAM : color), team };
}

/** A cone pointing along +z (or -z), for prows. */
function prow(
  r: number, len: number, sy: number,
  x: number, y: number, z: number,
  color: number, back = false,
): Part {
  const g = new THREE.ConeGeometry(r, len, 4);
  g.rotateY(Math.PI / 4);
  g.rotateX(back ? -Math.PI / 2 : Math.PI / 2);
  g.scale(1, sy, 1);
  g.translate(x, y, z + (back ? -len / 2 : len / 2));
  return { g: paint(g, color), team: false };
}

/** A gable roof with its ridge along z. */
function gable(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  color: number, team = false, ry = 0,
): Part {
  const a = w / 2;
  const b = d / 2;
  // prettier-ignore
  const v = [
    -a, 0, b,  a, 0, b,  0, h, b,
     a, 0, -b, -a, 0, -b, 0, h, -b,
    -a, 0, -b, -a, 0, b,  0, h, b,
    -a, 0, -b,  0, h, b,  0, h, -b,
     a, 0, b,   a, 0, -b, 0, h, -b,
     a, 0, b,   0, h, -b, 0, h, b,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return { g: paint(g, team ? TEAM : color), team };
}

function blob(
  r: number, x: number, y: number, z: number, color: number, sy = 1,
): Part {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return { g: paint(g, color), team: false };
}

function build(parts: Part[], scale = 1): Model {
  const body = parts.filter((p) => !p.team).map((p) => p.g);
  const team = parts.filter((p) => p.team).map((p) => p.g);
  const b = mergeGeometries(body, false)!;
  const t = team.length > 0 ? mergeGeometries(team, false)! : null;
  if (scale !== 1) {
    b.scale(scale, scale, scale);
    t?.scale(scale, scale, scale);
  }
  return { body: b, team: t };
}

const STONE = 0x9a958c;
const STONE_DARK = 0x77736b;
const WOOD = 0x6b4a2e;
const WOOD_LIGHT = 0x9a7648;
const PLASTER = 0xdccfae;
const THATCH = 0xb59a55;

function house(x: number, z: number, ry: number, s = 1): Part[] {
  const parts = [
    box(0.9 * s, 0.55 * s, 0.7 * s, 0, 0, 0, PLASTER, false, ry),
    gable(0.7 * s + 0.08, 0.42 * s, 0.9 * s + 0.1, 0, 0.55 * s, 0, 0, true, ry + Math.PI / 2),
  ];
  for (const p of parts) p.g.translate(x, 0, z);
  return parts;
}

function town(): Model {
  const parts: Part[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    if (i === 2) continue; // the gate
    parts.push(box(1.62, 0.55, 0.24, Math.sin(a) * 2.45, 0, Math.cos(a) * 2.45, STONE, false, a));
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    parts.push(cyl(0.26, 0.3, 0.85, Math.sin(a) * 2.45, 0, Math.cos(a) * 2.45, STONE_DARK, 6));
  }
  parts.push(...house(-1.1, -0.9, 0.3));
  parts.push(...house(1.0, -1.1, -0.5));
  parts.push(...house(1.2, 0.7, 1.2, 0.9));
  parts.push(...house(-1.3, 0.8, 2.0, 0.9));
  parts.push(...house(0.0, 1.4, 0.1, 0.85));
  // The church.
  parts.push(box(0.75, 0.9, 1.3, 0, 0, -0.1, STONE));
  parts.push(gable(0.85, 0.5, 1.4, 0, 0.9, -0.1, 0, true));
  parts.push(box(0.55, 1.9, 0.55, 0, 0, 0.75, STONE));
  parts.push(cone(0.48, 1.0, 0, 1.9, 0.75, 0, 4, true));
  return build(parts);
}

function keep(): Model {
  const parts: Part[] = [
    box(3.4, 0.6, 3.4, 0, 0, 0, STONE_DARK),
    box(1.9, 2.9, 1.9, 0, 0.6, 0, STONE),
    cyl(0.04, 0.04, 1.5, 0, 3.7, 0, WOOD, 5),
    box(0.9, 0.5, 0.05, 0.47, 4.6, 0, 0, true),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(cyl(0.5, 0.56, 2.6, sx * 1.45, 0, sz * 1.45, STONE, 8));
      parts.push(cone(0.62, 0.9, sx * 1.45, 2.6, sz * 1.45, 0, 8, true));
    }
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(box(0.36, 0.3, 0.36, Math.sin(a) * 0.82, 3.5, Math.cos(a) * 0.82, STONE_DARK));
  }
  return build(parts);
}

function harbour(): Model {
  const parts: Part[] = [
    box(3.6, 0.22, 0.9, 0, 0.1, 0.6, WOOD_LIGHT),
    box(0.9, 0.22, 2.6, -1.1, 0.1, 1.9, WOOD_LIGHT),
    box(0.9, 0.22, 2.2, 1.2, 0.1, 1.7, WOOD_LIGHT),
    box(1.9, 0.95, 1.3, -0.6, 0.1, -0.7, PLASTER),
    gable(1.5, 0.6, 2.1, -0.6, 1.05, -0.7, 0, true, Math.PI / 2),
    box(0.16, 1.9, 0.16, 1.3, 0.3, 0.3, WOOD),
    box(0.12, 0.12, 1.5, 1.3, 2.05, 0.9, WOOD, false, 0, -0.35),
    cyl(0.2, 0.2, 0.36, 0.5, 0.32, 0.5, WOOD, 6),
    cyl(0.2, 0.2, 0.36, 0.1, 0.32, 0.75, WOOD, 6),
    cyl(0.04, 0.04, 1.6, -1.4, 1.0, -1.2, WOOD, 5),
    box(0.7, 0.42, 0.05, -1.03, 2.1, -1.2, 0, true),
  ];
  for (const [x, z] of [[-1.5, 3.0], [-0.7, 3.0], [0.8, 2.6], [1.6, 2.6], [-1.7, 0.6], [1.7, 0.6]]) {
    parts.push(cyl(0.09, 0.09, 0.9, x, -0.4, z, WOOD, 5));
  }
  return build(parts);
}

function market(): Model {
  const parts: Part[] = [
    box(2.7, 1.0, 1.5, 0, 0, -0.9, PLASTER),
    gable(1.8, 0.85, 2.9, 0, 1.0, -0.9, 0, true, Math.PI / 2),
    box(0.3, 1.5, 0.3, 1.0, 0, -0.9, STONE),
    cyl(0.3, 0.3, 0.3, -1.6, 0, 1.2, STONE_DARK, 8),
    cyl(0.06, 0.06, 2.0, 1.9, 0, 1.3, WOOD, 5),
    box(0.8, 0.45, 0.05, 2.32, 1.5, 1.3, 0, true),
  ];
  const stalls: [number, number, number][] = [[-0.8, 0.9, 0x8a2f2f], [0.3, 1.3, 0xd9c36a], [1.2, 0.6, 0x3d5f8a]];
  for (const [x, z, c] of stalls) {
    parts.push(box(0.7, 0.32, 0.5, x, 0, z, WOOD_LIGHT));
    parts.push(gable(0.75, 0.3, 0.9, x, 0.75, z, c, false, Math.PI / 2));
    for (const dx of [-0.38, 0.38]) parts.push(cyl(0.03, 0.03, 0.75, x + dx, 0, z, WOOD, 4));
  }
  return build(parts);
}

function mageTower(): Model {
  const parts: Part[] = [
    cyl(1.0, 1.25, 0.6, 0, 0, 0, STONE_DARK, 10),
    cyl(0.55, 0.82, 3.8, 0, 0.6, 0, 0x7a7390, 10),
    cyl(0.98, 0.7, 0.3, 0, 4.4, 0, STONE_DARK, 10),
    cyl(0.72, 0.72, 0.9, 0, 4.7, 0, 0x7a7390, 10),
    cone(0.95, 1.6, 0, 5.6, 0, 0, 10, true),
  ];
  const crystal = new THREE.OctahedronGeometry(0.34, 0);
  crystal.scale(1, 1.6, 1);
  crystal.translate(0, 7.9, 0);
  parts.push({ g: paint(crystal, 0x9ff3ff), team: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    parts.push(box(0.14, 0.5, 0.06, Math.sin(a) * 0.62, 2.2, Math.cos(a) * 0.62, 0xf2d27a, false, a));
  }
  return build(parts);
}

function ballistaTower(): Model {
  const parts: Part[] = [
    cyl(1.25, 1.45, 1.9, 0, 0, 0, STONE, 10),
    cyl(1.4, 1.25, 0.25, 0, 1.9, 0, STONE_DARK, 10),
    box(0.22, 0.22, 2.3, 0, 2.5, 0.1, WOOD, false, 0, -0.3),
    box(2.0, 0.12, 0.14, 0, 2.95, 0.75, WOOD_LIGHT),
    box(0.5, 0.5, 0.7, 0, 2.15, -0.1, WOOD),
    cyl(0.04, 0.04, 1.6, -0.9, 2.15, -0.7, WOOD, 5),
    box(0.75, 0.45, 0.05, -0.5, 3.25, -0.7, 0, true),
  ];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push(box(0.4, 0.34, 0.26, Math.sin(a) * 1.25, 2.15, Math.cos(a) * 1.25, STONE_DARK, false, a));
  }
  return build(parts);
}

function hull(w: number, h: number, len: number, color: number): Part[] {
  return [
    box(w, h, len, 0, 0, 0, color),
    prow(w * 0.707, len * 0.36, h / w, 0, h / 2, len / 2, color),
    prow(w * 0.707, len * 0.22, h / w, 0, h / 2, -len / 2, color, true),
  ];
}

function galley(): Model {
  const parts: Part[] = [
    ...hull(1.3, 0.7, 3.6, 0x5a3b22),
    box(1.1, 0.08, 3.4, 0, 0.7, 0, WOOD_LIGHT),
    box(1.2, 0.55, 0.9, 0, 0.78, -1.4, WOOD),
    cyl(0.08, 0.1, 3.0, 0, 0.7, 0.2, WOOD, 6),
    box(2.3, 1.6, 0.07, 0, 1.9, 0.28, 0, true),
    log(0.05, 2.5, 0, 3.55, 0.25, WOOD, 5, false, true),
    cone(0.12, 0.9, 0, 0.1, 0, 0x8a8f96, 6),
    cyl(0.03, 0.03, 0.9, 0, 1.3, -1.6, WOOD, 4),
    box(0.55, 0.32, 0.04, 0.29, 1.85, -1.6, 0, true),
  ];
  parts[parts.length - 3].g.rotateX(Math.PI / 2).translate(0, 0.1, 4.4);
  for (let i = 0; i < 5; i++) {
    for (const side of [-1, 1]) {
      parts.push(box(1.3, 0.05, 0.09, side * 1.15, 0.42, -1.1 + i * 0.6, WOOD_LIGHT, false, 0, 0, side * -0.28));
    }
  }
  return build(parts);
}

function longship(): Model {
  const parts: Part[] = [
    ...hull(0.85, 0.42, 3.0, 0x4d3320),
    cyl(0.05, 0.06, 1.9, 0, 0.4, 0.1, WOOD, 5),
    box(1.5, 1.0, 0.05, 0, 1.15, 0.15, 0, true),
    box(0.3, 0.9, 0.05, -0.45, 1.2, 0.18, 0xf0e6cc),
    box(0.3, 0.9, 0.05, 0.45, 1.2, 0.18, 0xf0e6cc),
    box(0.14, 0.6, 0.14, 0, 0.3, 2.35, 0x4d3320, false, 0, 0.5),
  ];
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      parts.push(cyl(0.17, 0.17, 0.05, 0, 0, 0, 0, 8, true));
      const s = parts[parts.length - 1].g;
      s.rotateZ(Math.PI / 2);
      s.translate(side * 0.46, 0.4, -0.95 + i * 0.6);
    }
  }
  return build(parts);
}

function cog(): Model {
  const parts: Part[] = [
    ...hull(1.5, 0.85, 2.5, 0x6a4a2c),
    box(1.3, 0.08, 2.4, 0, 0.85, 0, WOOD_LIGHT),
    box(1.4, 0.6, 0.8, 0, 0.9, -1.0, WOOD),
    box(1.1, 0.4, 0.6, 0, 0.9, 1.1, WOOD),
    cyl(0.08, 0.1, 2.9, 0, 0.85, 0.05, WOOD, 6),
    box(2.0, 1.5, 0.06, 0, 2.0, 0.13, 0xece2c6),
    box(2.02, 0.4, 0.07, 0, 2.55, 0.13, 0, true),
    box(0.6, 0.34, 0.04, 0.3, 3.75, 0.05, 0, true),
    cyl(0.18, 0.18, 0.3, 0.3, 0.93, 0.4, WOOD, 6),
    box(0.4, 0.3, 0.4, -0.35, 0.93, 0.3, 0x8a7a55),
  ];
  return build(parts);
}

function wagon(): Model {
  const parts: Part[] = [
    box(0.8, 0.22, 1.5, 0, 0.32, 0, WOOD),
    log(0.46, 1.4, 0, 0.62, 0, 0, 8, true),
    box(0.42, 0.42, 0.8, 0, 0.18, 1.45, 0x6e5a48),
    box(0.26, 0.26, 0.3, 0, 0.42, 1.95, 0x6e5a48),
    box(0.06, 0.06, 0.6, 0, 0.4, 0.95, WOOD),
  ];
  for (const sx of [-0.46, 0.46]) {
    for (const sz of [-0.5, 0.5]) {
      parts.push(log(0.28, 0.08, sx, 0.28, sz, 0x3d2c1d, 8, false, true));
    }
  }
  return build(parts);
}

function soldier(): Model {
  return build([
    box(0.11, 0.38, 0.14, -0.08, 0, 0, 0x3b3128),
    box(0.11, 0.38, 0.14, 0.08, 0, 0, 0x3b3128),
    box(0.34, 0.38, 0.2, 0, 0.38, 0, 0, true),
    box(0.2, 0.2, 0.2, 0, 0.76, 0, 0xd9b38c),
    box(0.24, 0.1, 0.24, 0, 0.9, 0, 0x9aa0a6),
    cyl(0.018, 0.018, 1.5, 0.23, 0.15, 0.06, WOOD_LIGHT, 4),
    cone(0.04, 0.16, 0.23, 1.65, 0.06, 0xc8ccd2, 4),
    box(0.06, 0.34, 0.28, -0.22, 0.36, 0.06, 0x8a8f96),
    box(0.03, 0.2, 0.16, -0.26, 0.43, 0.06, 0, true),
  ]);
}

function banner(): Model {
  return build([
    cyl(0.035, 0.035, 2.6, 0, 0, 0, WOOD, 5),
    box(0.95, 0.62, 0.04, 0.5, 1.9, 0, 0, true),
    box(0.3, 0.3, 0.04, 0.8, 1.6, 0, 0, true),
    cone(0.07, 0.18, 0, 2.6, 0, 0xe2c15a, 5),
  ]);
}

function pine(): Model {
  return build([
    cyl(0.09, 0.13, 0.45, 0, 0, 0, 0x5b3f27, 5),
    cone(0.62, 1.0, 0, 0.35, 0, 0x2c5529, 6),
    cone(0.45, 0.9, 0, 0.95, 0, 0x34632e, 6),
    cone(0.28, 0.7, 0, 1.5, 0, 0x3d7034, 6),
  ]);
}

function oak(): Model {
  return build([
    cyl(0.1, 0.15, 0.6, 0, 0, 0, 0x5b3f27, 5),
    blob(0.62, 0, 1.0, 0, 0x4a7a32, 0.85),
    blob(0.42, 0.35, 1.3, 0.2, 0x578a3a, 0.85),
    blob(0.4, -0.3, 1.2, -0.25, 0x3f6b2c, 0.85),
  ]);
}

function bolt(): Model {
  const shaft = log(0.05, 1.8, 0, 0, 0, WOOD_LIGHT, 5);
  const tip = prow(0.12, 0.4, 1, 0, 0, 0.9, 0xc8ccd2);
  return build([shaft, tip, box(0.3, 0.02, 0.4, 0, -0.01, -0.9, 0, true)]);
}

function boulder(): Model {
  return build([blob(0.6, 0, 0, 0, 0x3a302a)]);
}

function scaffold(): Model {
  const parts: Part[] = [box(2.6, 0.5, 2.6, 0, 0, 0, STONE_DARK)];
  for (const sx of [-1.3, 1.3]) {
    for (const sz of [-1.3, 1.3]) {
      parts.push(cyl(0.07, 0.07, 2.6, sx, 0, sz, WOOD_LIGHT, 5));
    }
  }
  for (const y of [1.1, 2.3]) {
    parts.push(box(2.7, 0.08, 0.1, 0, y, 1.3, WOOD_LIGHT));
    parts.push(box(2.7, 0.08, 0.1, 0, y, -1.3, WOOD_LIGHT));
    parts.push(box(0.1, 0.08, 2.7, 1.3, y, 0, WOOD_LIGHT));
    parts.push(box(0.1, 0.08, 2.7, -1.3, y, 0, WOOD_LIGHT));
  }
  parts.push(box(1.2, 0.9, 1.2, 0, 0.5, 0, STONE));
  parts.push(box(0.7, 0.4, 0.04, 1.3, 2.5, 1.3, 0, true));
  return build(parts);
}

export const MODELS = {
  town: town(),
  keep: keep(),
  harbour: harbour(),
  market: market(),
  mageTower: mageTower(),
  ballistaTower: ballistaTower(),
  galley: galley(),
  longship: longship(),
  cog: cog(),
  wagon: wagon(),
  soldier: soldier(),
  banner: banner(),
  pine: pine(),
  oak: oak(),
  bolt: bolt(),
  boulder: boulder(),
  scaffold: scaffold(),
};

const bodyMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const teamMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

const WHITE = new THREE.Color(1, 1, 1);
const scratch = new THREE.Color();

/** Instanced copies of one model. Fill it every frame: begin, add..., end. */
export class Pool {
  private body: THREE.InstancedMesh;
  private team: THREE.InstancedMesh | null;
  private n = 0;

  constructor(
    model: Model,
    private capacity: number,
    parent: THREE.Object3D,
  ) {
    this.body = new THREE.InstancedMesh(model.body, bodyMaterial, capacity);
    this.body.frustumCulled = false;
    this.body.count = 0;
    this.body.setColorAt(0, WHITE);
    parent.add(this.body);
    this.team = model.team
      ? new THREE.InstancedMesh(model.team, teamMaterial, capacity)
      : null;
    if (this.team) {
      this.team.frustumCulled = false;
      this.team.count = 0;
      this.team.setColorAt(0, WHITE);
      parent.add(this.team);
    }
  }

  begin() {
    this.n = 0;
  }

  get full(): boolean {
    return this.n >= this.capacity;
  }

  add(m: THREE.Matrix4, color: RGB, tint = 1) {
    if (this.n >= this.capacity) return;
    this.body.setMatrixAt(this.n, m);
    scratch.setRGB(tint, tint, tint);
    this.body.setColorAt(this.n, scratch);
    if (this.team) {
      this.team.setMatrixAt(this.n, m);
      scratch.setRGB(color[0] * tint, color[1] * tint, color[2] * tint);
      this.team.setColorAt(this.n, scratch);
    }
    this.n++;
  }

  end() {
    this.body.count = this.n;
    this.body.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.team) {
      this.team.count = this.n;
      this.team.instanceMatrix.needsUpdate = true;
      if (this.team.instanceColor) this.team.instanceColor.needsUpdate = true;
    }
  }
}
