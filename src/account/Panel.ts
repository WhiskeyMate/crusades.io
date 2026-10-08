// The store and account dialog: sign in, buy Crowns, spend them on the
// catalogue, reserve a house name, design your arms, and choose what to wear.

import { CHARGES, DIVISION_COUNT, hexToRGB, shieldSVG, Skin } from "../client/Heraldry";
import { BUNDLES, Item, ITEMS, NAME_COST, PACKS, Slot, SLOT_NAMES, defaultItem } from "../store/Catalog";
import { account, accountsEnabled } from "./Account";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const SWATCHES = [
  "#c71a21", "#d9632b", "#d9a521", "#7c9a2e", "#2f8a4a", "#1f8a86",
  "#2c6fb3", "#3b46a8", "#6a3fa6", "#a8358f", "#5b4636", "#2b2b33",
];
const DEFAULT: Skin = { color: SWATCHES[0], division: 4, charge: 3 };

type Tab = "packs" | "bundles" | Slot | "name";
const TABS: { id: Tab; label: string }[] = [
  { id: "packs", label: "Crowns" },
  { id: "bundles", label: "Bundles" },
  { id: "territory", label: "Territory" },
  { id: "banner", label: "Banner" },
  { id: "ships", label: "Ships" },
  { id: "buildings", label: "Buildings" },
  { id: "troops", label: "Troops" },
  { id: "name", label: "House name" },
];

let tab: Tab = "packs";
let draft: Skin = { ...DEFAULT };
let note = "";

function say(text: string, bad = false) {
  note = text;
  const n = el("acct-note");
  n.textContent = text;
  n.hidden = text === "";
  n.classList.toggle("bad", bad);
}

const crownsText = (n: number) => `${n.toLocaleString("en-US")} ♛`;

/** A little picture for an item: the slot's glyph on a swatch that hints at the variant. */
function thumb(item: Item): string {
  const glyph = { territory: "▦", banner: "⛨", ships: "⛵", buildings: "🏰", troops: "⚔" }[item.slot];
  const tone: Record<string, string> = {
    plain: "#8a2f2f", stripes: "repeating-linear-gradient(0deg,#8a2f2f 0 6px,#e8d9a0 6px 12px)",
    checks: "repeating-conic-gradient(#8a2f2f 0 25%,#e8d9a0 0 50%) 0 0/16px 16px",
    chevrons: "repeating-linear-gradient(135deg,#8a2f2f 0 6px,#e8d9a0 6px 12px)",
    lozenges: "repeating-linear-gradient(45deg,#8a2f2f 0 6px,#e8d9a0 6px 12px),repeating-linear-gradient(-45deg,transparent 0 6px,rgba(0,0,0,.25) 6px 12px)",
    custom: "linear-gradient(135deg,#c71a21,#2c6fb3)",
    default: "#6b4a2e", black: "#1b1816", gilt: "linear-gradient(135deg,#8a6a2a,#e8c860)",
    slate: "#5d6470", brick: "#9a4a36", mail: "#8a8f96", crusader: "#f1efe6",
  };
  return `<div class="thumb" style="background:${tone[item.variant] ?? "#6b4a2e"}"><span>${glyph}</span></div>`;
}

function drawTabs() {
  el("store-tabs").innerHTML = TABS.map(
    (t) => `<button class="${t.id === tab ? "on" : ""}" data-tab="${t.id}">${t.label}</button>`,
  ).join("");
  for (const b of Array.from(el("store-tabs").querySelectorAll<HTMLButtonElement>("button"))) {
    b.onclick = () => {
      tab = b.dataset.tab as Tab;
      draw();
    };
  }
}

function drawPacks(): string {
  return (
    `<p class="sub">Crowns buy everything in the store. Paid through Stripe; Google Pay and Apple Pay appear on the payment page where your device supports them.</p>` +
    `<div class="packs">` +
    PACKS.map(
      (p) =>
        `<div class="pack tier${p.tier}">${p.bonus ? `<i class="ribbon">+${p.bonus} bonus</i>` : ""}` +
        `<b>${p.name}</b><div class="crown-art">♛</div><div class="amount">${(p.crowns + p.bonus).toLocaleString("en-US")}</div>` +
        `<div class="sub">Crowns</div><div class="price">${p.price}</div>` +
        `<button class="primary" data-pack="${p.id}">Buy</button></div>`,
    ).join("") +
    `</div>`
  );
}

