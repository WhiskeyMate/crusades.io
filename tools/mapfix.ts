// Reworks a map's terrain so that narrow water (rivers, one- or two-tile
// gaps between landmasses) becomes land, leaving only seas, lakes and real
// channels to divide the land. Then recomputes everything the engine
// derives from the land mask: shoreline bits, which water is ocean, water
// depth, land count, and the half-size mini map.
//
//   npx tsx tools/mapfix.ts <mapdir> [maxGap=4]
//
// Overwrites main.bin, mini.bin and info.json in place. Keep a copy of the
// originals (git has them).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: mapfix <mapdir> [maxGap]");
/** Water strips up to this many tiles wide are filled in. */
const MAX_GAP = Number(process.argv[3] ?? 4);
/** Water bodies smaller than this (tiles) are filled in too. */
const MIN_LAKE = 120;

const info = JSON.parse(readFileSync(join(dir, "info.json"), "utf8"));
const w: number = info.width;
const h: number = info.height;
const main = new Uint8Array(readFileSync(join(dir, "main.bin")));
if (main.length !== w * h) throw new Error("main.bin size mismatch");
const n = w * h;

// 1 = land (impassable stays what it is), 0 = water.
const land = new Uint8Array(n);
const mag = new Uint8Array(n);
for (let i = 0; i < n; i++) {
  land[i] = main[i] & 0x80 ? 1 : 0;
  mag[i] = main[i] & 0x1f;
}

/** Chamfer distance (in tiles) from every tile to the nearest tile where mask is 1. */
function distanceTo(mask: Uint8Array): Uint16Array {
  const d = new Uint16Array(n).fill(0xffff);
  const q = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  for (let i = 0; i < n; i++) {
    if (mask[i]) {
      d[i] = 0;
      q[qt++] = i;
    }
  }
  while (qh < qt) {
    const t = q[qh++];
    const x = t % w;
    const nd = d[t] + 1;
    if (x > 0 && d[t - 1] === 0xffff) { d[t - 1] = nd; q[qt++] = t - 1; }
    if (x < w - 1 && d[t + 1] === 0xffff) { d[t + 1] = nd; q[qt++] = t + 1; }
    if (t >= w && d[t - w] === 0xffff) { d[t - w] = nd; q[qt++] = t - w; }
    if (t < n - w && d[t + w] === 0xffff) { d[t + w] = nd; q[qt++] = t + w; }
  }
  return d;
}

// Morphological closing: grow the land by r, then shrink it by r. Water
// strips narrower than 2r end up land; wide water comes back as water.
const r = Math.ceil(MAX_GAP / 2);
const dLand = distanceTo(land);
const grown = new Uint8Array(n);
for (let i = 0; i < n; i++) grown[i] = dLand[i] <= r ? 1 : 0;
const grownWater = new Uint8Array(n);
for (let i = 0; i < n; i++) grownWater[i] = grown[i] ? 0 : 1;
const dWater = distanceTo(grownWater);
let filled = 0;
const newLand = new Uint8Array(n);
for (let i = 0; i < n; i++) {
  newLand[i] = land[i] || dWater[i] > r ? 1 : 0;
  if (newLand[i] && !land[i]) filled++;
}

// Small lakes become land as well.
function components(mask: Uint8Array, value: number): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (labels[s] !== -1 || mask[s] !== value) continue;
    const id = sizes.length;
    let top = 0;
    let size = 0;
    stack[top++] = s;
    labels[s] = id;
    while (top > 0) {
      const t = stack[--top];
      size++;
      const x = t % w;
      const tryPush = (u: number) => {
        if (labels[u] === -1 && mask[u] === value) {
          labels[u] = id;
          stack[top++] = u;
        }
      };
      if (x > 0) tryPush(t - 1);
      if (x < w - 1) tryPush(t + 1);
      if (t >= w) tryPush(t - w);
      if (t < n - w) tryPush(t + w);
    }
    sizes.push(size);
  }
  return { labels, sizes };
}
{
  const { labels, sizes } = components(newLand, 0);
  let lakes = 0;
  for (let i = 0; i < n; i++) {
    if (newLand[i] === 0 && sizes[labels[i]] < MIN_LAKE) {
      newLand[i] = 1;
      filled++;
      lakes++;
    }
  }
  console.log(`filled ${filled} water tiles (${lakes} of them small lakes)`);
}

