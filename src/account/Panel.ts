// The store: sign in, buy Crowns, browse the catalogue with live previews,
// reserve a house name, design your arms, and choose what to wear.

import { CHARGES, DIVISION_COUNT, DIVISION_NAMES, hexToRGB, shieldSVG, Skin } from "../client/Heraldry";
import {
  BUNDLES, Bundle, defaultItem, Item, ITEMS, itemById, NAME_COST, PACKS, rarityOf, Slot, SLOT_NAMES,
} from "../store/Catalog";
import { previewURL } from "../store/Preview";
import { account, accountsEnabled } from "./Account";

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

type Tab = "featured" | "crowns" | Slot | "name";
const TABS: { id: Tab; label: string; icon: string }[] = [
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

let tab: Tab = "featured";
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

const crowns = (n: number) => `<span class="cr">${n.toLocaleString("en-US")} ♛</span>`;

/** The colour previews are drawn in: the player's chosen field, or crimson. */
const myColor = () => (account.skin ?? account.state?.skin ?? DEFAULT).color;

function picture(item: Item): string {
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

function drawArms(): string {
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
    `<button id="acct-reserve" class="primary wide">${s.username ? "Change it" : "Reserve it"} for ${NAME_COST} ♛</button></div>`
  );
}

function draw() {
  const s = account.state;
  const open = el("account-open");
  open.hidden = !accountsEnabled;
  open.innerHTML = s
    ? `${shieldSVG("preview", hexToRGB((account.skin ?? DEFAULT).color), 16, account.skin ?? DEFAULT)} ${s.crowns.toLocaleString("en-US")} ♛ · Store`
    : "Sign in · Store";
  el("acct-out").hidden = s !== null;
  el("acct-in").hidden = s === null;
  el("account").querySelector(".store")!.classList.toggle("signed-out", s === null);
  if (!s) return;
  el("acct-email").textContent = s.username ?? s.email;
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
    loadout() +
    (tab === "featured" ? drawFeatured()
      : tab === "crowns" ? drawPacks()
      : tab === "name" ? drawName()
      : drawSlot(tab));
  body.scrollTop = keep;

  const on = (sel: string, fn: (b: HTMLButtonElement) => void) => {
    for (const b of Array.from(body.querySelectorAll<HTMLButtonElement>(sel))) b.onclick = () => fn(b);
  };
  on("button[data-go]", (b) => { tab = b.dataset.go as Tab; filter = "all"; draw(); });
  on("button[data-filter]", (b) => { filter = b.dataset.filter as typeof filter; draw(); });
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
      const err = await account.reserveName(name);
      say(err ?? `${name} is yours.`, Boolean(err));
      draw();
      if (!err) el<HTMLInputElement>("opt-name").value = name;
    };
  }
  wireArms();
  if (note) el("acct-note").textContent = note;
}

export async function initAccountPanel() {
  if (!accountsEnabled) return;
  const dialog = el("account");
  el("account-open").onclick = () => {
    draft = { ...(account.state?.skin ?? DEFAULT) };
    say("");
    draw();
    dialog.hidden = false;
  };
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
      const s = account.state;
      el("account-open").innerHTML = `${shieldSVG("preview", hexToRGB((account.skin ?? DEFAULT).color), 16, account.skin ?? DEFAULT)} ${s.crowns.toLocaleString("en-US")} ♛ · Store`;
    }
  };
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
