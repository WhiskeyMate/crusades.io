// The store: sign in, buy Crowns, browse the catalogue with live previews,
// reserve a house name, design your arms, and choose what to wear.

import { adFree } from "../ui/Ads";
import { CHARGES, DIVISION_COUNT, DIVISION_NAMES, FREE_CHARGES, FREE_COLORS, FREE_DIVISIONS, freeSkin, hexToRGB, shieldSVG, Skin } from "../client/Heraldry";
import {
  BUNDLES, Bundle, defaultItem, Item, ITEMS, itemById, NAME_COST, PACKS, rarityOf, Slot, SLOT_NAMES,
} from "../store/Catalog";
import { liveTrailHTML, previewURL, startLiveTrails } from "../store/Preview";
import { account, accountsEnabled, Provider, SIGN_IN, STORE_OPEN } from "./Account";
import { BOMB_KEYS, Mode, MODES, overall, standing } from "./Record";
import { UnitType } from "@crusades/engine-api/game/GameTypes";
import { fmt, fmtTroops, UNIT_LORE } from "../client/Lexicon";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const SWATCHES = [
  "#c71a21", "#e0452f", "#d9632b", "#e08a1e", "#d9a521", "#c9c22b", "#7c9a2e", "#2f8a4a", "#1f8a86", "#2aa3c4",
  "#2c6fb3", "#3b46a8", "#6a3fa6", "#a8358f", "#d0498a", "#8a2f2f", "#5b4636", "#3f4a55", "#2b2b33", "#e9e4d4",
];
const METALS = ["#e8d9a0", "#f1efe6", "#d9a521", "#c0c4ca", "#1b1410", "#c71a21", "#2c6fb3", "#2f8a4a", "#6a3fa6"];
const INKS = ["#1b1410", "#f1efe6", "#e8d9a0", "#d9a521", "#c0c4ca", "#c71a21", "#2c6fb3", "#2f8a4a", "#6a3fa6", "#d9632b"];
const DEFAULT: Skin = { color: SWATCHES[0], division: 4, charge: 3 };

type Tab = "account" | "stats" | "custom" | "featured" | "crowns" | Slot | "name";
/** The tabs that belong to the account itself; the rest are the store's. */
const OWN_TABS: Tab[] = ["account", "stats", "custom"];
const ALL_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "account", label: "Account", icon: "♞" },
  { id: "stats", label: "Stats", icon: "≡" },
  { id: "custom", label: "Customisation", icon: "⛨" },
  { id: "featured", label: "Featured", icon: "✦" },
  { id: "troops", label: "Troops", icon: "⚔" },
  { id: "ships", label: "Ships", icon: "⚓" },
  { id: "buildings", label: "Buildings", icon: "♜" },
  { id: "trails", label: "Sea trails", icon: "≋" },
  { id: "territory", label: "Territory", icon: "▦" },
  { id: "banner", label: "Your arms", icon: "⛨" },
  { id: "name", label: "House name", icon: "✒" },
  { id: "crowns", label: "Get Crowns", icon: "♛" },
];

// With the store closed only the account's own tabs are shown.
const TABS = STORE_OPEN ? ALL_TABS : ALL_TABS.filter((t) => OWN_TABS.includes(t.id));

let tab: Tab = STORE_OPEN ? "featured" : "account";
/** Which kind of game the Stats tab is showing. */
let statsMode: "all" | Mode = "all";
let filter: "all" | "owned" | "New models" | "Jest" = "all";
let draft: Skin = { ...DEFAULT };
let note = "";

function say(text: string, bad = false) {
  note = text;
  const n = el("acct-note");
  n.textContent = text;
  n.hidden = text === "";
  n.classList.toggle("bad", bad);
}

/**
 * Asks before Crowns are spent. Resolves true only if the player presses the
 * spend button; Escape, Cancel or a click outside all mean no.
 */
function confirmSpend(what: string, cost: number, detail = ""): Promise<boolean> {
  const box = el("store-confirm");
  const left = (account.state?.crowns ?? 0) - cost;
  el("confirm-text").innerHTML =
    `<b>${esc(what)}</b>${detail ? `<p>${detail}</p>` : ""}` +
    `<p class="sum">Cost <span class="gold">${cost.toLocaleString("en-US")} ♛</span> · you will have <span class="gold">${left.toLocaleString("en-US")} ♛</span> left</p>`;
  el("confirm-yes").innerHTML = `Spend ${cost.toLocaleString("en-US")} ♛`;
  box.hidden = false;
  el("confirm-no").focus();
  return new Promise((resolve) => {
    const done = (answer: boolean) => {
      box.hidden = true;
      window.removeEventListener("keydown", key, true);
      resolve(answer);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      done(false);
    };
    window.addEventListener("keydown", key, true);
    el("confirm-yes").onclick = () => done(true);
    el("confirm-no").onclick = () => done(false);
    box.onclick = (e) => {
      if (e.target === box) done(false);
    };
  });
}

const crowns = (n: number) => `<span class="cr">${n.toLocaleString("en-US")} ♛</span>`;

/** The colour previews are drawn in: the player's chosen field, or crimson. */
const myColor = () => (account.skin ?? account.state?.skin ?? DEFAULT).color;

let trailCards = 0;

