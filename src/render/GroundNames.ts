// Clan names, lettered onto the ground like names on a map. Each is a strip
// of mesh that follows the terrain's height, textured from one shared atlas
// of names, so hundreds of them cost a single draw call.

import * as THREE from "three";
import { PlayerType } from "@crusades/engine-api/game/GameTypes";
import { GameState } from "../client/GameState";
import { fmtTroops } from "../client/Lexicon";
import { Terrain } from "./Terrain";

const COLS = 8;
const ROWS = 64;
const CELL_W = 512;
const CELL_H = 64;
const MAX = COLS * ROWS;

// The levies of each clan, lettered under its name. Numbers change, so they
// have a small atlas of their own that is cheap to redraw and send again.
const N_COLS = 16;
const N_ROWS = 32;
const N_W = 96;
const N_H = 32;

const VERT = /* glsl */ `
attribute vec2 aCell;
uniform sampler2D tHeight;
uniform vec2 uMap;
uniform vec2 uCell;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec2 h = (w.xz + uMap * 0.5) / uMap;
  w.y = max(texture2D(tHeight, h).r, 0.0) + 0.3;
  vUv = aCell + uv * uCell;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform sampler2D tAtlas;
uniform float uRows;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(tAtlas, vUv);
  // Letter height in pixels: too small to read, don't draw it at all.
  float px = 1.0 / max(fwidth(vUv.y) * uRows, 0.0001);
  float a = t.a * smoothstep(6.0, 10.0, px) * 0.92;
  if (a < 0.02) discard;
  gl_FragColor = vec4(t.rgb, a);
}`;

