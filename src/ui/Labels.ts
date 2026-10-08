// Realm names floating over the land, one HTML element per player, placed
// each frame where the engine says the name fits.

import * as THREE from "three";
import { PlayerType } from "@crusades/engine-api/game/GameTypes";
import { GameState, PlayerState } from "../client/GameState";
import { shieldSVG } from "../client/Heraldry";
import { fmtTroops } from "../client/Lexicon";
import { Stage } from "../render/Stage";
import { Terrain } from "../render/Terrain";

interface Label {
  root: HTMLElement;
  troops: HTMLElement;
  shown: boolean;
  lastTroops: string;
  size: number;
}

export class Labels {
  private labels = new Map<number, Label>();
  private v = new THREE.Vector3();

  constructor(
    private layer: HTMLElement,
    private stage: Stage,
    private terrain: Terrain,
    private state: GameState,
  ) {
    layer.innerHTML = "";
  }

  private make(p: PlayerState): Label {
    const root = document.createElement("div");
    root.className = "label" + (p === this.state.me ? " me" : "");
    const name = document.createElement("div");
    name.className = "label-name";
    name.innerHTML = `${shieldSVG(p.name, p.color, 16)}<span></span>`;
    name.lastElementChild!.textContent = p.name;
    const troops = document.createElement("div");
    troops.className = "label-troops";
    root.append(name, troops);
    this.layer.appendChild(root);
    return { root, troops, shown: true, lastTroops: "", size: 0 };
  }

  update() {
    const cam = this.stage.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pxPerUnit = h / (2 * Math.tan((cam.fov * Math.PI) / 360));
    for (const p of this.state.players.values()) {
      let l = this.labels.get(p.smallID);
      // Clans are lettered on the ground instead (render/GroundNames.ts).
      const want =
        p.type !== PlayerType.Bot && p.isAlive && p.nameSize > 0 && p.tilesOwned > 0;
      if (!want) {
        if (l && l.shown) {
          l.root.style.display = "none";
          l.shown = false;
        }
        continue;
      }
      const tx = p.nameX;
      const ty = p.nameY;
      this.v.set(this.terrain.worldX(tx), this.terrain.surfaceAt(tx, ty) + 1, this.terrain.worldZ(ty));
      const depth = this.v.distanceTo(cam.position);
      this.v.project(cam);
      const size = Math.min(26, ((p.nameSize * pxPerUnit) / depth) * 1.5);
      const visible =
        size >= 7.5 && this.v.z < 1 && Math.abs(this.v.x) < 1.15 && Math.abs(this.v.y) < 1.15;
      if (!visible) {
        if (l && l.shown) {
          l.root.style.display = "none";
          l.shown = false;
        }
        continue;
      }
      if (!l) {
        l = this.make(p);
        this.labels.set(p.smallID, l);
      }
      if (!l.shown) {
        l.root.style.display = "";
        l.shown = true;
      }
      const sx = (this.v.x * 0.5 + 0.5) * w;
      const sy = (-this.v.y * 0.5 + 0.5) * h;
      // Size the type itself rather than scaling a 16px rendering of it, and
      // land on whole pixels: both keep the letters sharp.
      const fs = Math.round(size * 2) / 2;
      if (fs !== l.size) {
        l.root.style.fontSize = `${fs}px`;
        l.size = fs;
      }
      l.root.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -50%)`;
      const t = fmtTroops(p.troops);
      if (t !== l.lastTroops) {
        l.troops.textContent = t;
        l.lastTroops = t;
      }
    }
  }
}
