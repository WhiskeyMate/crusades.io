// Everything drawn over the world: the player's purse and levies, the
// standings, the build bar, the chronicle, wars, pact offers and the
// right-click menu.

import { TileRef } from "@crusades/engine-api/game/GameMap";
import {
  BuildableUnit,
  PlayerActions,
  PlayerType,
  TerrainType,
  UnitType,
} from "@crusades/engine-api/game/GameTypes";
import { GameUpdateType } from "@crusades/engine-api/game/GameUpdates";
import { Intent } from "@crusades/engine-api/Schemas";
import { PlayerState, TickDelta, UnitState } from "../client/GameState";
import { css, shieldSVG } from "../client/Heraldry";
import {
  BUILD_ORDER,
  eventText,
  eventTone,
  fmt,
  fmtTroops,
  UNIT_LORE,
} from "../client/Lexicon";
import { Session } from "../client/Session";

const el = (id: string) => document.getElementById(id)!;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const NEEDS: Partial<Record<UnitType, UnitType>> = {
  [UnitType.Warship]: UnitType.Port,
  [UnitType.AtomBomb]: UnitType.MissileSilo,
  [UnitType.HydrogenBomb]: UnitType.MissileSilo,
  [UnitType.MIRV]: UnitType.MissileSilo,
};

export class Hud {
  /** What the next click on the map will build, if anything. */
  placing: UnitType | null = null;
  ratio = 0.2;
  onQuit: () => void = () => {};
  onFocus: (tile: TileRef) => void = () => {};
  onCancel: () => void = () => {};

  private costs = new Map<UnitType, number>();
  private lastSlow = 0;
  private lastCosts = 0;
  private ended = false;
  private offers = new Map<number, HTMLElement>();

  constructor(private session: Session) {
    el("hud").hidden = false;
    this.buildBar();
    const slider = el("ratio") as HTMLInputElement;
    slider.value = String(this.ratio * 100);
    slider.oninput = () => {
      this.ratio = Number(slider.value) / 100;
      this.ratioText();
    };
    this.ratioText();
    el("btn-pause").onclick = () => this.setSpeed(session.paused ? session.speed : 0);
    for (const s of [1, 2, 4]) el(`btn-x${s}`).onclick = () => this.setSpeed(s);
    el("btn-quit").onclick = () => this.onQuit();
    el("btn-help").onclick = () => (el("help").hidden = !el("help").hidden);
    el("help").onclick = () => (el("help").hidden = true);
    this.setSpeed(1);
    for (const id of ["btn-pause", "btn-x1", "btn-x2", "btn-x4"]) el(id).hidden = !session.ownsClock;
    window.addEventListener("keydown", this.key);
    document.addEventListener("pointerdown", this.dismiss, true);
  }

  dispose() {
    window.removeEventListener("keydown", this.key);
    document.removeEventListener("pointerdown", this.dismiss, true);
    el("hud").hidden = true;
    el("menu-ctx").hidden = true;
    el("endgame").hidden = true;
    el("offers").innerHTML = "";
    el("chronicle").innerHTML = "";
  }

  private dismiss = (e: Event) => {
    const menu = el("menu-ctx");
    if (!menu.hidden && !menu.contains(e.target as Node)) menu.hidden = true;
  };