function picture(item: Item): string {
  if (item.slot === "trails") {
    // Trails move, so their cards do: a longship of the fleet you wear, sailing.
    const ships = itemById(account.state?.equipped.ships ?? "")?.variant ?? "default";
    return `<div class="shot trails">${liveTrailHTML(item.variant, myColor(), ships, trailCards++)}</div>`;
  }
  const url = previewURL(item, myColor(), item.id === "banner-custom" ? draft : null);
  return url
    ? `<div class="shot ${item.slot}"><img src="${url}" alt="" loading="lazy" /></div>`
    : `<div class="shot none"><span>${{ territory: "▦", banner: "⛨", ships: "⚓", buildings: "♜", troops: "⚔", trails: "≋" }[item.slot]}</span></div>`;
}

function card(item: Item): string {
  const s = account.state!;
  const owned = account.owns(item.id);
  const worn = (s.equipped[item.slot] ?? defaultItem(item.slot).id) === item.id;
  const rarity = rarityOf(item.crowns);
  const short = s.crowns < item.crowns;
  return (
    `<div class="card ${rarity}${worn ? " worn" : ""}${owned ? " owned" : ""}">` +
    picture(item) +
    (item.tag ? `<i class="kind ${item.tag === "Jest" ? "meme" : item.tag === "New models" ? "model" : ""}">${item.tag}</i>` : "") +
    `<div class="meta"><b>${esc(item.name)}</b><p>${esc(item.blurb)}</p>` +
    (worn
      ? `<span class="pill worn">Wearing</span>`
      : owned
        ? `<button data-equip="${item.id}" data-slot="${item.slot}">Wear</button>`
        : `<button class="primary${short ? " short" : ""}" data-buy="${item.id}" title="${short ? "Not enough Crowns" : ""}">${crowns(item.crowns)}</button>`) +
    `</div></div>`
  );
}

function bundleCard(b: Bundle): string {
  const s = account.state!;
  const items = b.items.map((i) => itemById(i)!).filter(Boolean);
  const ownedAll = items.every((i) => account.owns(i.id));
  const single = items.reduce((n, i) => n + i.crowns, 0);
  const hero = items.find((i) => i.slot !== "territory" && i.slot !== "banner") ?? items[0];
  return (
    `<div class="bundle ${rarityOf(b.crowns)}">${picture(hero)}` +
    `<div class="meta"><b>${esc(b.name)}</b><p>${esc(b.blurb)}</p>` +
    `<ul>${items.map((i) => `<li class="${account.owns(i.id) ? "have" : ""}">${esc(i.name)} <span>${SLOT_NAMES[i.slot]}</span></li>`).join("")}</ul>` +
    `<div class="row"><span class="save">Save ${Math.round((1 - b.crowns / single) * 100)}%</span>` +
    (ownedAll
      ? `<span class="pill owned">Owned</span>`
      : `<button class="primary${s.crowns < b.crowns ? " short" : ""}" data-bundle="${b.id}">${crowns(b.crowns)} <s>${single.toLocaleString("en-US")}</s></button>`) +
    `</div></div></div>`
  );
}

const PROVIDER_NAMES: Record<string, string> = { discord: "Discord", google: "Google", steam: "Steam", email: "an emailed link", preview: "preview mode" };

/** The Account tab: who is signed in, their standing and the way up to the next. */
function drawAccount(): string {
  const s = account.state!;
  const st = standing(s.record);
  const all = overall(s.record);
  const hours = all.seconds / 3600;
  const share = st.next ? Math.min(100, ((st.renown - st.from) / (st.to - st.from)) * 100) : 100;
  const stat = (big: string, label: string) => `<div class="stat"><b>${big}</b><span>${label}</span></div>`;
  return (
    `<div class="record">` +
    `<div class="rank"><div><span>Standing</span><b>${st.title}</b></div>` +
    `<div class="climb"><div class="bar"><i style="width:${share.toFixed(1)}%"></i></div>` +
    `<span>${st.renown.toLocaleString("en-US")} renown${st.next ? ` · ${(st.to - st.renown).toLocaleString("en-US")} more to ${st.next}` : " · the highest there is"}</span></div></div>` +
    `<div class="stats">` +
    stat(String(all.played), "Games played") +
    stat(String(all.wins), "Victories") +
    stat(`${all.bestLand.toFixed(1)}%`, "Most land held") +
    stat(hours >= 10 ? Math.round(hours).toString() : hours.toFixed(1), "Hours on campaign") +
    `</div>` +
    `<div class="handle"><label>Account name <span class="dim">(who you are on the site and on a clan's roll; apart from your house name)</span>` +
    `<span class="inline"><input id="acct-handle" maxlength="20" placeholder="Choose a name" value="${esc(s.handle ?? "")}" /><button id="acct-handle-save" class="primary">${s.handle ? "Change" : "Save"}</button></span></label>` +
    `<p class="dim small">${s.handle ? "It can be changed once in thirty days." : "Needed to found or join a clan. Your house name in games stays whatever you type on the front page."}</p></div>` +
    `<p class="dim small">Signed in as ${esc(s.handle ?? s.name)} through ${PROVIDER_NAMES[s.provider] ?? esc(s.provider)}${s.email ? ` (${esc(s.email)})` : ""}. ` +
    `Your record is kept with your account and follows you to any device. Renown comes from playing: most from games against other lords, more for winning them. Sandbox games do not count.</p>` +
    `<div><button data-go="stats">See all your stats</button> <button data-go="custom">Customisation</button></div>` +
    `</div>`
  );
}

