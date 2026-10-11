// Everything drawn over the world: the player's purse and levies, the
// standings, the build bar, the chronicle, wars, pact offers and the
// right-click menu.

import { closeRadial, ICON, openRadial, radialOpen, Slice } from "./Radial";
import { Choice, quality } from "../render/Quality";
import { track } from "./Analytics";
import { drawEndOffer } from "../account/Panel";
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

/** A small longship, drawn beside the number of levies aboard. */
const BOAT_ICON =
  `<svg class="boat" viewBox="0 0 24 20" aria-hidden="true">` +
  `<path d="M2 12h20l-3.5 6h-13z" fill="#8a5a2b" stroke="#1b1410" stroke-width="1.2" stroke-linejoin="round"/>` +
  `<path d="M12 1.5v10h7z" fill="#f1ead8" stroke="#1b1410" stroke-width="1.2" stroke-linejoin="round"/>` +
  `<path d="M10.5 3.5v8H5z" fill="#c71a21" stroke="#1b1410" stroke-width="1.2" stroke-linejoin="round"/></svg>`;

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
    el("btn-gfx").onclick = () => {
      const next: Record<Choice, Choice> = { auto: "high", high: "medium", medium: "low", low: "auto" };
      quality.set(next[quality.choice]);
      this.showGraphics();
      this.toast(
        quality.choice === "auto"
          ? `Graphics: automatic (now ${quality.level}). The game lowers it if it runs slowly.`
          : `Graphics: ${quality.choice}.`,
        "good",
      );
    };
    this.showGraphics();
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
    closeRadial();
    el("endgame").hidden = true;
    el("offers").innerHTML = "";
    el("raids").innerHTML = "";
    el("raids").hidden = true;
    this.raids.clear();
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
      closeRadial();
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

  private lastAim: boolean | null | undefined = undefined;

  /**
   * While aiming a fireball or dragon: say whether the flight drawn on the
   * map is clear (false), covered by a ballista tower (true), or cannot be
   * drawn because no mage tower is ready (null).
   */
  aimWarning(doomed: boolean | null) {
    const type = this.placing;
    const aiming = type === UnitType.AtomBomb || type === UnitType.HydrogenBomb;
    const state = aiming ? doomed : undefined;
    if (state === this.lastAim) return;
    this.lastAim = state;
    const hint = el("hint");
    hint.classList.toggle("danger", state === true);
    hint.classList.toggle("clear", state === false);
    if (!aiming || !type) return;
    const name = UNIT_LORE[type].name;
    hint.textContent =
      state === true ? `${name}: a ballista tower covers this flight. It will likely be shot down (red line).`
      : state === false ? `${name}: clear flight, no ballista tower in reach. Click to cast. Esc to cancel.`
      : `${name}: click the map to place it. Shift-click to place several. Esc to cancel.`;
  }

  /** The Graphics button says what is in force. */
  showGraphics() {
    const b = el("btn-gfx");
    const name = { high: "High", medium: "Med", low: "Low" }[quality.level];
    b.textContent = quality.choice === "auto" ? `Auto·${name}` : name;
    b.title = `Graphics quality: ${quality.choice === "auto" ? `automatic, now ${quality.level}` : quality.choice}. Click to change.`;
  }

  private lastUpgrade: number | null = null;

  /**
   * While placing a building: says whether the click will raise one that is
   * already there (and to what level) or build a new one.
   */
  upgradeHint(level: number | null) {
    const type = this.placing;
    if (level === this.lastUpgrade) return;
    this.lastUpgrade = level;
    const hint = el("hint");
    hint.classList.toggle("upgrade", level !== null);
    if (!type || type === UnitType.AtomBomb || type === UnitType.HydrogenBomb) return;
    const name = UNIT_LORE[type].name;
    hint.textContent =
      level !== null
        ? `${name}: click to raise the ringed one to level ${level + 1}, not build a new one. Esc to cancel.`
        : `${name}: click the map to place it. Shift-click to place several. Esc to cancel.`;
  }

  place(type: UnitType | null) {
    this.lastUpgrade = null;
    el("hint").classList.remove("upgrade");
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
        `<span class="name">${lore.name}</span><span class="cost">—</span><span class="count" hidden></span>` +
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

  /** Longships bound for our shores, by unit id, each with its row in the notice. */
  private raids = new Map<number, HTMLElement>();

  /**
   * Keeps the "longships approaching" notice in step with the sea: a row for
   * every hostile longship whose landing place is ours, gone when it lands or
   * sinks. Clicking a row takes the camera to the ship as it is now.
   */
  private watchTheSea() {
    const state = this.session.state;
    const me = state.me;
    const box = el("raids");
    const seen = new Set<number>();
    if (me && me.isAlive) {
      for (const u of state.units.values()) {
        if (u.type !== UnitType.TransportShip || u.ownerID === me.smallID || u.targetTile === undefined) continue;
        if (state.map.ownerID(u.targetTile) !== me.smallID) continue;
        const owner = state.players.get(u.ownerID);
        if (owner && state.isAllied(owner, me)) continue;
        seen.add(u.id);
        let row = this.raids.get(u.id);
        if (!row) {
          row = document.createElement("div");
          row.className = "war in raid";
          row.title = "Click to see the ship";
          const id = u.id;
          row.onclick = () => {
            const ship = this.session.state.units.get(id);
            if (ship) this.onFocus(ship.pos);
          };
          this.raids.set(u.id, row);
          box.appendChild(row);
        }
        // Built like an attack notice: what is happening, then how many.
        const who = owner ? esc(owner.name) : "Raiders";
        const count = u.troops > 0 ? fmtTroops(u.troops) : "";
        const text = `${who}|${count}`;
        if (row.dataset.text !== text) {
          row.dataset.text = text;
          row.innerHTML = `<span>${who}: longships approaching</span><b>${BOAT_ICON}${count}</b>`;
        }
      }
    }
    for (const [id, row] of this.raids) {
      if (seen.has(id)) continue;
      row.remove();
      this.raids.delete(id);
    }
    box.hidden = this.raids.size === 0;
  }

  onTick(delta: TickDelta) {
    if (delta.tick % 3 === 0) this.watchTheSea();
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
    drawEndOffer();
    track("game_end", { outcome: title });
    el("end-watch").onclick = () => (el("endgame").hidden = true);
    el("end-quit").onclick = () => this.onQuit();
  }

  private offer(requestorID: number) {
    const from = this.session.state.players.get(requestorID);
    if (!from || this.offers.has(requestorID)) return;
    const box = document.createElement("div");
    box.className = "offer";
    box.innerHTML =
      `<div>${shieldSVG(from.name, from.color, 22, from.arms)} <b>${esc(from.name)}</b> offers a pact.</div>` +
      `<div class="row"><button class="yes">Swear it</button><button class="no">Refuse</button></div>`;
    // Click the notice itself (not its buttons) to be shown who is asking.
    box.title = "Click to see their realm";
    box.onclick = (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const p = this.session.state.players.get(requestorID);
      if (!p || p.nameSize <= 0) return;
      const map = this.session.state.map;
      this.onFocus(map.ref(Math.round(p.nameX), Math.round(p.nameY)));
    };
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
      el("me-name").innerHTML = `${shieldSVG(me.name, me.color, 20, me.arms)}<span>${esc(me.name)}</span>`;
      el("me-gold").textContent = fmt(me.gold);
      el("me-troops").textContent = `${fmtTroops(me.troops)} / ${fmtTroops(max)}`;
      (el("me-bar").firstElementChild as HTMLElement).style.width =
        `${Math.min(100, (me.troops / Math.max(1, max)) * 100)}%`;
      // Levies gained each turn (shown in the same units as the levy count).
      const rate = Math.max(0, state.troopRate(me)) / 10;
      el("me-rate").textContent = `+${rate >= 100 ? fmt(rate) : rate.toFixed(1)}`;
      this.ratioText();
    }

    const owned = new Set<UnitType>();
    // How many of each the player has: buildings standing or going up,
    // galleys afloat, sorceries in flight.
    const counts = new Map<UnitType, number>();
    if (me) {
      for (const unit of state.units.values()) {
        if (unit.ownerID !== me.smallID) continue;
        if (!unit.underConstruction) owned.add(unit.type);
        const type = unit.type === UnitType.MIRVWarhead ? UnitType.MIRV : unit.type;
        counts.set(type, (counts.get(type) ?? 0) + 1);
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
      const have = counts.get(type) ?? 0;
      const badge = b.querySelector(".count") as HTMLElement;
      badge.hidden = have === 0;
      badge.textContent = `×${have}`;
      badge.title = `You have ${have}`;
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
          `<td class="n">${rank}</td><td class="who">${shieldSVG(p.name, p.color, 15, p.arms)}` +
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
            return (
              `<div class="war in"><span>⚔ ${esc(p?.name ?? "?")} marches on you</span><b>${fmtTroops(a.troops)}</b>` +
              (p ? `<button class="answer" data-answer="${esc(p.id)}" data-troops="${a.troops}" title="Answer: march on them with a matching force">⚔</button>` : "") +
              `</div>`
            );
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
        if (b.dataset.answer) {
          // Meet them with as many levies as they sent, or all you can spare.
          b.onclick = () => {
            const troops = Math.min(Number(b.dataset.troops), me.troops * 0.9);
            if (troops > 0) this.session.send({ type: "attack", targetID: b.dataset.answer!, troops });
          };
        } else {
          b.onclick = () => this.session.send({ type: "cancel_attack", attackID: b.dataset.id! });
        }
      }
    } else {
      wars.hidden = true;
    }
  }

  /** The little card that follows the cursor. */
  hover(tile: TileRef | null, clientX: number, clientY: number, unit?: UnitState) {
    const tip = el("tip");
    if (tile === null || !el("menu-ctx").hidden || radialOpen()) {
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
        `<b>${shieldSVG(owner.name, owner.color, 14, owner.arms)} ${esc(owner.name)}</b>` +
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

  /**
   * Right-click: a wheel of what can be done here. Marching is the middle;
   * around it are building, sailing, pacts, gifts and a closer look at
   * whoever holds the ground.
   */
  async context(tile: TileRef, clientX: number, clientY: number) {
    const state = this.session.state;
    const me = state.me;
    if (!me || state.inSpawnPhase) return;
    const actions = await this.session.actions(tile, [UnitType.TransportShip]);
    if (!actions) return;
    const owner = state.owner(tile);
    const other = owner && owner !== me ? owner : null;
    const it = other ? actions.interaction : undefined;
    const troops = me.troops * this.ratio;
    const send = fmtTroops(troops);
    const whom = owner ? owner.name : state.map.isLand(tile) ? "the wilds" : "open water";
    const go = (intent: Intent) => () => this.session.send(intent);

    const pact: Slice = it?.canBreakAlliance
      ? { icon: ICON.broken, label: "Break pact", tint: "attack", about: `Break faith with ${whom}. You will be named oathbreaker.`, act: go({ type: "breakAlliance", recipient: other!.id }) }
      : it?.canSendAllianceRequest
        ? { icon: ICON.pact, label: "Offer pact", tint: "pact", about: `Offer ${whom} a pact of peace.`, act: go({ type: "allianceRequest", recipient: other!.id }) }
        : other && me.outgoingAllianceRequests.includes(other.id)
          ? { icon: ICON.pact, label: "Pact offered", tint: "pact", about: `${whom} has not answered yet.`, disabled: true }
          : { icon: ICON.pact, label: "Pact", tint: "pact", about: other ? "No pact can be offered now." : "Pacts are sworn with other realms.", disabled: true };

    // Four slices, as on a compass: the realm above, the sea to the right,
    // pacts below, and to the left what to raise here (on your own ground)
    // or what to send against it (anywhere else). Marching is the middle.
    openRadial(clientX, clientY, {
      caption: owner ? owner.name : state.map.isLand(tile) ? "Unclaimed wilds" : "Open water",
      bare: true,
      centre: {
        icon: ICON.sword, label: "March", sub: actions.canAttack ? send : undefined, disabled: !actions.canAttack,
        about: actions.canAttack ? `Send ${send} levies against ${whom}.` : owner === me ? "This is your own land." : "Your border does not reach here.",
        act: go({ type: "attack", targetID: owner?.id ?? null, troops }),
      },
      slices: [
        {
          icon: ICON.scroll, label: "Realm", tint: "info", disabled: !owner,
          about: owner ? `What is known of ${owner.name}, and your dealings with them.` : "Nobody holds this.",
          act: () => void this.inform(tile, clientX, clientY),
        },
        {
          icon: ICON.ship, label: "Sail", tint: "sail", sub: owner !== me && canSail(actions.buildableUnits) ? send : undefined,
          disabled: owner === me || !canSail(actions.buildableUnits),
          about: owner === me ? "This is your own land." : canSail(actions.buildableUnits) ? `Land ${send} levies here by longship.` : "No longship of yours can reach here.",
          act: go({ type: "boat", troops, dst: tile }),
        },
        pact,
        owner === me
          ? {
              icon: ICON.hammer, label: "Build", tint: "build",
              about: "Raise a building on this spot.",
              children: () => this.buildSlices(tile, RAISED),
            }
          : {
              icon: ICON.flame, label: "Attack", tint: "attack",
              about: "Send war galleys or cast sorcery here.",
              children: () => this.buildSlices(tile, SENT),
            },
      ],
    });
    el("menu-ctx").hidden = true;
    el("tip").hidden = true;
  }

  /** A ring of things to build or send at a tile: each with its cost, greyed if it cannot go there. */
  private async buildSlices(tile: TileRef, types: UnitType[]): Promise<Slice[]> {
    const can = await this.session.buildables(tile);
    return types.map((type): Slice => {
      const lore = UNIT_LORE[type];
      const b = can.find((x) => x.type === type);
      const raise = b !== undefined && b.canUpgrade !== false;
      const able = b !== undefined && (raise || b.canBuild !== false);
      return {
        icon: lore.glyph, label: raise ? `Raise ${lore.name}` : lore.name,
        sub: b ? fmt(Number(b.cost)) : undefined, disabled: !able,
        about: able ? (raise ? "Raises the one already here by a level." : lore.blurb) : `${lore.name} cannot be placed here now.`,
        act: () =>
          this.session.send(
            raise
              ? { type: "upgrade_structure", unit: type, unitId: b!.canUpgrade as number }
              : { type: "build_unit", unit: type, tile },
          ),
      };
    });
  }

  /** The card on a realm: what it has, how you stand with it, and what you may do about it. */
  private async inform(tile: TileRef, clientX: number, clientY: number) {
    const state = this.session.state;
    const me = state.me;
    const owner = state.owner(tile);
    if (!me || !owner) return;
    const actions = owner === me ? undefined : await this.session.actions(tile, [UnitType.TransportShip]);
    const it = actions?.interaction;
    const menu = el("menu-ctx");
    const kind = owner === me ? "Your realm" : owner.type === PlayerType.Bot ? "Clan" : owner.type === PlayerType.Human ? "Rival lord" : "Kingdom";
    const share = ((owner.tilesOwned / state.map.numLandTiles()) * 100).toFixed(1);
    const sworn = owner !== me && me.allies.includes(owner.smallID);
    const left = it?.allianceInfo ? Math.max(0, Math.round((it.allianceInfo.expiresAt - state.tick) / 10)) : 0;
    const standing =
      owner === me ? ""
      : sworn ? `<div class="standing sworn">Sworn pact${left ? ` · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left` : ""}</div>`
      : me.outgoingAllianceRequests.includes(owner.id) ? `<div class="standing">Pact offered</div>`
      : `<div class="standing">Neutral</div>`;
    const byMe = owner !== me && me.embargoes.has(owner.id);
    const byThem = owner !== me && owner.embargoes.has(me.id);
    const rows: [string, string, string][] = [
      ["Land", `${share}% of the realm`, ""],
      ["Betrayals", String(owner.betrayals), owner.betrayals > 0 ? "bad" : ""],
    ];
    if (owner !== me) {
      rows.push([
        "Trading",
        byMe && byThem ? "Stopped on both sides" : byMe ? "Stopped by you" : byThem ? "Stopped by them" : "Open",
        byMe || byThem ? "warn" : "good",
      ]);
      if (me.targets.includes(owner.smallID)) rows.push(["Marked", "Named a common foe", "bad"]);
    }
    const friends = owner.allies.map((id) => state.players.get(id)).filter((p): p is PlayerState => !!p && p.isAlive);
    const items: { label: string; intent: Intent; tone?: string; wide?: boolean }[] = [];
    if (it) {
      if (it.canDonateTroops) items.push({ label: "Lend levies", intent: { type: "donate_troops", recipient: owner.id, troops: null } });
      if (it.canDonateGold) items.push({ label: "Send gold", intent: { type: "donate_gold", recipient: owner.id, gold: null } });
      if (it.canTarget) items.push({ label: "Name a common foe", intent: { type: "targetPlayer", target: owner.id } });
      items.push(
        it.canEmbargo
          ? { label: "Stop trading", tone: "warn", intent: { type: "embargo", targetID: owner.id, action: "start" } }
          : { label: "Reopen trade", intent: { type: "embargo", targetID: owner.id, action: "stop" } },
      );
      if (it.canSendAllianceRequest) items.push({ label: "Offer a pact", intent: { type: "allianceRequest", recipient: owner.id } });
      if (it.allianceInfo?.canExtend) items.push({ label: "Renew our pact", intent: { type: "allianceExtension", recipient: owner.id } });
      if (it.canBreakAlliance) items.push({ label: "Break our pact", tone: "bad", intent: { type: "breakAlliance", recipient: owner.id } });
    }
    menu.className = "panel card-realm";
    menu.innerHTML =
      `<div class="head">${shieldSVG(owner.name, owner.color, 38, owner.arms)}<div><b>${esc(owner.name)}</b></div>` +
      `<span class="chip">${kind}</span><button class="close" data-close aria-label="Close">✕</button></div>` +
      (owner.isTraitor ? `<div class="standing bad">Oathbreaker</div>` : "") + standing +
      `<div class="stats"><div><b>${fmt(owner.gold)}</b>Gold</div><div><b>${fmtTroops(owner.troops)}</b>Levies</div></div>` +
      `<dl class="facts">${rows.map(([k, v, tone]) => `<dt>${k}</dt><dd class="${tone}">${esc(v)}</dd>`).join("")}</dl>` +
      `<div class="pacts"><span>Pacts<i>${friends.length}</i></span><p>${friends.length ? friends.map((p) => esc(p.name)).join(", ") : "None"}</p></div>` +
      `<div class="deeds">` +
      items.map((x, n) => `<button class="${x.tone ?? ""}" data-i="${n}">${x.label}</button>`).join("") +
      `<button class="${items.length % 2 === 0 ? "wide2" : ""}" data-show>Show on the map</button></div>`;
    for (const b of Array.from(menu.querySelectorAll<HTMLButtonElement>("button"))) {
      b.onclick = () => {
        if (b.dataset.show !== undefined) this.onFocus(state.map.ref(Math.round(owner.nameX), Math.round(owner.nameY)));
        else if (b.dataset.close === undefined) this.session.send(items[Number(b.dataset.i)].intent);
        menu.hidden = true;
      };
    }
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(clientX - r.width / 2, window.innerWidth - r.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(clientY - 40, window.innerHeight - r.height - 8))}px`;
    el("tip").hidden = true;
  }
}

/** What the wheel offers to raise on your own land. */
const RAISED = [UnitType.City, UnitType.Factory, UnitType.Port, UnitType.MissileSilo, UnitType.SAMLauncher];
/** What it offers to send against anywhere else. */
const SENT = [UnitType.Warship, UnitType.AtomBomb, UnitType.HydrogenBomb, UnitType.MIRV];

export function canSail(units: BuildableUnit[]): boolean {
  return units.some((b) => b.type === UnitType.TransportShip && b.canBuild !== false);
}

export type { PlayerActions, PlayerState };
