// A realm you have conquered: a banner of words over the place where its
// last ground fell, saying who it was and what gold came with it. It rises a
// little and fades.

import * as THREE from "three";
import { Stage } from "../render/Stage";
import { Terrain } from "../render/Terrain";

/** How long each stays, in seconds. */
const LASTS = 6;

interface Mark {
  root: HTMLElement;
  x: number;
  y: number;
  born: number;
}

export class ConquestMarks {
  private marks: Mark[] = [];
  private v = new THREE.Vector3();

  constructor(
    private layer: HTMLElement,
    private stage: Stage,
    private terrain: Terrain,
  ) {}

  /** At tile (x, y): `name` has fallen and `gold` (already in words) was taken. */
  add(x: number, y: number, name: string, gold: string, now: number) {
    const root = document.createElement("div");
    root.className = "conquest-mark";
    const who = document.createElement("b");
    who.textContent = `${name} conquered`;
    const sum = document.createElement("span");
    sum.textContent = `+${gold} gold`;
    root.append(who, sum);
    this.layer.appendChild(root);
    this.marks.push({ root, x, y, born: now });
  }

  update(now: number) {
    if (this.marks.length === 0) return;
    const cam = this.stage.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      const age = (now - m.born) / 1000;
      if (age > LASTS) {
        m.root.remove();
        this.marks.splice(i, 1);
        continue;
      }
      this.v.set(this.terrain.worldX(m.x), this.terrain.surfaceAt(m.x, m.y) + 2, this.terrain.worldZ(m.y));
      this.v.project(cam);
      const off = this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1;
      m.root.style.display = off ? "none" : "";
      if (off) continue;
      const sx = Math.round((this.v.x * 0.5 + 0.5) * w);
      // Up from the ground as it ages; in with a swell, out with a fade.
      const sy = Math.round((-this.v.y * 0.5 + 0.5) * h - 30 - age * 14);
      const swell = age < 0.35 ? 0.6 + (age / 0.35) * 0.5 : age < 0.6 ? 1.1 - ((age - 0.35) / 0.25) * 0.1 : 1;
      m.root.style.opacity = String(age > LASTS - 1.5 ? Math.max(0, (LASTS - age) / 1.5) : 1);
      m.root.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%) scale(${swell.toFixed(3)})`;
    }
  }

  dispose() {
    for (const m of this.marks) m.root.remove();
    this.marks = [];
  }
}