/**
 * The Stats tab, kept as a chronicle rather than a dashboard: a seal with the
 * share of games won, then a ledger in chapters (holdings, the sea, the
 * field, sorcery, the treasury). Each line gives the total and, in small, the
 * average for a game. For all games or one kind of them.
 */
function drawStats(): string {
  const rec = account.state!.record;
  const r = statsMode === "all" ? overall(rec) : rec[statsMode];
  const t = r.totals;
  const u = (k: string, n: number) => t.units[k]?.[n] ?? 0;
  const b = (k: string, n: number) => t.boats[k]?.[n] ?? 0;
  const m = (k: string, n: number) => t.bombs[k]?.[n] ?? 0;
  const g = (n: number) => t.gold[n] ?? 0;
  const a = (n: number) => t.attacks[n] ?? 0;
  const name = (type: UnitType) => UNIT_LORE[type].name;
  const each = (n: number, show: (x: number) => string) => {
    if (r.played === 0) return "";
    const x = n / r.played;
    return `<i>${x >= 100 ? show(x) : x >= 10 ? x.toFixed(0) : x.toFixed(1)} a game</i>`;
  };
  /** One line of the ledger: what, how many in all, and how many a game. */
  const line = (label: string, n: number, show: (x: number) => string = fmt) =>
    `<li><span>${label}</span><u></u><b>${n < 1000 && show === fmt ? n : show(n)}</b>${each(n, show)}</li>`;
  const chapter = (title: string, sub: string, body: string, cls = "") =>
    `<section class="chapter ${cls}"><header><h3>${title}</h3><span>${sub}</span></header>${body}</section>`;

  const modes = (["all", ...MODES] as const)
    .map((k) => `<button class="${statsMode === k ? "on" : ""}" data-stats="${k}">${{ all: "All games", public: "Public", private: "Private", solo: "Solo" }[k]}</button>`)
    .join("");

  // The seal: a ring filled as far as the share of games won.
  const rate = r.played > 0 ? r.wins / r.played : 0;
  const round = 2 * Math.PI * 34;
  const seal =
    `<svg class="seal" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="34" class="ring"/>` +
    `<circle cx="42" cy="42" r="34" class="won" stroke-dasharray="${(round * rate).toFixed(1)} ${round.toFixed(1)}" transform="rotate(-90 42 42)"/>` +
    `<text x="42" y="40" class="pc">${Math.round(rate * 100)}%</text><text x="42" y="54" class="cap">won</text></svg>`;
  const hours = r.seconds / 3600;

  const kinds = ([["city", UnitType.City], ["port", UnitType.Port], ["fact", UnitType.Factory], ["defp", UnitType.DefensePost], ["silo", UnitType.MissileSilo], ["saml", UnitType.SAMLauncher]] as const);
  const holdings =
    `<table class="roll"><thead><tr><th></th><th>Raised</th><th>Razed</th><th>Taken</th><th>Lost</th></tr></thead><tbody>` +
    kinds.map(([k, type]) => `<tr><td>${name(type)}</td><td>${fmt(u(k, 0))}</td><td>${fmt(u(k, 1))}</td><td>${fmt(u(k, 2))}</td><td>${fmt(u(k, 3))}</td></tr>`).join("") +
    `</tbody></table>`;

  const spells = ([["abomb", UnitType.AtomBomb], ["hbomb", UnitType.HydrogenBomb], ["mirv", UnitType.MIRV]] as const);
  const sorcery =
    `<table class="roll"><thead><tr><th></th><th>Cast</th><th>Struck</th><th>Shot down</th></tr></thead><tbody>` +
    spells.map(([k, type]) => `<tr><td>${name(type)}</td><td>${fmt(m(k, 0))}</td><td>${fmt(m(k, 1))}</td><td>${fmt(m(k, 2))}</td></tr>`).join("") +
    `<tr><td>Falling stars</td><td>${fmt(m("mirvw", 0))}</td><td>${fmt(m("mirvw", 1))}</td><td>${fmt(m("mirvw", 2))}</td></tr>` +
    `</tbody></table>`;

  // The treasury: each source of gold as a bar, as long as its share of the whole.
  const sources: [string, number][] = [
    ["Trade by sea", g(2)], ["Piracy", g(3)], ["Spoils of conquest", g(1)], ["Your roads", g(4)], ["Others' roads", g(5)], ["Your subjects", g(0)],
  ];
  const most = Math.max(1, ...sources.map(([, n]) => n));
  const earned = sources.reduce((n, [, x]) => n + x, 0);
  const treasury =
    `<ul class="bars">` +
    sources.map(([label, n]) => `<li><span>${label}</span><div><i style="width:${((n / most) * 100).toFixed(1)}%"></i></div><b>${fmt(n)}</b></li>`).join("") +
    `</ul><p class="foot">${fmt(earned)} gold in all${r.played > 0 ? ` · ${fmt(earned / r.played)} a game` : ""}</p>`;

  return (
    `<div class="chronicle">` +
    `<nav class="kinds">${modes}</nav>` +
    `<div class="summary">${seal}` +
    `<dl><div><dt>Played</dt><dd>${r.played}</dd></div><div><dt>Won</dt><dd class="good">${r.wins}</dd></div><div><dt>Lost</dt><dd class="bad">${r.played - r.wins}</dd></div>` +
    `<div><dt>Most land held</dt><dd>${r.bestLand.toFixed(1)}%</dd></div><div><dt>Hours on campaign</dt><dd>${hours >= 10 ? Math.round(hours) : hours.toFixed(1)}</dd></div></dl></div>` +
    (r.played === 0 ? `<p class="dim">Nothing is written here yet. Finish a game of this kind while signed in and it will be entered.</p>` : "") +
    `<div class="chapters">` +
    chapter("Holdings", "what you raised, and what became of it", holdings, "span") +
    chapter("In the field", "levies and conquests",
      `<ul class="ledger">` + line("Levies sent to war", a(0), fmtTroops) + line("Levies that came against you", a(1), fmtTroops) + line("Levies called back", a(2), fmtTroops) +
      line("Tribes conquered", t.conquests[2] ?? 0) + line("Kingdoms conquered", t.conquests[1] ?? 0) + line("Lords conquered", t.conquests[0] ?? 0) + line("Pacts broken", t.betrayals) + `</ul>`) +
    chapter("The sea", "longships, cogs and war galleys",
      `<ul class="ledger">` + line("Longships sent", b("trans", 0)) + line("Longships landed", b("trans", 1)) + line("Cogs sent to trade", b("trade", 0)) + line("Cogs come to harbour", b("trade", 1)) +
      line("Cogs taken as prizes", b("trade", 2)) + line(`${name(UnitType.Warship)}s built`, u("wshp", 0)) + line("Ships sunk by your galleys", u("wshp", 1)) + line(`${name(UnitType.Warship)}s lost`, u("wshp", 3)) + `</ul>`) +
    chapter("Sorcery", "what you cast, and what got through", sorcery) +
    chapter("The treasury", "where your gold came from", treasury) +
    `</div></div>`
  );
}