function drawBundles(): string {
  return (
    `<div class="bundles">` +
    BUNDLES.map((b) => {
      const owned = b.items.every((i) => account.owns(i));
      const single = b.items.reduce((n, i) => n + (ITEMS.find((x) => x.id === i)?.crowns ?? 0), 0);
      return (
        `<div class="bundle"><b>${esc(b.name)}</b><p>${esc(b.blurb)}</p>` +
        `<div class="items">${b.items.map((i) => { const it = ITEMS.find((x) => x.id === i)!; return `${thumb(it)}<span>${esc(it.name)}</span>`; }).join("")}</div>` +
        `<div class="row"><span class="price">${crownsText(b.crowns)} <s>${crownsText(single)}</s></span>` +
        (owned ? `<span class="tag owned">Owned</span>` : `<button class="primary" data-bundle="${b.id}">Buy bundle</button>`) +
        `</div></div>`
      );
    }).join("") +
    `</div>`
  );
}

function drawSlot(slot: Slot): string {
  const s = account.state!;
  const worn = s.equipped[slot] ?? defaultItem(slot).id;
  const list = ITEMS.filter((i) => i.slot === slot && (!i.unlisted || i.crowns === 0));
  let html = `<div class="items-grid">`;
  for (const item of list) {
    const owned = account.owns(item.id);
    const equipped = worn === item.id;
    html +=
      `<div class="item${equipped ? " worn" : ""}">${thumb(item)}<b>${esc(item.name)}</b><p>${esc(item.blurb)}</p>` +
      (equipped
        ? `<span class="tag worn">Wearing</span>`
        : owned
          ? `<button data-equip="${item.id}" data-slot="${slot}">Wear</button>`
          : `<button class="primary" data-buy="${item.id}">${crownsText(item.crowns)}</button>`) +
      `</div>`;
  }
  html += `</div>`;
  if (slot === "banner") html += drawArms();
  return html;
}

function drawArms(): string {
  const locked = !account.mayCustomiseArms();
  return (
    `<h3>Your arms</h3>` +
    (locked ? `<p class="dim small">Buy “Your own arms” to choose the field, division and charge your realm flies.</p>` : "") +
    `<div id="acct-editor" class="${locked ? "locked" : ""}"><div id="acct-preview"></div><div class="controls">` +
    `<div class="field-label">Field</div><div id="acct-colors" class="row-wrap"></div>` +
    `<div class="field-label">Division</div><div id="acct-divisions" class="row-wrap"></div>` +
    `<div class="field-label">Charge</div><div id="acct-charges" class="row-wrap"></div></div></div>` +
    `<button id="acct-save" class="primary wide" ${locked ? "disabled" : ""}>Save my arms</button>`
  );
}

function wireArms() {
  if (!document.getElementById("acct-editor")) return;
  const locked = !account.mayCustomiseArms();
  const preview = () => (el("acct-preview").innerHTML = shieldSVG("preview", hexToRGB(draft.color), 96, draft));
  preview();
  el("acct-colors").innerHTML =
    SWATCHES.map((c) => `<button class="swatch${c === draft.color ? " on" : ""}" data-c="${c}" style="background:${c}"></button>`).join("") +
    `<input type="color" id="acct-custom" value="${draft.color}" title="Any colour" ${locked ? "disabled" : ""} />`;
  el("acct-divisions").innerHTML = Array.from({ length: DIVISION_COUNT }, (_, i) =>
    `<button class="pick${i === draft.division ? " on" : ""}" data-d="${i}">${shieldSVG("preview", hexToRGB(draft.color), 26, { ...draft, division: i })}</button>`,
  ).join("");
  el("acct-charges").innerHTML = CHARGES.map(
    (c, i) => `<button class="pick glyph${i === draft.charge ? " on" : ""}" data-g="${i}">${c}</button>`,
  ).join("");
  for (const b of Array.from(el("acct-editor").querySelectorAll<HTMLButtonElement>("button"))) {
    b.disabled = locked;
    b.onclick = () => {
      if (b.dataset.c) draft.color = b.dataset.c;
      if (b.dataset.d) draft.division = Number(b.dataset.d);
      if (b.dataset.g) draft.charge = Number(b.dataset.g);
      wireArms();
    };
  }
  const custom = el<HTMLInputElement>("acct-custom");
  custom.oninput = () => {
    draft.color = custom.value;
    preview();
  };
  custom.onchange = wireArms;
  el("acct-save").onclick = async () => {
    const err = await account.saveSkin({ ...draft });
    say(err ?? "Saved. Your next game flies these arms.", Boolean(err));
  };
}

