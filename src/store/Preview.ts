// Pictures for the store: every item rendered from the real game models
// (or the real cloth shader) into a small image, in the player's colour.
// One hidden WebGL renderer does all of them; results are cached.

import * as THREE from "three";
import { hexToRGB, RGB, shieldSVG, Skin } from "../client/Heraldry";
import { CLOTH_GLSL, glyphAtlas, NOISE_GLSL } from "../render/Cloth";
import { Model, modelFor } from "../render/Models";
import "../render/Styles";
import { clothId } from "./Cloths";
import { Item } from "./Catalog";

const W = 320;
const H = 220;

let renderer: THREE.WebGLRenderer | null = null;
let broken = false;
const cache = new Map<string, string>();

function gl(): THREE.WebGLRenderer | null {
  if (broken) return null;
  if (!renderer) {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(W, H, false);
      renderer.setPixelRatio(1);
    } catch {
      broken = true;
      return null;
    }
  }
  return renderer;
}

function meshes(model: Model, color: RGB): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(model.body, new THREE.MeshLambertMaterial({ vertexColors: true })));
  if (model.team) {
    g.add(
      new THREE.Mesh(
        model.team,
        new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(color[0], color[1], color[2]) }),
      ),
    );
  }
  return g;
}

function shoot(group: THREE.Object3D, ground: number, yaw = 0.7, pitch = 0.42): string {
  const r = gl();
  if (!r) return "";
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x4a4436, 1.3));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(4, 8, 5);
  scene.add(sun);
  scene.add(group);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(size.x, size.z) * 0.75, 40),
    new THREE.MeshLambertMaterial({ color: ground }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(centre.x, bounds.min.y - 0.01, centre.z);
  scene.add(disc);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 500);
  const radius = Math.max(size.x, size.z, size.y * 1.25) * 1.5 + 0.4;
  cam.position.set(
    centre.x + Math.sin(yaw) * Math.cos(pitch) * radius,
    centre.y + Math.sin(pitch) * radius,
    centre.z + Math.cos(yaw) * Math.cos(pitch) * radius,
  );
  cam.lookAt(centre.x, centre.y - size.y * 0.05, centre.z);
  r.setClearColor(0x000000, 0);
  r.render(scene, cam);
  const url = r.domElement.toDataURL("image/png");
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m) m.dispose();
  });
  disc.geometry.dispose();
  return url;
}

function place(model: Model, color: RGB, x: number, z: number, scale = 1, yaw = 0): THREE.Group {
  const g = meshes(model, color);
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  g.rotation.y = yaw;
  return g;
}

const CLOTH_FRAG = /* glsl */ `
precision highp float;
precision highp int;
${NOISE_GLSL}
${CLOTH_GLSL}
uniform int uPat;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 tile = vec2(vUv.x * 66.0, (1.0 - vUv.y) * 45.0);
  // The same ground-and-tint the map uses, so the preview is true to the game.
  vec3 ground = mix(vec3(0.31, 0.43, 0.2), vec3(0.43, 0.5, 0.25), fbm2(tile * 0.06));
  float lum = dot(ground, vec3(0.3, 0.55, 0.15));
  vec3 fill = cloth(uPat, tile, uColor * (0.55 + lum * 0.9));
  gl_FragColor = vec4(mix(ground, fill, 0.62), 1.0);
}`;

function clothPicture(variant: string, color: RGB): string {
  const r = gl();
  if (!r) return "";
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tGlyphs: { value: glyphAtlas() },
      uPat: { value: clothId(variant) },
      uColor: { value: new THREE.Vector3(color[0], color[1], color[2]) },
    },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: CLOTH_FRAG,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  r.render(scene, new THREE.Camera());
  const url = r.domElement.toDataURL("image/png");
  mat.dispose();
  quad.geometry.dispose();
  return url;
}

const svgURL = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '))}`;

/** An image of the item as it will look in game, in this colour. Empty if WebGL is unavailable. */
export function previewURL(item: Item, colorHex: string, skin?: Skin | null): string {
  const key = `${item.id}|${colorHex}|${item.slot === "banner" ? JSON.stringify(skin ?? null) : ""}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const color = hexToRGB(colorHex);
  let url = "";
  try {
    switch (item.slot) {
      case "territory":
        url = clothPicture(item.variant, color);
        break;
      case "banner":
        url = svgURL(shieldSVG("preview", color, 180, skin ?? undefined));
        break;
      case "ships": {
        const g = new THREE.Group();
        g.add(place(modelFor("galley", item.variant).model, color, 0, 0, 1, 0.5));
        g.add(place(modelFor("longship", item.variant).model, color, 3.0, 2.2, 1, 0.9));
        g.add(place(modelFor("cog", item.variant).model, color, -3.2, 1.6, 1, 0.2));
        url = shoot(g, 0x2f6f8f, 0.2, 0.38);
        break;
      }
      case "buildings": {
        const g = new THREE.Group();
        g.add(place(modelFor("town", item.variant).model, color, -3.0, 1.2, 1, 0.4));
        g.add(place(modelFor("keep", item.variant).model, color, 2.4, -0.6, 0.95, -0.3));
        g.add(place(modelFor("mageTower", item.variant).model, color, -0.4, -3.4, 0.9));
        g.add(place(modelFor("market", item.variant).model, color, 2.8, 4.0, 0.9, -0.5));
        url = shoot(g, 0x5d7a3a, 0.55, 0.5);
        break;
      }
      case "troops": {
        const model = modelFor("soldier", item.variant).model;
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) g.add(place(model, color, (i - 1) * 0.8, i === 1 ? 0.35 : -0.2, 1, 0.25));
        url = shoot(g, 0x5d7a3a, 0.45, 0.3);
        break;
      }
    }
  } catch (e) {
    console.warn("preview failed for", item.id, e);
  }
  cache.set(key, url);
  return url;
}