/**
 * The Customisation tab: what you own, slot by slot, and which of it you
 * wear. Apart from the store, so it is there whether the store is open or not.
 */
function drawCustom(): string {
  const slots = (Object.keys(SLOT_NAMES) as Slot[]).filter((slot) => slot !== "banner");
  let bought = 0;
  const blocks = slots
    .map((slot) => {
      const mine = ITEMS.filter((i) => i.slot === slot && account.owns(i.id));
      bought += mine.filter((i) => i.crowns > 0).length;
      return `<h3>${SLOT_NAMES[slot]}</h3><div class="cards dense">${mine.map(card).join("")}</div>`;
    })
    .join("");
  return (
    `<p class="sub">Choose what your realm wears in games. Everything here is yours already.</p>` +
    (bought === 0
      ? `<p class="dim small">You have the kit every house starts with. ${STORE_OPEN ? "The store has more." : "More will be on offer when the store opens."}</p>`
      : "") +
    blocks +
    (account.mayCustomiseArms() ? drawArms() : drawPlainArms())
  );
}

function loadout(): string {
  const s = account.state!;
  return (
    `<div class="loadout"><span>Wearing</span>` +
    (Object.keys(SLOT_NAMES) as Slot[])
      .filter((slot) => slot !== "banner")
      .map((slot) => {
        const item = itemById(s.equipped[slot] ?? "") ?? defaultItem(slot);
        return `<button class="lo" data-go="${slot}" title="${SLOT_NAMES[slot]}: ${esc(item.name)}"><i>${SLOT_NAMES[slot]}</i>${esc(item.name)}</button>`;
      })
      .join("") +
    `</div>`
  );
}

function drawSlot(slot: Slot): string {
  let list = ITEMS.filter((i) => i.slot === slot);
  if (filter === "owned") list = list.filter((i) => account.owns(i.id));
  else if (filter !== "all") list = list.filter((i) => i.tag === filter);
  else list = list.filter((i) => !i.unlisted || i.crowns === 0);
  list = [...list].sort((a, b) => a.crowns - b.crowns);
  const chips = (["all", "owned", "New models", "Jest"] as const)
    .filter((f) => f === "all" || f === "owned" || ITEMS.some((i) => i.slot === slot && i.tag === f))
    .map((f) => `<button class="chip${filter === f ? " on" : ""}" data-filter="${f}">${f === "all" ? "All" : f === "owned" ? "Owned" : f}</button>`)
    .join("");
  return (
    `<div class="chips">${chips}<span class="count">${list.length} item${list.length === 1 ? "" : "s"}</span></div>` +
    (list.length ? `<div class="cards${slot === "territory" || slot === "trails" ? " dense" : ""}">${list.map(card).join("")}</div>` : `<p class="dim">Nothing here yet.</p>`) +
    (slot === "banner" ? drawArms() : "")
  );
}

function drawFeatured(): string {
  const picks = ["troops-snail", "ships-turtle", "build-toadstool", "troops-goose", "ships-swan", "build-necropolis", "troops-rabbit", "ships-serpent"]
    .map((id) => itemById(id)!)
    .filter(Boolean);
  return (
    `<h3>Bundles</h3><div class="bundles">${BUNDLES.map(bundleCard).join("")}</div>` +
    `<h3>Featured</h3><div class="cards">${picks.map(card).join("")}</div>`
  );
}

function drawPacks(): string {
  return (
    `<p class="sub">Crowns buy everything in the store. Card, Google Pay and Apple Pay are offered on the payment page.</p>` +
    `<div class="packs">` +
    PACKS.map(
      (p) =>
        `<div class="pack tier${p.tier}">${p.bonus ? `<i class="ribbon">+${p.bonus.toLocaleString("en-US")} bonus</i>` : ""}` +
        `<b>${p.name}</b><div class="crown-art">♛</div><div class="amount">${(p.crowns + p.bonus).toLocaleString("en-US")}</div>` +
        `<div class="sub">Crowns</div><div class="price">${p.price}</div>` +
        `<button class="primary" data-pack="${p.id}">Buy</button></div>`,
    ).join("") +
    `</div>`
  );
}

