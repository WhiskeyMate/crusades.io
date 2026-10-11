// The Clans window: a map of the world shaded by where the clans are (click
// a region for the clans that call it home), a list to search, and a tab for
// your own clan: found one, or see its roll and, as founder, run it.

import { GameMapType } from "@crusades/engine-api/game/Maps.gen";
import { account, accountsEnabled } from "../account/Account";
import { flatMap } from "../ui/MapPreview";
import { Clan, clans, Mine, REPORT_REASONS, ReportReason } from "./Clans";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type Tab = "map" | "browse" | "mine";
const TABS: { id: Tab; label: string }[] = [
  { id: "map", label: "World map" },
  { id: "browse", label: "All clans" },
  { id: "mine", label: "Your clan" },
];

/** How far from a click a clan may be and still count as "of that region", as a share of the map's width. */
const NEAR = 0.065;

let tab: Tab = "map";
let list: Clan[] = [];
let mine: Mine | null = null;
let asked = new Set<string>();
/** The spot clicked on the world map. */
let picked: { x: number; y: number } | null = null;
/** Where a clan being founded, or moved, is to be pinned. */
let pin: { x: number; y: number } | null = null;
let search = "";
let world: HTMLCanvasElement | null = null;
/** The same map in the window's own colours: ink on vellum rather than a game board. */
let chart: HTMLCanvasElement | null = null;
let loaded = false;
let leaving = false;
/** The clan a report is being written about, if any. */
let reporting: string | null = null;

function say(text: string, bad = false) {
  const n = el("clans-note");
  n.textContent = text;
  n.hidden = text === "";
  n.classList.toggle("bad", bad);
}

/** The name a player joins under: their house name. */
function displayName(): string {
  const s = account.state;
  const typed = el<HTMLInputElement>("opt-name").value.trim();
  return (s?.username ?? (typed || s?.name) ?? "A lord").slice(0, 24);
}

async function load() {
  try {
    [list, mine, asked] = await Promise.all([clans.all(), clans.mine(), clans.asked()]);
    loaded = true;
  } catch (e) {
    say(`The clans could not be read: ${e instanceof Error ? e.message : e}`, true);
  }
  draw();
}

/**
 * The world redrawn in two quiet tones, so that the glow of the clans is the
 * only bright thing on it.
 */
function inked(map: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = map.width;
  out.height = map.height;
  const ctx = out.getContext("2d");
  if (!ctx) return map;
  ctx.drawImage(map, 0, 0);
  try {
    const img = ctx.getImageData(0, 0, out.width, out.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const light = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
      if (d[i + 2] > d[i + 1]) {
        // Sea: deep and nearly flat.
        d[i] = 15 + light * 14;
        d[i + 1] = 21 + light * 18;
        d[i + 2] = 28 + light * 24;
      } else {
        // Land: worn leather, a little lighter on the heights.
        d[i] = 66 + light * 58;
        d[i + 1] = 54 + light * 46;
        d[i + 2] = 36 + light * 26;
      }
    }
    ctx.putImageData(img, 0, 0);
  } catch {
    // A canvas that will not be read is shown as it is.
  }
  return out;
}

const apart = (a: { x: number; y: number }, b: { x: number; y: number }, aspect: number) =>
  Math.hypot(a.x - b.x, (a.y - b.y) * aspect);

/**
 * Paints the world with the clans on it: a glow where they gather, brighter
 * the more of them and the larger they are, a mark for each, and whatever
 * spot or pin is being shown.
 */
