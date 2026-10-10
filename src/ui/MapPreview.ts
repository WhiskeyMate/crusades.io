// Small 3D pictures of the realms, for the map pickers and the list of
// public games. Each is built from the map's half-size terrain file (the
// same one the engine plans routes on): flat land raised a little above the
// sea, lit from the side so the coast shows, seen from above at an angle.
// One hidden renderer draws them all.

import * as THREE from "three";
import { GameMapType } from "@crusades/engine-api/game/Maps.gen";
import { MAP_DIR } from "../worldgen/RealmGen";

const W = 480;
const H = 300;

let renderer: THREE.WebGLRenderer | null = null;
let broken = false;

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

interface Model {
  mesh: THREE.Mesh;
  /** Depth of the slab relative to its width (height / width of the map). */
  aspect: number;
}

const models = new Map<GameMapType, Promise<Model | null>>();
const stills = new Map<GameMapType, string>();
const pending = new Set<GameMapType>();

async function build(map: GameMapType): Promise<Model | null> {
  try {
    const base = `/maps/${MAP_DIR[map]}`;
    const [info, bytes] = await Promise.all([
      fetch(`${base}/info.json`).then((r) => r.json() as Promise<{ miniWidth: number; miniHeight: number }>),
      fetch(`${base}/mini.bin`).then((r) => r.arrayBuffer()),
    ]);
    const mw = info.miniWidth;
    const mh = info.miniHeight;
    const mini = new Uint8Array(bytes);
    if (mini.length !== mw * mh) return null;
    const aspect = mh / mw;
    const size = 10;
    const sx = 200;
    const sy = Math.max(40, Math.min(260, Math.round(sx * aspect)));
    const geo = new THREE.PlaneGeometry(size, size * aspect, sx, sy);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = [0, 0, 0];
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / size + 0.5;
      const v = pos.getZ(i) / (size * aspect) + 0.5;
      const b = mini[Math.min(mh - 1, Math.floor(v * mh)) * mw + Math.min(mw - 1, Math.floor(u * mw))];
      const mag = b & 0x1f;
      if (b & 0x80) {
        // Land is one level and one green: the game has no hills to show.
        pos.setY(i, 0.14);
        c[0] = 0.4;
        c[1] = 0.54;
        c[2] = 0.26;
      } else {
        // Water: paler in the shallows, darker out at sea.
        const d = Math.min(1, mag / 10);
        pos.setY(i, -0.03);
        c[0] = 0.2 - 0.13 * d;
        c[1] = 0.5 - 0.3 * d;
        c[2] = 0.58 - 0.24 * d;
      }
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return { mesh: new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })), aspect };
  } catch (e) {
    console.warn("map preview failed for", map, e);
    return null;
  }
}

function model(map: GameMapType): Promise<Model | null> {
  let m = models.get(map);
  if (!m) {
    m = build(map);
    models.set(map, m);
  }
  return m;
}

let scene: THREE.Scene | null = null;
let cam: THREE.PerspectiveCamera | null = null;
const holder = new THREE.Group();

function draw(m: Model, turn: number, w: number, h: number): boolean {
  const r = gl();
  if (!r) return false;
  if (!scene) {
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x3a3428, 1.25));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
    sun.position.set(-5, 8, 4);
    scene.add(sun);
    scene.add(holder);
    cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);
  }
  holder.clear();
  holder.add(m.mesh);
  holder.rotation.y = turn;
  // Stand far enough back for the whole map, wide or tall.
  const reach = Math.max(1, m.aspect * 1.55) * 13.5;
  cam!.aspect = w / h;
  cam!.updateProjectionMatrix();
  cam!.position.set(0, reach * 0.74, reach * 0.68);
  cam!.lookAt(0, 0, m.aspect * 0.6);
  r.setSize(w, h, false);
  r.setClearColor(0x000000, 0);
  r.render(scene, cam!);
  return true;
}

/**
 * A picture of a map, if one is ready (a data URL), else "". The first call
 * for a map starts it loading; ask again later.
 */
export function mapStill(map: GameMapType): string {
  const have = stills.get(map);
  if (have !== undefined) return have;
  if (!pending.has(map)) {
    pending.add(map);
    void model(map).then((m) => {
      let url = "";
      if (m && draw(m, 0, W, H)) url = renderer!.domElement.toDataURL("image/png");
      stills.set(map, url);
      // Whoever was waiting: fill in the pictures already on the page.
      for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(`img[data-map-still="${map}"]`))) {
        if (url) img.src = url;
      }
    });
  }
  return "";
}

/** Markup for a map picture that fills itself in when ready. */
export function mapStillHTML(map: GameMapType, cls: string): string {
  const url = mapStill(map);
  return `<img class="${cls}" data-map-still="${map}" alt="" ${url ? `src="${url}"` : ""} />`;
}

let running = false;

function frame() {
  const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas.live-map"));
  const shown = canvases.filter((c) => {
    const box = c.getBoundingClientRect();
    return box.width > 0 && box.bottom > 0 && box.top < window.innerHeight;
  });
  if (canvases.length === 0) {
    running = false;
    return;
  }
  const t = performance.now() / 1000;
  for (const c of shown) {
    const map = c.dataset.map as GameMapType | undefined;
    if (!map) continue;
    void model(map).then((m) => {
      // The canvas may have moved on to another map while this one loaded.
      if (!m || c.dataset.map !== map) return;
      const ctx = c.getContext("2d");
      if (!ctx || !draw(m, Math.sin(t * 0.35) * 0.5, c.width, c.height)) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(renderer!.domElement, 0, 0, c.width, c.height);
    });
  }
  requestAnimationFrame(frame);
}

/** Keep every <canvas class="live-map" data-map="…"> on the page turning; stops when there are none. */
export function startLiveMaps() {
  if (running || !gl()) return;
  running = true;
  requestAnimationFrame(frame);
}