/** Whether the editor on the page is the plain, free one. */
let armsPlain = false;
const PLAIN: Skin = { color: FREE_COLORS[0], division: 4, charge: 12 };

/** The plain banner's editor: muted fields, a few divisions, a few charges. */
function drawPlainArms(): string {
  armsPlain = true;
  if (!freeSkin(draft)) draft = freeSkin(account.state?.skin) ? { ...account.state!.skin! } : { ...PLAIN };
  return (
    `<h3>Your banner</h3>` +
    `<p class="dim small">Every signed-in house may fly a plain banner of its own.${STORE_OPEN ? " Any colour, every division and charge come with “Your own arms” in the store." : ""}</p>` +
    `<div id="acct-editor"><div class="arms-left"><div id="acct-preview"></div>` +
    `<button id="acct-random">⚄ Surprise me</button>` +
    `<button id="acct-save" class="primary">Save my banner</button></div>` +
    `<div class="controls">` +
    `<div class="field-label">Field</div><div id="acct-colors" class="row-wrap"></div>` +
    `<div class="field-label">Division</div><div id="acct-divisions" class="row-wrap"></div>` +
    `<div class="field-label">Charge</div><div id="acct-charges" class="row-wrap charges"></div>` +
    `</div></div>`
  );
}

function wirePlainArms() {
  const preview = () => (el("acct-preview").innerHTML = shieldSVG("preview", hexToRGB(draft.color), 150, draft));
  preview();
  el("acct-colors").innerHTML = FREE_COLORS.map((c) => `<button class="swatch${c === draft.color ? " on" : ""}" data-c="${c}" style="background:${c}"></button>`).join("");
  el("acct-divisions").innerHTML = FREE_DIVISIONS.map(
    (i) => `<button class="pick${i === draft.division ? " on" : ""}" data-d="${i}" title="${DIVISION_NAMES[i]}">${shieldSVG("preview", hexToRGB(draft.color), 30, { ...draft, division: i, charge: 12 })}</button>`,
  ).join("");
  el("acct-charges").innerHTML = FREE_CHARGES.map(
    (i) => `<button class="pick glyph${i === draft.charge ? " on" : ""}" data-g="${i}">${CHARGES[i] ? CHARGES[i] + "︎" : "∅"}</button>`,
  ).join("");
  for (const b of Array.from(el("acct-editor").querySelectorAll<HTMLButtonElement>(".controls button"))) {
    b.onclick = () => {
      if (b.dataset.c) draft.color = b.dataset.c;
      if (b.dataset.d) draft.division = Number(b.dataset.d);
      if (b.dataset.g) draft.charge = Number(b.dataset.g);
      wirePlainArms();
    };
  }
  el("acct-random").onclick = () => {
    const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
    draft = { color: pick(FREE_COLORS), division: pick(FREE_DIVISIONS), charge: pick(FREE_CHARGES) };
    wirePlainArms();
  };
  el("acct-save").onclick = async () => {
    const err = await account.saveSkin({ color: draft.color, division: draft.division, charge: draft.charge });
    say(err ?? "Saved. Your next game flies this banner.", Boolean(err));
    if (!err) draw();
  };
}

function drawArms(): string {
  armsPlain = false;
  const locked = !account.mayCustomiseArms();
  return (
    `<h3>Design your arms</h3>` +
    (locked ? `<p class="dim small">Buy “Your own arms” above to save a design. You can try the editor first.</p>` : "") +
    `<div id="acct-editor"><div class="arms-left"><div id="acct-preview"></div>` +
    `<button id="acct-random">⚄ Surprise me</button>` +
    `<button id="acct-save" class="primary" ${locked ? "disabled" : ""}>Save my arms</button></div>` +
    `<div class="controls">` +
    `<div class="field-label">Field</div><div id="acct-colors" class="row-wrap"></div>` +
    `<div class="field-label">Second tincture</div><div id="acct-metals" class="row-wrap"></div>` +
    `<div class="field-label">Charge colour</div><div id="acct-inks" class="row-wrap"></div>` +
    `<div class="field-label">Division</div><div id="acct-divisions" class="row-wrap"></div>` +
    `<div class="field-label">Charge</div><div id="acct-charges" class="row-wrap charges"></div>` +
    `</div></div>`
  );
}