export class GroundNames {
  private mesh: THREE.InstancedMesh;
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private atlas: THREE.CanvasTexture;
  private slots = new Map<number, number>();
  private cells: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(
    parent: THREE.Object3D,
    private terrain: Terrain,
    private state: GameState,
    maxAnisotropy: number,
  ) {
    this.canvas.width = COLS * CELL_W;
    this.canvas.height = ROWS * CELL_H;
    this.ctx = this.canvas.getContext("2d")!;
    this.atlas = new THREE.CanvasTexture(this.canvas);
    this.atlas.anisotropy = maxAnisotropy;
    this.atlas.generateMipmaps = true;
    this.atlas.minFilter = THREE.LinearMipmapLinearFilter;

    // Eight units long, one tall, text reading west to east.
    const geo = new THREE.PlaneGeometry(8, 1, 32, 4);
    geo.rotateX(-Math.PI / 2);
    this.cells = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
    geo.setAttribute("aCell", this.cells);
    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: {
          tAtlas: { value: this.atlas },
          tHeight: terrain.uniforms.tHeight,
          uMap: terrain.uniforms.uMap,
          uCell: { value: new THREE.Vector2(1 / COLS, 1 / ROWS) },
          uRows: { value: ROWS },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      MAX,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 0.5;
    parent.add(this.mesh);

    this.nCanvas.width = N_COLS * N_W;
    this.nCanvas.height = N_ROWS * N_H;
    this.nCtx = this.nCanvas.getContext("2d")!;
    this.nAtlas = new THREE.CanvasTexture(this.nCanvas);
    this.nAtlas.anisotropy = maxAnisotropy;
    this.nAtlas.generateMipmaps = true;
    this.nAtlas.minFilter = THREE.LinearMipmapLinearFilter;
    // Three units long, one tall.
    const nGeo = new THREE.PlaneGeometry(3, 1, 8, 2);
    nGeo.rotateX(-Math.PI / 2);
    const nCells = new Float32Array(MAX * 2);
    for (let slot = 0; slot < MAX; slot++) {
      nCells[slot * 2] = (slot % N_COLS) / N_COLS;
      nCells[slot * 2 + 1] = 1 - (((slot / N_COLS) | 0) + 1) / N_ROWS;
    }
    nGeo.setAttribute("aCell", new THREE.InstancedBufferAttribute(nCells, 2));
    this.numbers = new THREE.InstancedMesh(
      nGeo,
      new THREE.ShaderMaterial({
        uniforms: {
          tAtlas: { value: this.nAtlas },
          tHeight: terrain.uniforms.tHeight,
          uMap: terrain.uniforms.uMap,
          uCell: { value: new THREE.Vector2(1 / N_COLS, 1 / N_ROWS) },
          uRows: { value: N_ROWS },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      MAX,
    );
    this.numbers.frustumCulled = false;
    this.numbers.count = 0;
    this.numbers.renderOrder = 0.5;
    parent.add(this.numbers);
  }

  private numbers: THREE.InstancedMesh;
  private nCanvas = document.createElement("canvas");
  private nCtx!: CanvasRenderingContext2D;
  private nAtlas!: THREE.CanvasTexture;
  private nText = new Map<number, string>();
  private frame = 0;

  /** Letters a clan's levies into its cell of the number atlas, if they have changed. */
  private count(slot: number, text: string): boolean {
    if (this.nText.get(slot) === text) return false;
    this.nText.set(slot, text);
    const ctx = this.nCtx;
    const x = (slot % N_COLS) * N_W;
    const y = ((slot / N_COLS) | 0) * N_H;
    ctx.clearRect(x, y, N_W, N_H);
    ctx.font = `bold 24px "Palatino Linotype", "Book Antiqua", Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(24, 16, 9, 0.85)";
    ctx.strokeText(text, x + N_W / 2, y + N_H / 2 + 1);
    ctx.fillStyle = "#ffe9a8";
    ctx.fillText(text, x + N_W / 2, y + N_H / 2 + 1);
    return true;
  }

  private slotFor(id: number, name: string): number | null {
    const have = this.slots.get(id);
    if (have !== undefined) return have;
    const slot = this.slots.size;
    if (slot >= MAX) return null;
    this.slots.set(id, slot);
    const col = slot % COLS;
    const row = (slot / COLS) | 0;
    const ctx = this.ctx;
    let size = 44;
    ctx.font = `italic ${size}px "Palatino Linotype", "Book Antiqua", Georgia, serif`;
    const wide = ctx.measureText(name).width;
    if (wide > CELL_W - 24) {
      size = Math.floor((size * (CELL_W - 24)) / wide);
      ctx.font = `italic ${size}px "Palatino Linotype", "Book Antiqua", Georgia, serif`;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = col * CELL_W + CELL_W / 2;
    const cy = row * CELL_H + CELL_H / 2 + 2;
    ctx.lineJoin = "round";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(24, 16, 9, 0.8)";
    ctx.strokeText(name, cx, cy);
    ctx.fillStyle = "#f3e8cc";
    ctx.fillText(name, cx, cy);
    this.atlas.needsUpdate = true;
    this.cells.setXY(slot, col / COLS, 1 - (row + 1) / ROWS);
    this.cells.needsUpdate = true;
    return slot;
  }

  update() {
    // Levies are re-lettered a few times a second, not every frame.
    const relabel = this.frame++ % 20 === 0;
    let changed = false;
    let top = 0;
    for (const p of this.state.players.values()) {
      if (p.type !== PlayerType.Bot) continue;
      const slot = this.slotFor(p.smallID, p.name);
      if (slot === null) continue;
      if (slot + 1 > top) top = slot + 1;
      const show = p.isAlive && p.tilesOwned > 0 && p.nameSize > 0;
      // Letters between one and four tiles tall, by how much room there is.
      const tall = show ? Math.min(4, Math.max(1.1, p.nameSize * 0.45)) : 0;
      this.p.set(this.terrain.worldX(p.nameX), 0, this.terrain.worldZ(p.nameY));
      this.s.set(tall, 1, tall);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(slot, this.m);
      // The count sits just south of the name, a little smaller.
      const small = tall * 0.8;
      this.p.z += tall * 0.95;
      this.s.set(small, 1, small);
      this.m.compose(this.p, this.q, this.s);
      this.numbers.setMatrixAt(slot, this.m);
      if (relabel && show && this.count(slot, fmtTroops(p.troops))) changed = true;
    }
    this.mesh.count = top;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.numbers.count = top;
    this.numbers.instanceMatrix.needsUpdate = true;
    if (changed) this.nAtlas.needsUpdate = true;
  }
}
