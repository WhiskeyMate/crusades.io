// Troop counts on the front lines: a small pill at each cluster of a
// running attack, gold for your own marches, red for those against you.
// The engine works out where each attack's front is; this asks it a few
// times a second and places the pills on the ground.

import * as THREE from "three";
import { GameState } from "../client/GameState";
import { fmtTroops } from "../client/Lexicon";
import { Session } from "../client/Session";
import { Stage } from "../render/Stage";
import { Terrain } from "../render/Terrain";

interface Pill {
  root: HTMLElement;
  text: string;
}

const POLL_MS = 400;
const MAX_PER_ATTACK = 6;

export class AttackLabels {
  private pills = new Map<string, Pill>();
  private positions = new Map<string, { x: number; y: number }[]>();
  private lastPoll = 0;
  private polling = false;
  private v = new THREE.Vector3();

  constructor(
    private layer: HTMLElement,
    private session: Session,
    private stage: Stage,
    private terrain: Terrain,
    private state: GameState,
  ) {}

  private async poll() {
    const me = this.state.me;
    if (!me || this.polling) return;
    if (me.outgoingAttacks.length === 0 && me.incomingAttacks.length === 0) {
      if (this.positions.size > 0) this.positions.clear();
      return;
    }
    this.polling = true;
    try {
      const attacks = await this.session.attackPositions();
      this.positions.clear();
      for (const a of attacks) this.positions.set(a.id, a.positions.slice(0, MAX_PER_ATTACK));
    } finally {
      this.polling = false;
    }
  }

  update(now: number) {
    if (now - this.lastPoll > POLL_MS) {
      this.lastPoll = now;
      void this.poll();
    }
    const me = this.state.me;
    const cam = this.stage.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const seen = new Set<string>();
    if (me) {
      const all = [
        ...me.outgoingAttacks.map((a) => ({ a, mine: true })),
        ...me.incomingAttacks.map((a) => ({ a, mine: false })),
      ];
      for (const { a, mine } of all) {
        const spots = this.positions.get(a.id);
        if (!spots) continue;
        spots.forEach((p, i) => {
          const key = `${a.id}:${i}`;
          this.v.set(this.terrain.worldX(p.x), this.terrain.surfaceAt(p.x, p.y) + 1.5, this.terrain.worldZ(p.y));
          this.v.project(cam);
          if (this.v.z > 1 || Math.abs(this.v.x) > 1.05 || Math.abs(this.v.y) > 1.05) return;
          seen.add(key);
          let pill = this.pills.get(key);
          if (!pill) {
            const root = document.createElement("div");
            root.className = `attack-pill ${mine ? "mine" : "theirs"}`;
            this.layer.appendChild(root);
            pill = { root, text: "" };
            this.pills.set(key, pill);
          }
          const text = `${mine ? "➤" : "⚔"} ${fmtTroops(a.troops)}${a.retreating ? " ↩" : ""}`;
          if (text !== pill.text) {
            pill.root.textContent = text;
            pill.text = text;
          }
          const sx = Math.round((this.v.x * 0.5 + 0.5) * w);
          const sy = Math.round((-this.v.y * 0.5 + 0.5) * h);
          pill.root.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
        });
      }
    }
    for (const [key, pill] of this.pills) {
      if (!seen.has(key)) {
        pill.root.remove();
        this.pills.delete(key);
      }
    }
  }

  dispose() {
    for (const p of this.pills.values()) p.root.remove();
    this.pills.clear();
  }
}