// New land gets the lowland height of its nearest old land, so a filled
// river valley stays a valley.
const newMag = new Uint8Array(n);
{
  const q = new Int32Array(n);
  const src = new Int32Array(n).fill(-1);
  let qh = 0;
  let qt = 0;
  for (let i = 0; i < n; i++) {
    if (land[i]) {
      src[i] = i;
      q[qt++] = i;
    }
  }
  while (qh < qt) {
    const t = q[qh++];
    const x = t % w;
    const spread = (u: number) => {
      if (src[u] === -1) {
        src[u] = src[t];
        q[qt++] = u;
      }
    };
    if (x > 0) spread(t - 1);
    if (x < w - 1) spread(t + 1);
    if (t >= w) spread(t - w);
    if (t < n - w) spread(t + w);
  }
  for (let i = 0; i < n; i++) {
    if (!newLand[i]) continue;
    newMag[i] = land[i] ? mag[i] : Math.min(mag[src[i]], 9);
  }
}

/** Shoreline, ocean, depth and the engine's byte layout, for one grid. */
function pack(landMask: Uint8Array, magn: Uint8Array, W: number, H: number): { data: Uint8Array; numLand: number } {
  const N = W * H;
  const { labels, sizes } = components2(landMask, W, H);
  let ocean = -1;
  let best = 0;
  for (let i = 0; i < N; i++) {
    if (landMask[i]) continue;
    const l = labels[i];
    if (sizes[l] > best) {
      best = sizes[l];
      ocean = l;
    }
  }
  const data = new Uint8Array(N);
  const dist = new Uint16Array(N).fill(0xffff);
  const q = new Int32Array(N);
  let qh = 0;
  let qt = 0;
  let numLand = 0;
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const me = landMask[i];
    let shore = false;
    if (x > 0 && landMask[i - 1] !== me) shore = true;
    else if (x < W - 1 && landMask[i + 1] !== me) shore = true;
    else if (i >= W && landMask[i - W] !== me) shore = true;
    else if (i < N - W && landMask[i + W] !== me) shore = true;
    let b = 0;
    if (me) {
      b |= 0x80;
      numLand++;
      dist[i] = 0;
    } else if (labels[i] === ocean) b |= 0x20;
    if (shore) {
      b |= 0x40;
      if (!me) {
        dist[i] = 0;
        q[qt++] = i;
      }
    }
    data[i] = b;
  }
  while (qh < qt) {
    const t = q[qh++];
    const d = dist[t] + 1;
    const x = t % W;
    const step = (u: number) => {
      if (!landMask[u] && dist[u] === 0xffff) {
        dist[u] = d;
        q[qt++] = u;
      }
    };
    if (x > 0) step(t - 1);
    if (x < W - 1) step(t + 1);
    if (t >= W) step(t - W);
    if (t < N - W) step(t + W);
  }
  for (let i = 0; i < N; i++) {
    if (landMask[i]) data[i] |= Math.min(30, magn[i]);
    else data[i] |= Math.min(31, Math.ceil((dist[i] === 0xffff ? 62 : dist[i]) / 2));
  }
  return { data, numLand };
}

function components2(mask: Uint8Array, W: number, H: number): { labels: Int32Array; sizes: number[] } {
  const N = W * H;
  const labels = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (labels[s] !== -1) continue;
    const id = sizes.length;
    const k = mask[s];
    let top = 0;
    let size = 0;
    stack[top++] = s;
    labels[s] = id;
    while (top > 0) {
      const t = stack[--top];
      size++;
      const x = t % W;
      const tryPush = (u: number) => {
        if (labels[u] === -1 && mask[u] === k) {
          labels[u] = id;
          stack[top++] = u;
        }
      };
      if (x > 0) tryPush(t - 1);
      if (x < W - 1) tryPush(t + 1);
      if (t >= W) tryPush(t - W);
      if (t < N - W) tryPush(t + W);
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

// The mini map: 2x2 blocks, water wins so the pathfinder keeps every channel.
const mw = w >> 1;
const mh = h >> 1;
const miniLand = new Uint8Array(mw * mh);
const miniMag = new Uint8Array(mw * mh);
for (let y = 0; y < mh; y++) {
  for (let x = 0; x < mw; x++) {
    const a = y * 2 * w + x * 2;
    const all = newLand[a] && newLand[a + 1] && newLand[a + w] && newLand[a + w + 1];
    miniLand[y * mw + x] = all ? 1 : 0;
    miniMag[y * mw + x] = newMag[a + w + 1];
  }
}

const mainPacked = pack(newLand, newMag, w, h);
const miniPacked = pack(miniLand, miniMag, mw, mh);
writeFileSync(join(dir, "main.bin"), mainPacked.data);
writeFileSync(join(dir, "mini.bin"), miniPacked.data);
info.numLandTiles = mainPacked.numLand;
info.miniNumLandTiles = miniPacked.numLand;
info.miniWidth = mw;
info.miniHeight = mh;
info.bridged = { maxGap: MAX_GAP, minLake: MIN_LAKE };
writeFileSync(join(dir, "info.json"), JSON.stringify(info));
console.log(`${dir}: land ${mainPacked.numLand} of ${n} (${((mainPacked.numLand / n) * 100).toFixed(1)}%), mini ${mw}x${mh}`);