function wireArms() {
  if (!document.getElementById("acct-editor")) return;
  if (armsPlain) return wirePlainArms();
  const preview = () => (el("acct-preview").innerHTML = shieldSVG("preview", hexToRGB(draft.color), 150, draft));
  preview();
  el("acct-colors").innerHTML =
    SWATCHES.map((c) => `<button class="swatch${c === draft.color ? " on" : ""}" data-c="${c}" style="background:${c}"></button>`).join("") +
    `<input type="color" id="acct-custom" value="${draft.color}" title="Any colour" />`;
  const second = draft.second ?? METALS[0];
  el("acct-metals").innerHTML =
    METALS.map((c) => `<button class="swatch${c === second ? " on" : ""}" data-m="${c}" style="background:${c}"></button>`).join("") +
    `<input type="color" id="acct-custom2" value="${second}" title="Any colour" />`;
  el("acct-inks").innerHTML =
    `<button class="pick auto${draft.ink ? "" : " on"}" data-k="auto" title="Let the herald choose">Auto</button>` +
    INKS.map((c) => `<button class="swatch${c === draft.ink ? " on" : ""}" data-k="${c}" style="background:${c}"></button>`).join("") +
    `<input type="color" id="acct-custom3" value="${draft.ink ?? INKS[0]}" title="Any colour" />`;
  el("acct-divisions").innerHTML = Array.from({ length: DIVISION_COUNT }, (_, i) =>
    `<button class="pick${i === draft.division ? " on" : ""}" data-d="${i}" title="${DIVISION_NAMES[i]}">${shieldSVG("preview", hexToRGB(draft.color), 30, { ...draft, division: i, charge: 12 })}</button>`,
  ).join("");
  el("acct-charges").innerHTML = CHARGES.map(
    (c, i) => `<button class="pick glyph${i === draft.charge ? " on" : ""}" data-g="${i}">${c ? c + "︎" : "∅"}</button>`,
  ).join("");
  for (const b of Array.from(el("acct-editor").querySelectorAll<HTMLButtonElement>(".controls button"))) {
    b.onclick = () => {
      if (b.dataset.c) draft.color = b.dataset.c;
      if (b.dataset.m) draft.second = b.dataset.m;
      if (b.dataset.k) draft.ink = b.dataset.k === "auto" ? undefined : b.dataset.k;
      if (b.dataset.d) draft.division = Number(b.dataset.d);
      if (b.dataset.g) draft.charge = Number(b.dataset.g);
      wireArms();
    };
  }
  const c1 = el<HTMLInputElement>("acct-custom");
  c1.oninput = () => { draft.color = c1.value; preview(); };
  c1.onchange = wireArms;
  const c2 = el<HTMLInputElement>("acct-custom2");
  c2.oninput = () => { draft.second = c2.value; preview(); };
  c2.onchange = wireArms;
  const c3 = el<HTMLInputElement>("acct-custom3");
  c3.oninput = () => { draft.ink = c3.value; preview(); };
  c3.onchange = wireArms;
  el("acct-random").onclick = () => {
    const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
    draft = { color: pick(SWATCHES), second: pick(METALS), ink: Math.random() < 0.5 ? pick(INKS) : undefined, division: (Math.random() * DIVISION_COUNT) | 0, charge: (Math.random() * CHARGES.length) | 0 };
    wireArms();
  };
  el("acct-save").onclick = async () => {
    const err = await account.saveSkin({ ...draft });
    say(err ?? "Saved. Your next game flies these arms.", Boolean(err));
    if (!err) draw();
  };
}

function drawName(): string {
  const s = account.state!;
  return (
    `<div class="namebox"><p class="sub">A reserved house name is yours alone: nobody else can play under it, on any server.</p>` +
    (s.username ? `<p>Your house: <b class="gold">${esc(s.username)}</b></p>` : "") +
    `<label>House name<input id="acct-name" maxlength="24" placeholder="House Lionhart" value="${esc(s.username ?? "")}" /></label>` +
    `<button id="acct-reserve" class="primary wide">${s.username ? "Change it" : "Reserve it"} for ${NAME_COST} ♛</button>` +
    (s.username ? `<p class="dim small">Keeping ${esc(s.username)} costs nothing. You only pay to change it.</p>` : "") +
    `</div>`
  );
}

/** What the button on the landing page says. */
function openLabel(): string {
  const s = account.state;
  if (!s) return "Sign in";
  const shield = shieldSVG("preview", hexToRGB((account.skin ?? DEFAULT).color), 16, account.skin ?? DEFAULT);
  return `${shield} ${esc(s.handle ?? s.username ?? s.name)} · ${STORE_OPEN ? `${s.crowns.toLocaleString("en-US")} ♛` : standing(s.record).title}`;
}

const PROVIDER_BUTTONS: Record<Exclude<Provider, "email">, string> = {
  discord: "Continue with Discord",
  google: "Continue with Google",
  steam: "Continue with Steam",
};

/** The ways of signing in, as buttons above the emailed link. */
function drawSignIn() {
  const others = SIGN_IN.filter((p): p is Exclude<Provider, "email"> => p !== "email");
  const box = el("acct-providers");
  box.hidden = others.length === 0;
  box.innerHTML = others.map((p) => `<button class="wide provider ${p}" data-provider="${p}">${PROVIDER_BUTTONS[p]}</button>`).join("");
  for (const b of Array.from(box.querySelectorAll<HTMLButtonElement>("button"))) {
    b.onclick = async () => {
      say("Taking you there…");
      const err = await account.signInWith(b.dataset.provider as Exclude<Provider, "email">);
      if (err) say(err, true);
    };
  }
  const email = SIGN_IN.includes("email");
  el("acct-form").hidden = !email;
  el("acct-or").hidden = !email || others.length === 0;
  el("acct-email-note").hidden = !email;
  el("acct-pitch").textContent = STORE_OPEN
    ? "The game is free. An account keeps your record, your Crowns, your house name and what you wear."
    : "The game is free, and you can play without an account. Sign in and your record is kept: games, victories and your standing, on any device.";
}