  private key = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.code === "Escape") {
      this.place(null);
      this.onCancel();
      el("menu-ctx").hidden = true;
      el("help").hidden = true;
    } else if (e.code === "Space") {
      e.preventDefault();
      if (this.session.ownsClock) this.setSpeed(this.session.paused ? this.session.speed : 0);
    } else if (/^Digit\d$/.test(e.code)) {
      const n = Number(e.code.slice(5));
      const type = BUILD_ORDER[n === 0 ? 9 : n - 1];
      if (type) this.place(this.placing === type ? null : type);
    } else if (e.code === "KeyC" && this.session.state.me?.spawnTile !== undefined) {
      this.onFocus(this.session.state.me.spawnTile);
    } else if (e.code === "BracketLeft" || e.code === "BracketRight") {
      const slider = el("ratio") as HTMLInputElement;
      slider.value = String(
        Math.min(100, Math.max(1, Number(slider.value) + (e.code === "BracketLeft" ? -10 : 10))),
      );
      slider.oninput!(new Event("input"));
    }
  };

  private setSpeed(s: number) {
    if (s === 0) this.session.paused = true;
    else {
      this.session.paused = false;
      this.session.speed = s;
    }
    el("btn-pause").classList.toggle("on", this.session.paused);
    for (const k of [1, 2, 4]) {
      el(`btn-x${k}`).classList.toggle("on", !this.session.paused && this.session.speed === k);
    }
  }

  private ratioText() {
    const me = this.session.state.me;
    const n = me ? ` · ${fmtTroops(me.troops * this.ratio)}` : "";
    el("ratio-text").textContent = `Commit ${Math.round(this.ratio * 100)}% of your levies${n}`;
  }

  /** A line of guidance above the build bar; null clears it. */
  hint(text: string | null) {
    el("hint").textContent = text ?? "";
    el("hint").hidden = text === null;
  }

  place(type: UnitType | null) {
    this.placing = type;
    document.body.classList.toggle("placing", type !== null);
    for (const b of Array.from(el("build").children) as HTMLElement[]) {
      b.classList.toggle("on", b.dataset.type === type);
    }
    el("hint").textContent = type
      ? `${UNIT_LORE[type].name}: click the map to place it. Shift-click to place several. Esc to cancel.`
      : "";
    el("hint").hidden = type === null;
  }

  private buildBar() {
    const bar = el("build");
    bar.innerHTML = "";
    BUILD_ORDER.forEach((type, i) => {
      const lore = UNIT_LORE[type];
      const b = document.createElement("button");
      b.className = "build-btn";
      b.dataset.type = type;
      b.innerHTML =
        `<span class="key">${(i + 1) % 10}</span><span class="glyph">${lore.glyph}</span>` +
        `<span class="name">${lore.name}</span><span class="cost">—</span>` +
        `<span class="tip"><b>${lore.name}</b><br>${lore.blurb}</span>`;
      b.onclick = () => this.place(this.placing === type ? null : type);
      bar.appendChild(b);
    });
  }

  private async refreshCosts() {
    const list = await this.session.buildables(null, BUILD_ORDER as never);
    for (const b of list) this.costs.set(b.type, Number(b.cost));
  }

  toast(text: string, tone: "bad" | "good" | "warn" | "info" = "info", focus?: TileRef) {
    const log = el("chronicle");
    const row = document.createElement("div");
    row.className = `event ${tone}`;
    row.textContent = text;
    if (focus !== undefined) {
      row.classList.add("link");
      row.onclick = () => this.onFocus(focus);
    }
    log.appendChild(row);
    while (log.children.length > 7) log.firstChild!.remove();
    window.setTimeout(() => row.classList.add("old"), 9000);
    window.setTimeout(() => row.remove(), 16000);
  }

  private name(smallID: number): string {
    return this.session.state.players.get(smallID)?.name ?? "the wilds";
  }

  onTick(delta: TickDelta) {
    const state = this.session.state;
    const me = state.me;
    const u = delta.updates;
    const my = me?.smallID ?? -1;

    for (const d of u[GameUpdateType.DisplayEvent]) {
      if (d.playerID !== null && d.playerID !== my) continue;
      this.toast(eventText(d.message, d.params), eventTone(d.messageType));
    }
    for (const d of u[GameUpdateType.UnitIncoming]) {
      if (d.playerID !== my) continue;
      const unit = state.units.get(d.unitID);
      this.toast(d.message, "warn", unit?.targetTile ?? unit?.pos);
    }
    for (const r of u[GameUpdateType.AllianceRequest]) {
      if (r.recipientID === my) this.offer(r.requestorID);
    }
    for (const r of u[GameUpdateType.AllianceRequestReply]) {
      if (r.request.requestorID === my) {
        this.toast(
          r.accepted
            ? `${this.name(r.request.recipientID)} has sworn a pact with you.`
            : `${this.name(r.request.recipientID)} refused your pact.`,
          r.accepted ? "good" : "bad",
        );
      } else if (r.request.recipientID === my) {
        this.offers.get(r.request.requestorID)?.remove();
        this.offers.delete(r.request.requestorID);
      }
    }
    for (const b of u[GameUpdateType.BrokeAlliance]) {
      if (b.betrayedID === my) {
        this.toast(`${this.name(b.traitorID)} has broken their oath to you!`, "bad");
      } else if (b.traitorID === my) {
        this.toast(`You broke faith with ${this.name(b.betrayedID)}. You are named oathbreaker.`, "warn");
      }
    }
    for (const a of u[GameUpdateType.AllianceExpired]) {
      if (a.player1ID === my || a.player2ID === my) {
        this.toast(`Your pact with ${this.name(a.player1ID === my ? a.player2ID : a.player1ID)} has lapsed.`, "info");
      }
    }
    for (const c of u[GameUpdateType.ConquestEvent]) {
      const victor = state.playersByID.get(c.conquerorId);
      const fallen = state.playersByID.get(c.conqueredId);
      if (!victor || !fallen || victor === me) continue;
      if (fallen.type !== PlayerType.Bot || fallen === me) {
        this.toast(`${fallen.name} has fallen to ${victor.name}.`, fallen === me ? "bad" : "info");
      }
    }
    for (const win of u[GameUpdateType.Win]) {
      const w = win.winner;
      if (!w) continue;
      const mine = w[0] === "player" && w[1] === this.session.clientID;
      this.end(
        mine ? "Victory" : "Defeat",
        mine
          ? "The realm bends the knee. Every banner flies beneath yours."
          : `${w[0] === "nation" ? w[1] : "Another lord"} has claimed the crown of the realm.`,
      );
    }
    if (me && me.hasSpawned && !me.isAlive && !state.inSpawnPhase && !this.ended) {
      this.end("Your line has ended", "Your last hold has fallen. The chronicle goes on without you.");
    }

    const now = performance.now();
    if (now - this.lastCosts > 1500 && me) {
      this.lastCosts = now;
      void this.refreshCosts();
    }
    if (now - this.lastSlow > 250) {
      this.lastSlow = now;
      this.slow();
    }
  }

  private end(title: string, text: string) {
    if (this.ended) return;
    this.ended = true;
    el("end-title").textContent = title;
    el("end-text").textContent = text;
    el("endgame").hidden = false;
    el("end-watch").onclick = () => (el("endgame").hidden = true);
    el("end-quit").onclick = () => this.onQuit();
  }

  private offer(requestorID: number) {
    const from = this.session.state.players.get(requestorID);
    if (!from || this.offers.has(requestorID)) return;
    const box = document.createElement("div");
    box.className = "offer";
    box.innerHTML =
      `<div>${shieldSVG(from.name, from.color, 22)} <b>${esc(from.name)}</b> offers a pact.</div>` +
      `<div class="row"><button class="yes">Swear it</button><button class="no">Refuse</button></div>`;
    (box.querySelector(".yes") as HTMLElement).onclick = () => {
      this.session.send({ type: "allianceRequest", recipient: from.id });
      close();
    };
    (box.querySelector(".no") as HTMLElement).onclick = () => {
      this.session.send({ type: "allianceReject", requestor: from.id });
      close();
    };
    const close = () => {
      box.remove();
      this.offers.delete(requestorID);
    };
    this.offers.set(requestorID, box);
    el("offers").appendChild(box);
    window.setTimeout(close, 20000);
  }

  /** The parts that only need refreshing a few times a second. */
  private slow() {
    const state = this.session.state;
    const me = state.me;
    const land = state.map.numLandTiles();

    const banner = el("banner");
    if (this.session.catchingUp) {
      banner.hidden = false;
      banner.innerHTML = "Catching up with the game…";
    } else if (state.inSpawnPhase) {
      const left = Math.max(0, Math.ceil((state.config.numSpawnPhaseTurns() - state.tick) / 10));
      banner.hidden = false;
      banner.innerHTML = me?.hasSpawned
        ? `Your banner is raised. Click elsewhere to move it. The realm wakes in <b>${left}</b>…`
        : `The realm awaits you. <b>Click any unclaimed land</b> to raise your banner.`;
    } else {
      banner.hidden = true;
    }

    if (me) {
      const max = state.maxTroops(me);
      el("me-name").innerHTML = `${shieldSVG(me.name, me.color, 20)}<span>${esc(me.name)}</span>`;
      el("me-gold").textContent = fmt(me.gold);
      el("me-troops").textContent = `${fmtTroops(me.troops)} / ${fmtTroops(max)}`;
      (el("me-bar").firstElementChild as HTMLElement).style.width =
        `${Math.min(100, (me.troops / Math.max(1, max)) * 100)}%`;
      el("me-land").textContent = `${((me.tilesOwned / land) * 100).toFixed(1)}%`;
      this.ratioText();
    }

    const owned = new Set<UnitType>();
    if (me) {
      for (const unit of state.units.values()) {
        if (unit.ownerID === me.smallID && !unit.underConstruction) owned.add(unit.type);
      }
    }
    for (const b of Array.from(el("build").children) as HTMLElement[]) {
      const type = b.dataset.type as UnitType;
      const cost = this.costs.get(type);
      const need = NEEDS[type];
      const lacks = need !== undefined && !owned.has(need);
      (b.querySelector(".cost") as HTMLElement).textContent = lacks
        ? `needs ${UNIT_LORE[need!].name}`
        : cost === undefined
          ? "—"
          : `${fmt(cost)} ⛃`;
      b.classList.toggle("poor", lacks || !me || (cost !== undefined && me.gold < cost));
    }

    const ranked = [...state.players.values()]
      .filter((p) => p.isAlive && p.tilesOwned > 0)
      .sort((a, b) => b.tilesOwned - a.tilesOwned);
    const top = ranked.slice(0, 8);
    if (me && me.isAlive && !top.includes(me) && me.tilesOwned > 0) top.push(me);
    el("ranks").innerHTML = top
      .map((p) => {
        const rank = ranked.indexOf(p) + 1;
        const ally = me && me.allies.includes(p.smallID);
        return (
          `<tr class="${p === me ? "me" : ""}" data-tile="${Math.round(p.nameY) * state.map.width() + Math.round(p.nameX)}">` +
          `<td class="n">${rank}</td><td class="who">${shieldSVG(p.name, p.color, 15)}` +
          `<span>${esc(p.name)}</span>${ally ? '<i title="Pact">🤝</i>' : ""}${p.isTraitor ? '<i title="Oathbreaker">🗡</i>' : ""}</td>` +
          `<td>${((p.tilesOwned / land) * 100).toFixed(1)}%</td><td>${fmtTroops(p.troops)}</td><td>${fmt(p.gold)}</td></tr>`
        );
      })
      .join("");
    for (const tr of Array.from(el("ranks").children) as HTMLElement[]) {
      tr.onclick = () => this.onFocus(Number(tr.dataset.tile));
    }
    el("alive").textContent = `${ranked.length} banners still fly`;

    const wars = el("wars");
    if (me && (me.outgoingAttacks.length > 0 || me.incomingAttacks.length > 0)) {
      wars.hidden = false;
      wars.innerHTML =
        me.incomingAttacks
          .map((a) => {
            const p = state.players.get(a.attackerID);
            return `<div class="war in"><span>⚔ ${esc(p?.name ?? "?")} marches on you</span><b>${fmtTroops(a.troops)}</b></div>`;
          })
          .join("") +
        me.outgoingAttacks
          .map((a) => {
            const p = state.players.get(a.targetID);
            return (
              `<div class="war out"><span>➤ ${a.retreating ? "Retreating from" : "Marching on"} ${esc(p?.name ?? "the wilds")}</span>` +
              `<b>${fmtTroops(a.troops)}</b>${a.retreating ? "" : `<button data-id="${esc(a.id)}" title="Call off the attack">✕</button>`}</div>`
            );
          })
          .join("");
      for (const b of Array.from(wars.querySelectorAll("button"))) {
        b.onclick = () => this.session.send({ type: "cancel_attack", attackID: b.dataset.id! });
      }
    } else {
      wars.hidden = true;
    }
  }

  /** The little card that follows the cursor. */
  hover(tile: TileRef | null, clientX: number, clientY: number, unit?: UnitState) {
    const tip = el("tip");
    if (tile === null || !el("menu-ctx").hidden) {
      tip.hidden = true;
      return;
    }
    const state = this.session.state;
    const map = state.map;
    const owner = state.owner(tile);
    let text: string;
    if (owner) {
      const kind = owner === state.me ? "Your realm" : owner.type === PlayerType.Bot ? "Clan" : "Kingdom";
      text =
        `<b>${shieldSVG(owner.name, owner.color, 14)} ${esc(owner.name)}</b>` +
        `<span>${kind} · ${fmtTroops(owner.troops)} levies${state.me && state.me.allies.includes(owner.smallID) ? " · sworn pact" : ""}</span>`;
    } else if (map.isLand(tile)) {
      const t = map.terrainType(tile);
      text = `<b>Unclaimed ${t === TerrainType.Mountain ? "mountains" : t === TerrainType.Highland ? "highlands" : "lowlands"}</b>`;
    } else {
      tip.hidden = true;
      return;
    }
    if (unit) {
      const lore = UNIT_LORE[unit.type];
      text += `<span>${lore.glyph} ${lore.name} · level ${unit.level}${unit.underConstruction ? " (building)" : ""}</span>`;
    }
    if (map.hasFallout(tile)) text += "<span>Scorched earth</span>";
    tip.innerHTML = text;
    tip.hidden = false;
    tip.style.transform = `translate(${clientX + 16}px, ${clientY + 18}px)`;
  }

  /** Right-click: what can be done to whoever holds this tile. */
  async context(tile: TileRef, clientX: number, clientY: number) {
    const state = this.session.state;
    const me = state.me;
    if (!me || state.inSpawnPhase) return;
    const actions = await this.session.actions(tile, [UnitType.TransportShip]);
    if (!actions) return;
    const owner = state.owner(tile);
    const menu = el("menu-ctx");
    const items: { label: string; intent: Intent; tone?: string }[] = [];
    const send = fmtTroops(me.troops * this.ratio);
    if (actions.canAttack) {
      items.push({
        label: `⚔ March on ${owner ? esc(owner.name) : "the wilds"} (${send})`,
        intent: { type: "attack", targetID: owner?.id ?? null, troops: me.troops * this.ratio },
      });
    }
    if (owner !== me && canSail(actions.buildableUnits)) {
      items.push({
        label: `🛶 Land longships here (${send})`,
        intent: { type: "boat", troops: me.troops * this.ratio, dst: tile },
      });
    }
    const it = actions.interaction;
    if (owner && owner !== me && it) {
      if (it.canSendAllianceRequest) {
        items.push({ label: "🤝 Offer a pact", intent: { type: "allianceRequest", recipient: owner.id } });
      }
      if (it.allianceInfo?.canExtend) {
        items.push({ label: "📜 Renew our pact", intent: { type: "allianceExtension", recipient: owner.id } });
      }
      if (it.canBreakAlliance) {
        items.push({ label: "🗡 Break our pact", tone: "bad", intent: { type: "breakAlliance", recipient: owner.id } });
      }
      if (it.canTarget) {
        items.push({ label: "🎯 Name them a common foe", intent: { type: "targetPlayer", target: owner.id } });
      }
      if (it.canDonateTroops) {
        items.push({ label: "🎁 Lend levies", intent: { type: "donate_troops", recipient: owner.id, troops: null } });
      }
      if (it.canDonateGold) {
        items.push({ label: "💰 Send gold", intent: { type: "donate_gold", recipient: owner.id, gold: null } });
      }
      items.push(
        it.canEmbargo
          ? { label: "⛔ Forbid trade with them", intent: { type: "embargo", targetID: owner.id, action: "start" } }
          : { label: "✅ Reopen trade with them", intent: { type: "embargo", targetID: owner.id, action: "stop" } },
      );
    }
    let head: string;
    if (owner) {
      head =
        `<div class="head">${shieldSVG(owner.name, owner.color, 30)}<div><b>${esc(owner.name)}</b>` +
        `<span>${fmtTroops(owner.troops)} levies · ${fmt(owner.gold)} gold · ${owner.tilesOwned.toLocaleString("en-US")} tiles</span>` +
        `${owner.isTraitor ? "<span class='bad'>Oathbreaker</span>" : ""}</div></div>`;
    } else {
      head = `<div class="head"><div><b>${state.map.isLand(tile) ? "Unclaimed wilds" : "Open water"}</b></div></div>`;
    }
    menu.innerHTML =
      head +
      (items.length === 0
        ? `<div class="none">Nothing to be done here.</div>`
        : items.map((it2, i) => `<button class="${it2.tone ?? ""}" data-i="${i}">${it2.label}</button>`).join(""));
    for (const b of Array.from(menu.querySelectorAll("button"))) {
      b.onclick = () => {
        this.session.send(items[Number(b.dataset.i)].intent);
        menu.hidden = true;
      };
    }
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(clientX, window.innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(clientY, window.innerHeight - r.height - 8)}px`;
    el("tip").hidden = true;
  }
}

export function canSail(units: BuildableUnit[]): boolean {
  return units.some((b) => b.type === UnitType.TransportShip && b.canBuild !== false);
}

export type { PlayerActions, PlayerState };
