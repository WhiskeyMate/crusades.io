// Woods. Pines on the high ground, broadleaf in the lowlands, scattered once
// when the realm loads.

import * as THREE from "three";
import { mulberry32, Noise, Realm } from "../worldgen/RealmGen";
import { MODELS } from "./Models";
import { Terrain } from "./Terrain";

const MAX_TREES = 14000;

/** The woods of a realm: all of them, or a thinned share, or none (see Quality). */
export interface Woods {
  thin(share: number): void;
}

/** The share of the trees kept when the woods are thinned. */
const THINNED = 0.4;

export function plantWoods(realm: Realm, terrain: Terrain, parent: THREE.Object3D): Woods {
  const rand = mulberry32(realm.width * 31 + realm.numLandTiles);
  const noise = new Noise(rand);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const pines = new THREE.InstancedMesh(MODELS.pine.body, material, MAX_TREES);
  const oaks = new THREE.InstancedMesh(MODELS.oak.body, material, MAX_TREES);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  // Each kind is planted from both ends of its list: the trees that stay when
  // the woods are thinned from the front, the rest from the back. Thinning is
  // then only a matter of drawing fewer, and the gaps fall evenly.
  let np = 0;
  let no = 0;
  let pinesKept = 0;
  let oaksKept = 0;
  const pineList: { m: THREE.Matrix4; c: THREE.Color; keep: boolean }[] = [];
  const oakList: { m: THREE.Matrix4; c: THREE.Color; keep: boolean }[] = [];
  const { width: w, height: h, elevation: e } = realm;
  const step = Math.max(2, Math.round(Math.sqrt((realm.numLandTiles * 0.5) / MAX_TREES)));
  for (let y = 2; y < h - 2; y += step) {
    for (let x = 2; x < w - 2; x += step) {
      const tx = x + (rand() - 0.5) * step;
      const ty = y + (rand() - 0.5) * step;
      const mag = e[Math.round(ty) * w + Math.round(tx)];
      if (mag < 0.6 || mag > 23) continue;
      const wood = noise.fbm(tx * 0.012, ty * 0.012, 3) + noise.at(tx * 0.06, ty * 0.06) * 0.25;
      const want = mag > 9 ? 0.02 : 0.12;
      if (wood < want) continue;
      const pine = mag > 8 + rand() * 4;
      if (pine ? np >= MAX_TREES : no >= MAX_TREES) continue;
      const size = 1.0 + rand() * 0.8;
      p.set(terrain.worldX(tx), terrain.heightAt(tx, ty) - 0.05, terrain.worldZ(ty));
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      s.set(size, size * (0.85 + rand() * 0.4), size);
      m.compose(p, q, s);
      const shade = 0.8 + rand() * 0.35;
      tint.setRGB(shade, shade, shade * 0.95);
      const keep = rand() < THINNED;
      if (pine) {
        pineList.push({ m: m.clone(), c: tint.clone(), keep });
        np++;
      } else {
        oakList.push({ m: m.clone(), c: tint.clone(), keep });
        no++;
      }
    }
  }
  const lay = (mesh: THREE.InstancedMesh, list: typeof pineList): number => {
    list.sort((a, b) => Number(b.keep) - Number(a.keep));
    list.forEach((t, i) => {
      mesh.setMatrixAt(i, t.m);
      mesh.setColorAt(i, t.c);
    });
    return list.filter((t) => t.keep).length;
  };
  pinesKept = lay(pines, pineList);
  oaksKept = lay(oaks, oakList);
  pines.count = np;
  oaks.count = no;
  for (const mesh of [pines, oaks]) {
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    parent.add(mesh);
  }
  return {
    thin(share: number) {
      pines.count = share >= 1 ? np : share <= 0 ? 0 : pinesKept;
      oaks.count = share >= 1 ? no : share <= 0 ? 0 : oaksKept;
      pines.visible = pines.count > 0;
      oaks.visible = oaks.count > 0;
    },
  };
}