function draw() {
  const s = account.state;
  const open = el("account-open");
  open.hidden = !accountsEnabled;
  open.innerHTML = openLabel();
  el("acct-title").textContent = STORE_OPEN ? "Store" : "Account";
  el("acct-crowns").hidden = !STORE_OPEN;
  el("acct-out").hidden = s !== null;
  el("acct-in").hidden = s === null;
  el("account").querySelector(".store")!.classList.toggle("signed-out", s === null);
  if (!s) return;
  el("acct-email").textContent = s.handle ?? s.username ?? s.name;
  el("acct-crowns").innerHTML = `${s.crowns.toLocaleString("en-US")} ♛`;
  el("store-nav").innerHTML = TABS.map(
    (t) => `<button class="${t.id === tab ? "on" : ""}${t.id === "crowns" ? " get" : ""}" data-tab="${t.id}"><i>${t.icon}</i>${t.label}</button>`,
  ).join("");
  for (const b of Array.from(el("store-nav").querySelectorAll<HTMLButtonElement>("button"))) {
    b.onclick = () => {
      tab = b.dataset.tab as Tab;
      filter = "all";
      draw();
      el("store-body").scrollTop = 0;
    };
  }
  const body = el("store-body");
  const keep = body.scrollTop;
  body.innerHTML =
    (OWN_TABS.includes(tab) ? "" : loadout()) +
    (tab === "account" ? drawAccount()
      : tab === "stats" ? drawStats()
      : tab === "custom" ? drawCustom()
      : tab === "featured" ? drawFeatured()
      : tab === "crowns" ? drawPacks()
      : tab === "name" ? drawName()
      : drawSlot(tab));
  body.scrollTop = keep;

  const on = (sel: string, fn: (b: HTMLButtonElement) => void) => {
    for (const b of Array.from(body.querySelectorAll<HTMLButtonElement>(sel))) b.onclick = () => fn(b);
  };
  on("button[data-go]", (b) => { tab = b.dataset.go as Tab; filter = "all"; draw(); });
  on("button[data-filter]", (b) => { filter = b.dataset.filter as typeof filter; draw(); });
  on("#acct-handle-save", async () => {
    const err = await account.setHandle(el<HTMLInputElement>("acct-handle").value);
    say(err ?? "Your account name is set.", Boolean(err));
    if (!err) draw();
  });
  on("button[data-stats]", (b) => { statsMode = b.dataset.stats as typeof statsMode; draw(); });
  on("button[data-pack]", async (b) => {
    say("Taking you to the payment page…");
    const err = await account.buyPack(b.dataset.pack!);
    if (err) say(err, true);
  });
  on("button[data-buy]", async (b) => {
    const item = itemById(b.dataset.buy!)!;
    if (account.state!.crowns < item.crowns) {
      say(`${item.name} costs ${item.crowns} ♛ and you have ${account.state!.crowns}.`, true);
      tab = "crowns";
      return draw();
    }
    if (account.owns(item.id)) return say(`You already own ${item.name}.`, true);
    if (!(await confirmSpend(`Buy ${item.name}?`, item.crowns, `${SLOT_NAMES[item.slot]}. ${esc(item.blurb)}`))) return;
    const err = await account.buyItem(item.id);
    if (!err) await account.equip(item.slot, item.id);
    say(err ?? `${item.name} is yours, and you're wearing it.`, Boolean(err));
    draw();
  });
  on("button[data-bundle]", async (b) => {
    const bundle = BUNDLES.find((x) => x.id === b.dataset.bundle)!;
    if (account.state!.crowns < bundle.crowns) {
      say(`${bundle.name} costs ${bundle.crowns} ♛ and you have ${account.state!.crowns}.`, true);
      tab = "crowns";
      return draw();
    }
    const missing = bundle.items.map((i) => itemById(i)!).filter((i) => !account.owns(i.id));
    if (missing.length === 0) return say(`You already own everything in ${bundle.name}.`, true);
    const have = bundle.items.length - missing.length;
    if (!(await confirmSpend(
      `Buy ${bundle.name}?`, bundle.crowns,
      `You get: ${missing.map((i) => esc(i.name)).join(", ")}.` +
        (have > 0 ? ` <span class="warn">You already own ${have} of the ${bundle.items.length} items in it; the price is the same.</span>` : ""),
    ))) return;
    const err = await account.buyBundle(bundle.id);
    if (!err) for (const id of bundle.items) await account.equip(itemById(id)!.slot, id);
    say(err ?? `${bundle.name} is yours, and you're wearing it.`, Boolean(err));
    draw();
  });
  on("button[data-equip]", async (b) => {
    const err = await account.equip(b.dataset.slot as Slot, b.dataset.equip!);
    say(err ?? "Worn. It shows in your next game.", Boolean(err));
    draw();
  });
  const reserve = document.getElementById("acct-reserve");
  if (reserve) {
    reserve.onclick = async () => {
      const name = el<HTMLInputElement>("acct-name").value.trim();
      if (name.length < 3) return say("Three letters at least.", true);
      const mine = account.state!.username;
      if (mine === name) return say(`${name} is already your house name. Nothing to pay.`, true);
      if (account.state!.crowns < NAME_COST) {
        say(`A house name costs ${NAME_COST} ♛ and you have ${account.state!.crowns}.`, true);
        tab = "crowns";
        return draw();
      }
      if (!(await confirmSpend(
        mine ? `Change your house name to ${name}?` : `Reserve the house name ${name}?`, NAME_COST,
        mine ? `You will give up ${esc(mine)}, and anyone may then take it.` : "Nobody else will be able to play under it.",
      ))) return;
      const err = await account.reserveName(name);
      say(err ? `${err.charAt(0).toUpperCase()}${err.slice(1)}. No Crowns were spent.` : `${name} is yours.`, Boolean(err));
      draw();
      if (!err) el<HTMLInputElement>("opt-name").value = name;
    };
  }
  wireArms();
  startLiveTrails();
  if (note) el("acct-note").textContent = note;
}

