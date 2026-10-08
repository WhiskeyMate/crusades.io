// How territory cloths are drawn: the GLSL that turns a pattern number and
// a tile position into a colour, and the atlas of symbols the glyph patterns
// repeat. Used by the terrain shader and by the store's previews.

import * as THREE from "three";
import { ATLAS_COLS, ATLAS_ROWS, GLYPH_BASE, GLYPHS } from "../store/Cloths";

/** Noise helpers the cloth code needs (the terrain shader has its own copy). */
export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm2(vec2 p) {
  return vnoise(p) * 0.6 + vnoise(p * 2.7 + 13.1) * 0.4;
}`;

/**
 * `vec3 cloth(int pat, vec2 tile, vec3 fill)`: the realm's fill colour,
 * figured with pattern `pat`. Needs `uniform sampler2D tGlyphs` and fbm2.
 */
export const CLOTH_GLSL = /* glsl */ `
uniform sampler2D tGlyphs;
vec3 cloth(int pat, vec2 tile, vec3 fill) {
  if (pat == 0) return fill;
  vec3 pale = fill * 0.55 + vec3(0.42, 0.39, 0.30);
  if (pat < ${GLYPH_BASE}) {
    float m = 0.0;
    if (pat == 1) m = step(0.5, fract(tile.y / 7.0));
    else if (pat == 2) m = mod(floor(tile.x / 6.0) + floor(tile.y / 6.0), 2.0);
    else if (pat == 3) m = step(0.5, fract((abs(fract(tile.x / 14.0) - 0.5) * 14.0 + tile.y) / 7.0));
    else if (pat == 4) m = step(0.5, fract((abs(fract(tile.x / 12.0) - 0.5) + abs(fract(tile.y / 12.0) - 0.5)) * 2.0));
    else if (pat == 5) m = step(0.5, fract(tile.x / 7.0));
    else if (pat == 6) m = step(0.5, fract((tile.x + tile.y) / 10.0));
    else if (pat == 7) {
      vec2 q = tile / 8.0;
      q.x += 0.5 * mod(floor(q.y), 2.0);
      m = 1.0 - step(0.27, length(fract(q) - 0.5));
    }
    else if (pat == 8) m = step(0.5, fract((tile.y + sin(tile.x * 0.45) * 2.2) / 7.0));
    else if (pat == 9) {
      vec2 q = tile / 7.0;
      q.x += 0.5 * mod(floor(q.y), 2.0);
      float d = length(fract(q) - vec2(0.5, 0.0));
      m = step(0.36, d) * (1.0 - step(0.52, d));
    }
    else if (pat == 10) {
      vec2 q = tile / vec2(9.0, 4.5);
      q.x += 0.5 * mod(floor(q.y), 2.0);
      vec2 f = fract(q);
      m = max(1.0 - step(0.07, f.x), 1.0 - step(0.14, f.y));
    }
    else if (pat == 11) {
      float a = step(0.55, fract(tile.x / 10.0));
      float b = step(0.55, fract(tile.y / 10.0));
      float thin = max(1.0 - step(0.08, abs(fract(tile.x / 10.0) - 0.25)), 1.0 - step(0.08, abs(fract(tile.y / 10.0) - 0.25)));
      m = clamp(a * 0.5 + b * 0.5 + thin * 0.6, 0.0, 1.0);
    }
    else if (pat == 12) {
      vec2 q = tile / vec2(8.0, 7.0);
      q.x += 0.5 * mod(floor(q.y), 2.0);
      m = step(0.4, length((fract(q) - 0.5) * vec2(1.0, 1.1)));
    }
    else if (pat == 13) {
      float t = fract((tile.x + tile.y) / 46.0);
      vec3 rb = 0.55 + 0.45 * cos(6.2832 * (t + vec3(0.0, 0.33, 0.67)));
      return mix(fill, rb, 0.72);
    }
    else if (pat == 14) {
      float s = step(0.5, fract((tile.x - tile.y) / 9.0));
      return mix(fill, mix(vec3(0.96, 0.78, 0.08), vec3(0.07), s), 0.78);
    }
    else {
      m = step(0.5, fbm2(tile * 0.11));
      pale = mix(pale, fill * 0.35, step(0.6, fbm2(tile * 0.17 + 9.0)));
    }
    return mix(fill, pale, m * 0.55);
  }
  // A symbol, repeated in staggered rows.
  int gi = pat - ${GLYPH_BASE};
  vec2 q = tile / 13.0;
  vec2 dq = q / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
  q.x += 0.5 * mod(floor(q.y), 2.0);
  vec2 f = fract(q);
  vec2 cell = vec2(float(gi % ${ATLAS_COLS}), float(gi / ${ATLAS_COLS}));
  vec2 uv = vec2((cell.x + f.x) / ${ATLAS_COLS}.0, 1.0 - (cell.y + f.y) / ${ATLAS_ROWS}.0);
  // Explicit gradients: fract() would otherwise put a seam on every cell edge.
  vec4 g = textureGrad(tGlyphs, uv, dFdx(dq), dFdy(dq));
  return mix(fill, g.rgb, g.a * 0.92);
}`;

const CELL = 128;

function drawSmug(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#1b1410";
  ctx.fillStyle = "#f3ead2";
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Squinting eyes under a raised brow.
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.6, cy - r * 0.2);
  ctx.quadraticCurveTo(cx - r * 0.35, cy - r * 0.42, cx - r * 0.1, cy - r * 0.2);
  ctx.moveTo(cx + r * 0.12, cy - r * 0.26);
  ctx.quadraticCurveTo(cx + r * 0.38, cy - r * 0.5, cx + r * 0.64, cy - r * 0.22);
  ctx.moveTo(cx + r * 0.08, cy - r * 0.56);
  ctx.quadraticCurveTo(cx + r * 0.4, cy - r * 0.82, cx + r * 0.7, cy - r * 0.5);
  ctx.stroke();
  // A grin far too wide for the face.
  ctx.fillStyle = "#fffdf6";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.72, cy + r * 0.1);
  ctx.quadraticCurveTo(cx, cy + r * 0.38, cx + r * 0.78, cy - r * 0.02);
  ctx.quadraticCurveTo(cx + r * 0.3, cy + r * 0.95, cx - r * 0.72, cy + r * 0.1);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = -2; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * r * 0.2, cy + r * 0.14);
    ctx.lineTo(cx + i * r * 0.18, cy + r * 0.62);
    ctx.stroke();
  }
}

function drawJester(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const tips: [number, number, string][] = [[-0.95, -0.5, "#c0392b"], [0, -1.0, "#d9a521"], [0.95, -0.5, "#2c6fb3"]];
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#1b1410";
  for (const [tx, ty, color] of tips) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy + r * 0.45);
    ctx.quadraticCurveTo(cx + tx * r * 0.4, cy - r * 0.2, cx + tx * r, cy + ty * r);
    ctx.quadraticCurveTo(cx + tx * r * 0.2, cy + r * 0.1, cx + r * 0.55, cy + r * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f2d27a";
    ctx.beginPath();
    ctx.arc(cx + tx * r, cy + ty * r, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = "#f3ead2";
  ctx.fillRect(cx - r * 0.62, cy + r * 0.4, r * 1.24, r * 0.3);
  ctx.strokeRect(cx - r * 0.62, cy + r * 0.4, r * 1.24, r * 0.3);
}

let atlas: THREE.CanvasTexture | null = null;

/** The symbols of every glyph cloth, one per cell, drawn once. */
export function glyphAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLS * CELL;
  canvas.height = ATLAS_ROWS * CELL;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  GLYPHS.forEach((g, i) => {
    const cx = (i % ATLAS_COLS) * CELL + CELL / 2;
    const cy = Math.floor(i / ATLAS_COLS) * CELL + CELL / 2;
    if (g.glyph === "custom:smug") return drawSmug(ctx, cx, cy, CELL * 0.33);
    if (g.glyph === "custom:jester") return drawJester(ctx, cx, cy + 6, CELL * 0.32);
    if (g.emoji) {
      ctx.font = `${CELL * 0.56}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(g.glyph, cx, cy + 4);
    } else {
      ctx.font = `${CELL * 0.6}px "Segoe UI Symbol", "DejaVu Sans", "Noto Sans Symbols", serif`;
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(27, 20, 16, 0.75)";
      ctx.strokeText(g.glyph, cx, cy + 4);
      ctx.fillStyle = "#f1e6c6";
      ctx.fillText(g.glyph, cx, cy + 4);
    }
  });
  atlas = new THREE.CanvasTexture(canvas);
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.anisotropy = 4;
  return atlas;
}
