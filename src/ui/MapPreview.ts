// Small pictures of the realms, for the map pickers and the list of public
// games. Each is painted from the map's half-size terrain file (the same one
// the engine plans routes on) and shown as a slab seen from above at an
// angle: green land, sea darker with depth, a shaded southern coast.
//
// They are drawn with the plain 2D canvas, not WebGL. The landing page
// already has one WebGL context for the world behind it, and a second one
// is more than some graphics cards and browsers will stand.

import { GameMapType } from "@crusades/engine-api/game/Maps.gen";
import { MAP_DIR } from "../worldgen/RealmGen";

const W = 480;
const H = 300;
/** How far the slab is tipped away from the eye: 1 would be seen from straight above. */
const TILT = 0.56;

interface Model {
  /** The map from straight above, one pixel a tile. */
  flat: HTMLCanvasElement;
  w: number;
  h: number;
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
    const flat = document.createElement("canvas");
    flat.width = mw;
    flat.height = mh;
    const ctx = flat.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(mw, mh);
    const px = img.data;
    // How far south of the coast its shadow falls on the water, in tiles.
    const shade = Math.max(2, Math.round(mw / 160));
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const b = mini[y * mw + x];
        const o = (y * mw + x) * 4;
        if (b & 0x80) {
          // Land is one level and one green: the game has no hills to show.
          // Its northern edge catches the light.
          const lit = y > 0 && !(mini[(y - 1) * mw + x] & 0x80) ? 1.18 : 1;
          px[o] = 104 * lit;
          px[o + 1] = 140 * lit;
          px[o + 2] = 68 * lit;
        } else {
          // Water: paler in the shallows, darker out at sea, and in shadow
          // just south of land, which is what makes the land look raised.
          const d = Math.min(1, (b & 0x1f) / 10);
          const under = y >= shade && mini[(y - shade) * mw + x] & 0x80 ? 0.62 : 1;
          px[o] = (51 - 33 * d) * under;
          px[o + 1] = (128 - 77 * d) * under;
          px[o + 2] = (148 - 61 * d) * under;
        }
        px[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { flat, w: mw, h: mh };
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

/** Paints the slab onto a canvas, turned by `turn` radians about its middle. */
function draw(ctx: CanvasRenderingContext2D, m: Model, turn: number, w: number, h: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // Big enough to fill the picture, small enough that a turned corner stays inside it.
  const across = Math.abs(Math.cos(turn)) * m.w + Math.abs(Math.sin(turn)) * m.h;
  const deep = (Math.abs(Math.sin(turn)) * m.w + Math.abs(Math.cos(turn)) * m.h) * TILT;
  const thick = Math.max(4, h * 0.035);
  const s = Math.min((w * 0.94) / across, ((h - thick) * 0.94) / deep);
  const place = (drop: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(w / 2, (h - thick) / 2 + drop);
    ctx.scale(1, TILT);
    ctx.rotate(turn);
    ctx.scale(s, s);
  };
  // The slab's sides: its outline, drawn again and again a little lower.
  ctx.fillStyle = "#0b2231";
  for (let drop = thick; drop >= 1; drop -= 1) {
    place(drop);
    ctx.fillRect(-m.w / 2, -m.h / 2, m.w, m.h);
  }
  place(0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(m.flat, -m.w / 2, -m.h / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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
      if (m) {
        try {
          const c = document.createElement("canvas");
          c.width = W;
          c.height = H;
          const ctx = c.getContext("2d");
          if (ctx) {
            draw(ctx, m, 0, W, H);
            url = c.toDataURL("image/png");
          }
        } catch (e) {
          console.warn("map picture failed for", map, e);
        }
      }
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
      if (ctx) draw(ctx, m, Math.sin(t * 0.35) * 0.5, c.width, c.height);
    });
  }
  requestAnimationFrame(frame);
}

/** Keep every <canvas class="live-map" data-map="…"> on the page turning; stops when there are none. */
export function startLiveMaps() {
  if (running) return;
  running = true;
  requestAnimationFrame(frame);
}