/** Opens the store, on whichever tab is current. */
function show(message = "", bad = false) {
  draft = { ...(account.state?.skin ?? DEFAULT) };
  say(message, bad);
  draw();
  el("account").hidden = false;
}

/**
 * The offer on the screen that ends a game: three things from the store, and
 * the news that buying anything at all takes the advertisements away. Shown
 * only while the store is open, to those who have not yet bought.
 */
export function drawEndOffer() {
  const box = el("end-offer");
  box.hidden = !STORE_OPEN || !accountsEnabled || adFree();
  if (box.hidden) return;
  // One each of troops, ships and buildings: the models are what is worth showing.
  const picks = (["troops", "ships", "buildings"] as Slot[]).flatMap((slot) => {
    const pool = ITEMS.filter((i) => i.slot === slot && !i.unlisted && i.crowns > 0 && !account.owns(i.id));
    return pool.length > 0 ? [pool[Math.floor(Math.random() * pool.length)]] : [];
  });
  if (picks.length === 0) return void (box.hidden = true);
  box.innerHTML =
    `<b>Support crusades.io</b><p>Buy anything from the store and play without advertisements.</p><div class="end-cards">` +
    picks
      .map(
        (i) =>
          `<button class="card ${rarityOf(i.crowns)}" data-offer="${i.id}">${picture(i)}` +
          `<div class="meta"><b>${esc(i.name)}</b><span class="price">${i.crowns.toLocaleString("en-US")} ♛</span></div></button>`,
      )
      .join("") +
    `</div>`;
  for (const b of Array.from(box.querySelectorAll<HTMLButtonElement>("button[data-offer]"))) {
    b.onclick = async () => {
      const item = itemById(b.dataset.offer!)!;
      const s = account.state;
      tab = item.slot;
      filter = "all";
      if (!s) return show(`Sign in to buy ${item.name}.`);
      if (s.crowns < item.crowns) {
        tab = "crowns";
        return show(`You need ${(item.crowns - s.crowns).toLocaleString("en-US")} more ♛ to buy ${item.name}.`, true);
      }
      // The question is asked inside the store, so the store opens behind it.
      show();
      if (!(await confirmSpend(`Buy ${item.name}?`, item.crowns, `${SLOT_NAMES[item.slot]}. ${esc(item.blurb)}`))) return void (el("account").hidden = true);
      const err = await account.buyItem(item.id);
      if (err) return show(err, true);
      await account.equip(item.slot, item.id);
      show(`${item.name} is yours, and you are wearing it.`);
      box.innerHTML = `<b>${esc(item.name)} is yours.</b><p>Thank you. You now play without advertisements.</p>`;
    };
  }
}

export async function initAccountPanel() {
  if (!accountsEnabled) return;
  const dialog = el("account");
  // The bar's own tabs open the same window at the place they name.
  const at = (to: Tab) => () => {
    tab = to;
    filter = "all";
    show();
  };
  el("account-open").onclick = at("account");
  el("custom-open").hidden = false;
  el("custom-open").onclick = at("custom");
  el("store-open").hidden = !STORE_OPEN;
  el("store-open").onclick = at("featured");
  el("acct-close").onclick = () => (dialog.hidden = true);
  el<HTMLFormElement>("acct-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = el<HTMLInputElement>("acct-mail").value.trim();
    if (!email) return;
    say("Sending…");
    const err = await account.signIn(email);
    say(err ?? `A sign-in link is on its way to ${email}. Open it on this device.`, Boolean(err));
  };
  el("acct-signout").onclick = () => void account.signOut();
  account.onChange = () => {
    if (account.state?.skin && dialog.hidden) draft = { ...account.state.skin };
    if (!dialog.hidden || !account.state) draw();
    else {
      el("account-open").innerHTML = openLabel();
    }
  };
  drawSignIn();
  // Back from Steam with nothing to show for it.
  const failed = new URLSearchParams(location.search).get("signin");
  if (failed) {
    history.replaceState(null, "", location.pathname);
    dialog.hidden = false;
    say(
      failed === "steam-cancelled" ? "Steam sign-in was cancelled."
      : failed === "steam-off" ? "Signing in through Steam is not switched on."
      : "Steam sign-in did not work. Please try again.",
      true,
    );
  }
  await account.init();
  draw();
  // The reserved name is the house name, unless the player typed something else.
  if (account.state?.username) el<HTMLInputElement>("opt-name").value = account.state.username;

  // Back from Stripe: the webhook may land a moment after the redirect.
  const back = new URLSearchParams(location.search).get("checkout");
  if (back) {
    history.replaceState(null, "", location.pathname);
    tab = "featured";
    dialog.hidden = false;
    draw();
    if (back === "success") {
      say("Thank you. Confirming your payment…");
      const before = account.state?.crowns ?? 0;
      for (let i = 0; i < 8 && (account.state?.crowns ?? 0) === before; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        await account.refresh();
      }
      say((account.state?.crowns ?? 0) > before ? "Your Crowns have arrived." : "Payment received; the Crowns can take a minute to show. Reload shortly.");
      draw();
    } else {
      say("Checkout cancelled. Nothing was charged.");
    }
  }
}