function drawName(): string {
  const s = account.state!;
  return (
    `<p class="sub">A reserved house name is yours alone: nobody else can play under it, on any server. ${crownsText(NAME_COST)}; the same again to change it.</p>` +
    (s.username ? `<p>Your house: <b class="gold">${esc(s.username)}</b></p>` : "") +
    `<label>House name<input id="acct-name" maxlength="24" placeholder="House Lionhart" value="${esc(s.username ?? "")}" /></label>` +
    `<button id="acct-reserve" class="primary wide">${s.username ? "Change it" : "Reserve it"} for ${crownsText(NAME_COST)}</button>`
  );
}

function draw() {
  const s = account.state;
  const open = el("account-open");
  open.hidden = !accountsEnabled;
  open.innerHTML = s
    ? `${shieldSVG("preview", hexToRGB((account.skin ?? DEFAULT).color), 16, account.skin ?? DEFAULT)} ${crownsText(s.crowns)}`
    : "Sign in · Store";
  el("acct-out").hidden = s !== null;
  el("acct-in").hidden = s === null;
  if (!s) return;
  el("acct-email").textContent = s.username ?? s.email;
  el("acct-crowns").textContent = crownsText(s.crowns);
  drawTabs();
  const body = el("store-body");
  body.innerHTML =
    tab === "packs" ? drawPacks()
    : tab === "bundles" ? drawBundles()
    : tab === "name" ? drawName()
    : drawSlot(tab);
  for (const b of Array.from(body.querySelectorAll<HTMLButtonElement>("button[data-pack]"))) {
    b.onclick = async () => {
      say("Taking you to the payment page…");
      const err = await account.buyPack(b.dataset.pack!);
      if (err) say(err, true);
    };
  }
  for (const b of Array.from(body.querySelectorAll<HTMLButtonElement>("button[data-buy]"))) {
    b.onclick = async () => {
      const err = await account.buyItem(b.dataset.buy!);
      say(err ?? "Bought. Wear it from this tab.", Boolean(err));
      draw();
    };
  }
  for (const b of Array.from(body.querySelectorAll<HTMLButtonElement>("button[data-bundle]"))) {
    b.onclick = async () => {
      const err = await account.buyBundle(b.dataset.bundle!);
      say(err ?? "Bought. Wear the pieces from their tabs.", Boolean(err));
      draw();
    };
  }
  for (const b of Array.from(body.querySelectorAll<HTMLButtonElement>("button[data-equip]"))) {
    b.onclick = async () => {
      const err = await account.equip(b.dataset.slot as Slot, b.dataset.equip!);
      say(err ?? "Worn. It shows in your next game.", Boolean(err));
      draw();
    };
  }
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
    draw();
  };
  await account.init();
  draw();
  // The reserved name is the house name, unless the player typed something else.
  if (account.state?.username) el<HTMLInputElement>("opt-name").value = account.state.username;

  // Back from Stripe: the webhook may land a moment after the redirect.
  const back = new URLSearchParams(location.search).get("checkout");
  if (back) {
    history.replaceState(null, "", location.pathname);
    tab = "packs";
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
    } else {
      say("Checkout cancelled. Nothing was charged.");
    }
  }
}
