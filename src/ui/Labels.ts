// Realm names floating over the land, one HTML element per player, placed
// each frame where the engine says the name fits.

import * as THREE from "three";
import { PlayerType } from "@crusades/engine-api/game/GameTypes";
import { GameState, PlayerState } from "../client/GameState";
import { shieldSVG } from "../client/Heraldry";
import { fmtTroops } from "../client/Lexicon";
import { Stage } from "../render/Stage";
import { Terrain } from "../render/Terrain";

/** Two linked rings: a pact in force. */
const PACT_SVG =
  `<svg viewBox="0 0 34 20" aria-hidden="true"><g fill="none" stroke-width="3.4">` +
  `<circle cx="12" cy="10" r="7" stroke="#1b1410" stroke-width="5.6"/><circle cx="22" cy="10" r="7" stroke="#1b1410" stroke-width="5.6"/>` +
  `<circle cx="12" cy="10" r="7" stroke="#8fe08a"/><circle cx="22" cy="10" r="7" stroke="#f2d27a"/>` +
  `<path d="M15.6 4a7 7 0 0 1 0 12" stroke="#8fe08a"/></g></svg>`;

interface Label {
  root: HTMLElement;
  /** Shown above the name while we have a pact with this house. */
  pact: HTMLElement;
  pactShown: boolean;
  pactLook: string;
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
    name.innerHTML = `${shieldSVG(p.name, p.color, 16, p.arms)}<span></span>`;
    name.lastElementChild!.textContent = p.name;
    const troops = document.createElement("div");
    troops.className = "label-troops";
    const pact = document.createElement("div");
    pact.className = "label-pact";
    pact.innerHTML = PACT_SVG;
    pact.style.display = "none";
    root.append(pact, name, troops);
    this.layer.appendChild(root);
    return { root, pact, pactShown: false, pactLook: "", troops, shown: true, lastTroops: "", size: 0 };
  }

  update() {
    const cam = this.stage.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pxPerUnit = h / (2 * Math.tan((cam.fov * Math.PI) / 360));
    // Our pacts, by the other house's id.
    const me = this.state.me;
    const tick = this.state.tick;
    const renewWindow = this.state.config.allianceExtensionPromptOffset();
    let pacts: Map<string, { createdAt: number; expiresAt: number }> | null = null;
    if (me && me.alliances.length > 0) {
      pacts = new Map();
      for (const a of me.alliances) pacts.set(a.other, a);
    }
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
      // A pact with us: the linked rings, bright when freshly sworn and
      // fading as it runs out, then pulsing once it can be renewed.
      const pact = pacts?.get(p.id);
      if (!pact) {
        if (l.pactShown) {
          l.pact.style.display = "none";
          l.pactShown = false;
        }
      } else {
        const left = Math.max(0, pact.expiresAt - tick);
        const span = Math.max(1, pact.expiresAt - pact.createdAt);
        const renew = left <= renewWindow;
        // Steps of a twentieth: no need to touch the page every frame.
        const look = `${(0.25 + 0.75 * Math.round(Math.min(1, left / span) * 20) / 20).toFixed(2)}${renew ? "r" : ""}`;
        if (!l.pactShown) {
          l.pact.style.display = "";
          l.pactShown = true;
        }
        if (look !== l.pactLook) {
          l.pactLook = look;
          l.pact.style.opacity = look.replace("r", "");
          l.pact.classList.toggle("renew", renew);
          l.pact.title = renew ? "Pact about to lapse: renew it" : "Pact in force";
        }
      }
      const t = fmtTroops(p.troops);
      if (t !== l.lastTroops) {
        l.troops.textContent = t;
        l.lastTroops = t;
      }
    }
  }
}
