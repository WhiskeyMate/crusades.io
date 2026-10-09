// A small number floating over every building: its level. Drawn as camera-
// facing quads from one atlas of digits, in a single instanced draw.

import * as THREE from "three";

const MAX = 1200;
// 256 numbers: towns grow well past what a small atlas could show.
const COLS = 16;
const ROWS = 16;
const CELL = 64;

const VERT = /* glsl */ `
attribute float aLevel;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uSize;
varying vec2 vUv;
void main() {
  vec3 centre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 p = centre + uRight * position.x * uSize + uUp * position.y * uSize;
  float i = aLevel - 1.0;
  vec2 cell = vec2(mod(i, ${COLS}.0), floor(i / ${COLS}.0));
  vUv = (cell + vec2(uv.x, 1.0 - uv.y)) / vec2(${COLS}.0, ${ROWS}.0);
  vUv.y = 1.0 - vUv.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D tAtlas;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(tAtlas, vUv);
  if (t.a < 0.05) discard;
  gl_FragColor = t;
}`;

export class LevelTags {
  private mesh: THREE.InstancedMesh;
  private levels: THREE.InstancedBufferAttribute;
  private uniforms: Record<string, THREE.IUniform>;
  private m = new THREE.Matrix4();
  private n = 0;

  constructor(parent: THREE.Object3D) {
    const canvas = document.createElement("canvas");
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;
    const ctx = canvas.getContext("2d")!;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (let i = 0; i < COLS * ROWS; i++) {
      const x = (i % COLS) * CELL + CELL / 2;
      const y = Math.floor(i / COLS) * CELL + CELL / 2;
      // A dark roundel so the number reads on snow and on grass alike.
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(24, 16, 9, 0.85)";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#dcb65a";
      ctx.stroke();
      ctx.font = `bold ${i + 1 >= 100 ? 21 : i + 1 >= 10 ? 28 : 32}px "Palatino Linotype", "Book Antiqua", Georgia, serif`;
      ctx.fillStyle = "#f3e8cc";
      ctx.fillText(String(i + 1), x, y + 2);
    }
    const atlas = new THREE.CanvasTexture(canvas);
    atlas.minFilter = THREE.LinearMipmapLinearFilter;
    atlas.generateMipmaps = true;

    const geo = new THREE.PlaneGeometry(1, 1);
    this.levels = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute("aLevel", this.levels);
    this.uniforms = {
      tAtlas: { value: atlas },
      uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uSize: { value: 2 },
    };
    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
      }),
      MAX,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
  }

  begin(camera: THREE.Camera, size: number) {
    this.n = 0;
    const r = this.uniforms.uRight.value as THREE.Vector3;
    const u = this.uniforms.uUp.value as THREE.Vector3;
    r.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    u.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    this.uniforms.uSize.value = size;
  }

  add(x: number, y: number, z: number, level: number) {
    if (this.n >= MAX) return;
    this.m.makeTranslation(x, y, z);
    this.mesh.setMatrixAt(this.n, this.m);
    this.levels.setX(this.n, Math.min(COLS * ROWS, Math.max(1, level)));
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.levels.needsUpdate = true;
  }
}
