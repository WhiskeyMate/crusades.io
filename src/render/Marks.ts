// Small camera-facing marks drawn over the world in one instanced draw:
// health bars over war galleys, and the dotted flight line of sorcery.

import * as THREE from "three";

const MAX = 4000;

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec4 aShape; // width, height, kind (0 dot, 1 bar), fill (bars)
uniform vec3 uRight;
uniform vec3 uUp;
varying vec2 vUv;
varying vec3 vColor;
varying vec4 vShape;
void main() {
  vec3 centre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 p = centre + uRight * position.x * aShape.x + uUp * position.y * aShape.y;
  vUv = uv;
  vColor = aColor;
  vShape = aShape;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying vec4 vShape;
void main() {
  if (vShape.z < 0.5) {
    float d = length(vUv - 0.5);
    float a = 1.0 - smoothstep(0.34, 0.5, d);
    if (a < 0.02) discard;
    // A dark rim so the dot reads over snow, sea and fire alike.
    vec3 c = mix(vColor, vec3(0.08, 0.05, 0.03), smoothstep(0.24, 0.36, d));
    gl_FragColor = vec4(c, a * 0.95);
    return;
  }
  float aspect = vShape.x / vShape.y;
  vec2 edge = min(vUv, 1.0 - vUv) * vec2(aspect, 1.0);
  float border = step(min(edge.x, edge.y), 0.16);
  vec3 c = vUv.x < vShape.w ? vColor : vec3(0.16, 0.05, 0.04);
  gl_FragColor = vec4(mix(c, vec3(0.06, 0.04, 0.03), border), 0.95);
}`;

export class Marks {
  private mesh: THREE.InstancedMesh;
  private colors: THREE.InstancedBufferAttribute;
  private shapes: THREE.InstancedBufferAttribute;
  private uniforms: Record<string, THREE.IUniform>;
  private m = new THREE.Matrix4();
  private n = 0;

  constructor(parent: THREE.Object3D) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.colors = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.shapes = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    geo.setAttribute("aColor", this.colors);
    geo.setAttribute("aShape", this.shapes);
    this.uniforms = {
      uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
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
    this.mesh.renderOrder = 3;
    parent.add(this.mesh);
  }

  begin(camera: THREE.Camera) {
    this.n = 0;
    (this.uniforms.uRight.value as THREE.Vector3).setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    (this.uniforms.uUp.value as THREE.Vector3).setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  }

  private add(x: number, y: number, z: number, r: number, g: number, b: number, w: number, h: number, kind: number, fill: number) {
    if (this.n >= MAX) return;
    this.m.makeTranslation(x, y, z);
    this.mesh.setMatrixAt(this.n, this.m);
    this.colors.setXYZ(this.n, r, g, b);
    this.shapes.setXYZW(this.n, w, h, kind, fill);
    this.n++;
  }

  dot(x: number, y: number, z: number, size: number, r: number, g: number, b: number) {
    this.add(x, y, z, r, g, b, size, size, 0, 0);
  }

  /** A health bar, `fill` from 0 to 1: green when whole, red when nearly sunk. */
  bar(x: number, y: number, z: number, width: number, fill: number) {
    const f = Math.min(1, Math.max(0, fill));
    const r = f > 0.5 ? (1 - f) * 2 * 0.9 + 0.2 : 0.95;
    const g = f > 0.5 ? 0.8 : 0.25 + f * 1.1;
    this.add(x, y, z, r, g, 0.18, width, width * 0.2, 1, f);
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colors.needsUpdate = true;
    this.shapes.needsUpdate = true;
  }
}