function paint(canvas: HTMLCanvasElement, opts: { heat: boolean; ring?: { x: number; y: number } | null; flag?: { x: number; y: number } | null }) {
  const ctx = canvas.getContext("2d");
  if (!ctx || !world) return;
  chart ??= inked(world);
  const w = (canvas.width = world.width);
  const h = (canvas.height = world.height);
  ctx.drawImage(chart, 0, 0);
  if (opts.heat) {
    ctx.globalCompositeOperation = "lighter";
    for (const c of list) {
      const r = w * 0.035 * (1 + Math.log2(Math.max(1, c.members)) * 0.22);
      const g = ctx.createRadialGradient(c.x * w, c.y * h, 0, c.x * w, c.y * h, r);
      g.addColorStop(0, "rgba(255, 150, 40, 0.5)");
      g.addColorStop(0.45, "rgba(230, 90, 30, 0.2)");
      g.addColorStop(1, "rgba(200, 60, 20, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(c.x * w - r, c.y * h - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
    for (const c of list) {
      ctx.beginPath();
      ctx.arc(c.x * w, c.y * h, mine?.clan.id === c.id ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = mine?.clan.id === c.id ? "#8fe08a" : "#ffe9b0";
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#1b1410";
      ctx.stroke();
    }
  }
  if (opts.ring) {
    ctx.beginPath();
    ctx.arc(opts.ring.x * w, opts.ring.y * h, NEAR * w, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#f2d27a";
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (opts.flag) {
    const x = opts.flag.x * w;
    const y = opts.flag.y * h;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#1b1410";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 30);
    ctx.stroke();
    ctx.fillStyle = "#c71a21";
    ctx.beginPath();
    ctx.moveTo(x, y - 30);
    ctx.lineTo(x + 20, y - 23);
    ctx.lineTo(x, y - 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#f2d27a";
    ctx.fill();
    ctx.stroke();
  }
}

/** Where on the map (0 to 1 each way) a click on its canvas fell. */
function spot(canvas: HTMLCanvasElement, e: MouseEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
}

/** A first guess at an account name: what they are called where they signed in, unless that is an email's first part or a real name. */
function suggestion(): string {
  const s = account.state;
  return s && (s.provider === "discord" || s.provider === "steam") ? s.name.replace(/[^A-Za-z0-9À-ÖØ-öø-ÿ _.-]/g, "").slice(0, 20) : "";
}

/** How long ago, in words. */
function since(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 60 ? `${days} days ago` : `${Math.round(days / 30)} months ago`;
}

function joinButton(c: Clan): string {
  if (mine?.clan.id === c.id) return `<span class="yours">Your clan</span>`;
  if (mine) return "";
  if (!account.state) return `<button data-signin>Sign in to join</button>`;
  if (asked.has(c.id)) return `<button data-withdraw="${c.id}">Withdraw your ask</button>`;
  return `<button class="primary" data-join="${c.id}">${c.open ? "Join" : "Ask to join"}</button>`;
}

function row(c: Clan): string {
  const own = mine?.clan.id === c.id;
  const act = joinButton(c);
  return (
    `<div class="clan-item"><div class="clan-row${own ? " own" : ""}"><span class="clan-tag">${esc(c.tag)}</span>` +
    // "Ask to join" on the button already says it is by approval; said here only when there is no such button.
    `<div class="about"><b title="${esc(c.name)}">${esc(c.name)}${c.open || act.includes("data-join") ? "" : `<span class="shut" title="Its founder approves each member">by approval</span>`}</b>` +
    `${c.blurb ? `<p title="${esc(c.blurb)}">${esc(c.blurb)}</p>` : ""}</div>` +
    `<div class="count"><b>${c.members}</b>${c.members === 1 ? "member" : "members"}</div>` +
    `${act ? `<div class="act">${act}</div>` : ""}` +
    `${own ? "" : `<button class="flag" data-report="${c.id}" title="Report this clan" aria-label="Report ${esc(c.name)}">⚑</button>`}</div>` +
    (reporting === c.id
      ? `<div class="clan-report"><b>Report ${esc(c.name)}</b>` +
        (account.state
          ? `<select id="report-why">${REPORT_REASONS.map(([k, label]) => `<option value="${k}">${label}</option>`).join("")}</select>` +
            `<input id="report-note" maxlength="300" placeholder="Anything to add (optional)" />` +
            `<div><button class="primary" data-send-report="${c.id}">Send report</button> <button data-cancel-report>Cancel</button></div>`
          : `<p class="dim small">Sign in to send a report.</p><div><button class="primary" data-signin>Sign in</button> <button data-cancel-report>Cancel</button></div>`) +
        `</div>`
      : "") +
    `</div>`
  );
}

function drawMap(): string {
  const aspect = world ? world.height / world.width : 0.47;
  const near = picked ? list.filter((c) => apart(c, picked!, aspect) <= NEAR).sort((a, b) => apart(a, picked!, aspect) - apart(b, picked!, aspect)) : [];
  const lords = list.reduce((n, c) => n + c.members, 0);
  return (
    `<div class="clan-map"><div><div class="chart"><canvas id="clans-world" class="world"></canvas>` +
    `<p class="hint">${picked ? "Click elsewhere to look at another region" : "Click a region to see its clans"}</p></div>` +
    `<div class="clan-tally"><div><b>${list.length}</b>clan${list.length === 1 ? "" : "s"}</div><div><b>${lords}</b>sworn lord${lords === 1 ? "" : "s"}</div>` +
    `<div><b>${list.filter((c) => c.open).length}</b>open to all</div></div></div>` +
    `<aside><div class="in">` +
    (picked
      ? `<h3>Clans of this region <span>${near.length}</span><button class="link" data-clear>Show the largest</button></h3>` +
        (near.length ? near.map(row).join("") : `<p class="empty">No clan calls this region home yet.${mine ? "" : " You could found the first."}</p>`)
      : `<h3>Largest clans</h3>` +
        (list.length ? list.slice(0, 8).map(row).join("") : `<p class="empty">${loaded ? "No clans have been founded yet." : "Reading the rolls…"}</p>`)) +
    `</div></aside></div>`
  );
}

function drawBrowse(): string {
  const q = search.trim().toLowerCase();
  const found = q ? list.filter((c) => c.name.toLowerCase().includes(q) || c.tag.toLowerCase().includes(q)) : list;
  return (
    `<div class="clan-browse"><div class="bar"><input id="clans-search" placeholder="Search by name or tag" value="${esc(search)}" maxlength="24" />` +
    `<span>${found.length} clan${found.length === 1 ? "" : "s"}</span></div>` +
    `<div class="list">${found.length ? found.map(row).join("") : `<p class="empty">${loaded ? "No clan by that name." : "Reading the rolls…"}</p>`}</div>` +
    `</div>`
  );
}

function drawMine(): string {
  if (!account.state) {
    return `<div class="clan-mine step"><h3>Your clan</h3><p class="dim">Sign in to found a clan or join one. Looking is free.</p><button class="primary wide" data-signin>Sign in</button></div>`;
  }
  if (!account.state.handle) {
    return (
      `<div class="clan-mine step"><h3>First, your account name</h3>` +
      `<p class="dim small">A clan knows its members by account name, not by the house name they happen to be playing under. Choose yours once; it can be changed once in thirty days. Your house name in games stays whatever you like.</p>` +
      `<div class="fields"><label>Account name<input id="clan-handle" maxlength="20" placeholder="3 to 20 letters, digits and spaces" value="${esc(suggestion())}" /></label>` +
      `<button id="clan-handle-save" class="primary wide">Save my account name</button></div></div>`
    );
  }
  if (!mine) {
    return (
      `<div class="clan-mine"><h3>Found a clan</h3>` +
      `<p class="dim small">You are in no clan. Join one from the map or the list, or found your own here. A house belongs to one clan at a time.</p>` +
      `<div class="found"><div class="fields">` +
      `<label>Name<input id="clan-name" maxlength="24" placeholder="The Iron Wolves" /></label>` +
      `<label><span>Tag <span class="dim">(2 to 5 letters or digits, shown before your house name)</span></span><input id="clan-tag" maxlength="5" placeholder="WOLF" autocapitalize="characters" /></label>` +
      `<label><span>About <span class="dim">(optional)</span></span><textarea id="clan-blurb" maxlength="200" rows="3" placeholder="Who you are, when you play."></textarea></label>` +
      `<label class="check"><input id="clan-open" type="checkbox" checked /> Anyone may join. Untick to approve each member yourself.</label>` +
      `<button id="clan-found" class="primary wide">Found the clan</button></div>` +
      `<div class="home"><div class="field-label">Home: click the map where your clan is from</div><canvas id="clans-pin" class="world"></canvas></div>` +
      `</div></div>`
    );
  }
  const c = mine.clan;
  const me = account.state.uid;
  return (
    `<div class="clan-mine"><div class="banner"><span class="clan-tag big">${esc(c.tag)}</span><div><b>${esc(c.name)}</b>` +
    `<small>${c.members} member${c.members === 1 ? "" : "s"} · ${c.open ? "open to all" : "joins by approval"}${mine.founder ? " · you are its founder" : ""}</small>` +
    `${c.blurb ? `<p>${esc(c.blurb)}</p>` : ""}</div>` +
    `<button id="clan-leave" class="${leaving ? "bad" : ""}">${leaving ? (mine.founder && mine.roll.length === 1 ? "Really leave? The clan will be dissolved" : "Really leave?") : "Leave the clan"}</button></div>` +
    `<p class="dim small plays">In games you play as <b>[${esc(c.tag)}] ${esc(displayName())}</b>.</p>` +
    (mine.founder && mine.asks.length
      ? `<h3>Asking to join <span>${mine.asks.length}</span></h3>` +
        mine.asks.map((a) => `<div class="clan-row"><div class="about"><b>${esc(a.handle)}</b><small>plays as ${esc(a.name)}</small></div><button class="primary" data-accept="${a.id}">Accept</button><button data-decline="${a.id}">Decline</button></div>`).join("")
      : "") +
    `<div class="found"><div class="fields"><h3>The roll <span>${mine.roll.length}</span></h3>` +
    `<p class="dim small">Each line is one account, under its account name, with the house name it last played as beneath. House names change; the account does not.</p>` +
    mine.roll
      .map((m) => {
        const notes = [m.founder ? "founder" : "", `plays as ${esc(m.name)}`, m.seen ? `last played ${since(m.seen)}` : ""].filter(Boolean).join(" · ");
        return `<div class="clan-row slim"><div class="about"><b>${esc(m.handle)}</b><small>${notes}</small></div>${mine!.founder && m.id !== me ? `<button data-remove="${m.id}">Remove</button>` : ""}</div>`;
      })
      .join("") +
    (mine.founder
      ? `<h3>Running it</h3>` +
        `<label>About<textarea id="clan-blurb" maxlength="200" rows="3">${esc(c.blurb)}</textarea></label>` +
        `<label class="check"><input id="clan-open" type="checkbox" ${c.open ? "checked" : ""} /> Anyone may join</label>` +
        `<button id="clan-save" class="primary">Save changes</button>`
      : "") +
    `</div><div class="home"><div class="field-label">Home${mine.founder ? ": click the map to move it, then save" : ""}</div><canvas id="clans-pin" class="world"></canvas></div></div></div>`
  );
}

function draw() {
  el("clans-nav").innerHTML = TABS.map((t) => `<button class="${t.id === tab ? "on" : ""}" data-tab="${t.id}">${t.label}${t.id === "mine" && mine ? ` · ${esc(mine.clan.tag)}` : ""}</button>`).join("");
  for (const b of Array.from(el("clans-nav").querySelectorAll<HTMLButtonElement>("button"))) {
    b.onclick = () => {
      tab = b.dataset.tab as Tab;
      leaving = false;
      reporting = null;
      pin = null;
      say("");
      draw();
    };
  }
  const body = el("clans-body");
  const keep = body.scrollTop;
  body.innerHTML = tab === "map" ? drawMap() : tab === "browse" ? drawBrowse() : drawMine();
  body.scrollTop = keep;

  const on = (sel: string, fn: (b: HTMLButtonElement) => void | Promise<void>) => {
    for (const b of Array.from(body.querySelectorAll<HTMLButtonElement>(sel))) b.onclick = () => void fn(b);
  };
  /** Does it, says what went wrong if anything did, and reads everything afresh. */
  const act = async (work: Promise<string | null>, done: string) => {
    const err = await work;
    say(err ?? done, Boolean(err));
    leaving = false;
    await load();
  };
  on("button[data-signin]", () => {
    el("clans").hidden = true;
    el("account-open").click();
  });
  on("button[data-join]", async (b) => {
    const c = list.find((x) => x.id === b.dataset.join);
    if (!c) return;
    if (!account.state?.handle) {
      tab = "mine";
      say("Choose an account name first, then join.");
      return draw();
    }
    const res = await clans.join(c, displayName());
    say(res.error ?? (res.did === "joined" ? `You have joined ${c.name}. Your tag is ${c.tag}.` : `You have asked to join ${c.name}. Its founder will answer.`), Boolean(res.error));
    if (res.did === "joined") tab = "mine";
    await load();
  });
  on("button[data-withdraw]", (b) => {
    const c = list.find((x) => x.id === b.dataset.withdraw);
    if (c) return act(clans.withdraw(c), "Your ask is withdrawn.");
  });
  on("button[data-report]", (b) => {
    reporting = b.dataset.report!;
    draw();
  });
  on("button[data-clear]", () => {
    picked = null;
    draw();
  });
  on("button[data-cancel-report]", () => {
    reporting = null;
    draw();
  });
  on("button[data-send-report]", async (b) => {
    const c = list.find((x) => x.id === b.dataset.sendReport);
    if (!c) return;
    const err = await clans.report(c, el<HTMLSelectElement>("report-why").value as ReportReason, el<HTMLInputElement>("report-note").value);
    reporting = null;
    say(err ?? `Thank you. ${c.name} has been reported and will be looked at.`, Boolean(err));
    draw();
  });
  on("button[data-accept]", (b) => act(clans.answer(b.dataset.accept!, true), "Welcomed to the clan."));
  on("button[data-decline]", (b) => act(clans.answer(b.dataset.decline!, false), "Declined."));
  on("button[data-remove]", (b) => act(clans.remove(b.dataset.remove!), "Removed from the roll."));
  on("#clan-handle-save", async () => {
    const err = await account.setHandle(el<HTMLInputElement>("clan-handle").value);
    say(err ?? "Your account name is set.", Boolean(err));
    draw();
  });
  on("#clan-leave", () => {
    if (!leaving) {
      leaving = true;
      return draw();
    }
    return act(clans.leave(), "You have left the clan.");
  });
  on("#clan-found", async () => {
    if (!pin) return say("Click the map to say where your clan is from.", true);
    const err = await clans.found(
      {
        name: el<HTMLInputElement>("clan-name").value,
        tag: el<HTMLInputElement>("clan-tag").value,
        blurb: el<HTMLTextAreaElement>("clan-blurb").value,
        open: el<HTMLInputElement>("clan-open").checked,
        x: pin.x,
        y: pin.y,
      },
      displayName(),
    );
    if (err) return say(err, true);
    pin = null;
    say("Your clan is founded.");
    await load();
  });
  on("#clan-save", () =>
    act(
      clans.change({
        blurb: el<HTMLTextAreaElement>("clan-blurb").value,
        open: el<HTMLInputElement>("clan-open").checked,
        x: pin?.x ?? mine!.clan.x,
        y: pin?.y ?? mine!.clan.y,
      }),
      "Saved.",
    ),
  );

  const searchBox = document.getElementById("clans-search") as HTMLInputElement | null;
  if (searchBox) {
    searchBox.oninput = () => {
      search = searchBox.value;
      const at = searchBox.selectionStart;
      draw();
      const again = el<HTMLInputElement>("clans-search");
      again.focus();
      again.setSelectionRange(at, at);
    };
  }
  const tagBox = document.getElementById("clan-tag") as HTMLInputElement | null;
  if (tagBox) tagBox.oninput = () => (tagBox.value = tagBox.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));

  const worldCanvas = document.getElementById("clans-world") as HTMLCanvasElement | null;
  if (worldCanvas) {
    paint(worldCanvas, { heat: true, ring: picked });
    worldCanvas.onclick = (e) => {
      picked = spot(worldCanvas, e);
      draw();
    };
  }
  const pinCanvas = document.getElementById("clans-pin") as HTMLCanvasElement | null;
  if (pinCanvas) {
    const movable = !mine || mine.founder;
    const show = () => paint(pinCanvas, { heat: false, flag: pin ?? (mine ? { x: mine.clan.x, y: mine.clan.y } : null) });
    show();
    pinCanvas.classList.toggle("fixed", !movable);
    if (movable) {
      pinCanvas.onclick = (e) => {
        pin = spot(pinCanvas, e);
        show();
      };
    }
  }
}

export function initClans() {
  const open = el("clans-open");
  open.hidden = !accountsEnabled;
  if (!accountsEnabled) return;
  open.onclick = async () => {
    el("clans").hidden = false;
    say("");
    draw();
    if (!world) {
      world = await flatMap(GameMapType.Earth);
      draw();
    }
    await load();
  };
  el("clans-close").onclick = () => (el("clans").hidden = true);
}
