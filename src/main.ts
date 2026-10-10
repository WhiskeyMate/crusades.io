// The hall: pick a house, a realm and rivals, then start a game.

import { drawBans, readRules } from "./client/Rules";
import { mapStillHTML, startLiveMaps } from "./ui/MapPreview";
import { initAds } from "./ui/Ads";
import { Difficulty, GameMapType } from "@crusades/engine-api/game/GameTypes";
import { account } from "./account/Account";
import { initAccountPanel } from "./account/Panel";
import { Attract } from "./Attract";
import { DEFAULT_KINGDOMS } from "./worldgen/RealmGen";
import changelog from "./generated/changelog.json";
import { clearArms, setLiege } from "./client/Heraldry";
import { BUILD_ORDER, UNIT_LORE } from "./client/Lexicon";
import { Game } from "./Game";
import { Session, soloSession } from "./client/Session";
import { initOnline, leaveOnline, reportOnline } from "./ui/Lobby";

/** Where this build's source can be fetched (the AGPL asks for it). */
const SOURCE_URL = "https://github.com/WhiskeyMate/crusades.io";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const REALMS: { map: GameMapType; blurb: string }[] = [
  { map: GameMapType.Europe, blurb: "From Iberia to the Urals" },
  { map: GameMapType.Mediterranean, blurb: "The sea in the middle" },
  { map: GameMapType.Greece, blurb: "Aegean isles and straits" },
  { map: GameMapType.Earth, blurb: "The whole world, slowly" },
  { map: GameMapType.SunderedSea, blurb: "Two continents and the strait between" },
  { map: GameMapType.Ironspine, blurb: "A mountain chain and a walled province" },
  { map: GameMapType.CrownIsles, blurb: "Nine isles in a ring; the tenth must be taken" },
];

let chosen = GameMapType.Europe;
let game: Game | null = null;
let attract: Attract | null = null;

/** The war behind the landing page. Fails quietly where WebGL can't run. */
async function startAttract() {
  if (attract || game) return;
  try {
    attract = await Attract.create();
    (window as unknown as { attract: Attract }).attract = attract;
    await attract.start();
    el("landing").classList.remove("no-gl");
  } catch (e) {
    console.warn("No live backdrop:", e);
    attract?.stop();
    attract = null;
    el("landing").classList.add("no-gl");
  }
}

function stopAttract() {
  attract?.stop();
  attract = null;
}

function drawRealms() {
  const box = el("opt-maps");
  box.innerHTML = "";
  // The chosen realm, large and slowly turning.
  el("opt-map-live").dataset.map = chosen;
  el("opt-map-name").textContent = chosen;
  startLiveMaps();
  for (const r of REALMS) {
    const b = document.createElement("button");
    b.innerHTML = `${mapStillHTML(r.map, "map-thumb")}${r.map}<small>${r.blurb}</small>`;
    b.dataset.map = r.map;
    b.classList.toggle("on", r.map === chosen);
    b.onclick = () => {
      chosen = r.map;
      drawRealms();
      const k = el<HTMLInputElement>("opt-kingdoms");
      if (!k.dataset.touched) {
        k.value = String(DEFAULT_KINGDOMS[chosen]);
        k.dispatchEvent(new Event("input"));
      }
    };
    box.appendChild(b);
  }
}

function bindRange(id: string) {
  const input = el<HTMLInputElement>(id);
  const out = el(`${id}-v`);
  const show = () => (out.textContent = input.value);
  input.oninput = show;
  show();
}

const rollSeed = () => (el<HTMLInputElement>("opt-seed").value = String(1 + ((Math.random() * 99999) | 0)));

function houseName(): string {
  const name =
    el<HTMLInputElement>("opt-name").value.replace(/[^ _.\-a-zA-Z0-9À-ÿ]/g, "").trim().slice(0, 24) ||
    "Nameless House";
  return name.length < 3 ? `${name} House` : name;
}

/** Hide the hall, show the world. The session is already built. */
async function launch(session: Session) {
  if (game) return;
  const error = el("opt-error");
  error.hidden = true;
  el("menu").hidden = true;
  el("lobby").hidden = true;
  el("landing").hidden = true;
  el("loading").hidden = false;
  stopAttract();
  await new Promise((r) => setTimeout(r, 30));
  try {
    clearArms();
    setLiege(houseName(), account.skin);
    game = new Game(session, quit);
    await game.start();
    (window as unknown as { crusades: Game }).crusades = game;
  } catch (e) {
    console.error(e);
    game?.stop();
    game = null;
    el("landing").hidden = false;
    el("menu").hidden = false;
    void startAttract();
    error.textContent = `The realm could not be raised: ${e instanceof Error ? e.message : e}`;
    error.hidden = false;
    reportOnline("LAUNCH FAILED", e instanceof Error ? e.message : String(e));
  }
  el("loading").hidden = true;
}

async function begin() {
  if (game) return;
  const options = {
    name: houseName(),
    map: chosen,
    seed: Math.abs(Number(el<HTMLInputElement>("opt-seed").value) | 0) || 1,
    difficulty: el<HTMLSelectElement>("opt-difficulty").value as Difficulty,
    kingdoms: Number(el<HTMLInputElement>("opt-kingdoms").value),
    clans: Number(el<HTMLInputElement>("opt-clans").value),
    sandbox: el<HTMLInputElement>("opt-sandbox").checked,
    cosmetic: account.state ? { equipped: account.state.equipped, skin: account.skin } : undefined,
  };
  el("loading").hidden = false;
  el("menu").hidden = true;
  // Let the loading card paint before the realm is generated.
  await new Promise((r) => setTimeout(r, 30));
  let session: Session;
  try {
    session = await soloSession(options);
  } catch (e) {
    el("loading").hidden = true;
    el("menu").hidden = false;
    el("opt-error").textContent = `The realm could not be raised: ${e instanceof Error ? e.message : e}`;
    el("opt-error").hidden = false;
    return;
  }
  await launch(session);
}

function quit() {
  leaveOnline();
  game?.stop();
  game = null;
  el("landing").hidden = false;
  void startAttract();
}

drawRealms();
bindRange("opt-kingdoms");
el("opt-kingdoms").addEventListener("change", () => (el("opt-kingdoms").dataset.touched = "1"));
bindRange("opt-clans");
bindRange("opt-players");
rollSeed();
el("opt-dice").onclick = rollSeed;
/** The setup dialog serves two purposes: a solo game, or the settings of a lobby to host. */
let menuMode: "solo" | "host" = "solo";
function openMenu(mode: "solo" | "host") {
  menuMode = mode;
  el("menu-title").textContent = mode === "solo" ? "Play solo" : "Create a lobby";
  el("menu-sub").textContent =
    mode === "solo"
      ? "You against rival kingdoms and clans run by the game."
      : "Choose the realm, then share the code or link with your friends.";
  el("opt-sandbox-row").hidden = mode === "host";
  el("opt-players-row").hidden = mode === "solo";
  el("opt-rules").hidden = mode === "solo";
  el("opt-start").textContent = mode === "solo" ? "Enter the realm" : "Open the lobby";
  el("opt-error").hidden = true;
  el("menu").hidden = false;
}
el("opt-start").onclick = () => {
  if (menuMode === "solo") void begin();
  else hostLobby();
};
el("hall-solo").onclick = () => openMenu("solo");
el("hall-host").onclick = () => openMenu("host");
for (const b of Array.from(document.querySelectorAll<HTMLElement>(".play"))) {
  b.onclick = () => {
    el("landing").scrollTo({ top: 0, behavior: "smooth" });
    el("opt-name").focus();
  };
}
el("menu-close").onclick = () => (el("menu").hidden = true);
el("lore").innerHTML = BUILD_ORDER.map((t) => {
  const l = UNIT_LORE[t];
  return `<div><i>${l.glyph}</i><p><b>${l.name}</b><span>${l.blurb}</span></p></div>`;
}).join("");
if (SOURCE_URL) {
  el("source-link").innerHTML = ` <a href="${SOURCE_URL}" target="_blank" rel="noopener">Read the source.</a>`;
}
// A phone gets its own layout (see "Phones" in style.css): a touch screen
// whose shorter side is small. Checked again when it is turned round.
function markPhone() {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 560 || window.innerWidth < 720;
  document.body.classList.toggle("phone", (coarse && small) || window.innerWidth < 560);
  document.body.classList.toggle("touch", coarse);
}
markPhone();
window.addEventListener("resize", markPhone);

drawBans();
void initAccountPanel();
initAds();
const { hostLobby } = initOnline({
  name: () => houseName(),
  begin: (session) => void launch(session),
  lobbyConfig: () => ({
    map: chosen,
    seed: Math.abs(Number(el<HTMLInputElement>("opt-seed").value) | 0) || 1,
    difficulty: el<HTMLSelectElement>("opt-difficulty").value as Difficulty,
    kingdoms: Number(el<HTMLInputElement>("opt-kingdoms").value),
    clans: Number(el<HTMLInputElement>("opt-clans").value),
    maxPlayers: Number(el<HTMLInputElement>("opt-players").value),
    rules: readRules(),
  }),
});
// The changelog and version, generated from git at build time (tools/changelog.ts).
{
  const cl = changelog as { version: string; builtAt: string; entries: { hash: string; date: string; subject: string }[] };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const pretty = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  el("cl-version").textContent = `v${cl.version} · ${pretty(cl.builtAt)}`;
  el("footer-version").textContent = `Build v${cl.version}, ${pretty(cl.builtAt)}`;
  const days = new Map<string, typeof cl.entries>();
  for (const e of cl.entries) (days.get(e.date) ?? days.set(e.date, []).get(e.date)!).push(e);
  const render = (limit: number) => {
    let shown = 0;
    el("changelog").innerHTML = [...days]
      .map(([date, list]) => {
        if (shown >= limit) return "";
        const items = list.slice(0, Math.max(0, limit - shown));
        shown += items.length;
        return (
          `<div class="day"><time>${pretty(date)}</time><ul>` +
          items.map((e) => `<li>${esc(e.subject)}<code>${e.hash}</code></li>`).join("") +
          `</ul></div>`
        );
      })
      .join("");
    el("cl-more").hidden = shown >= cl.entries.length;
  };
  render(12);
  el("cl-more").onclick = () => render(cl.entries.length);
}
// Let the page paint before generating a realm for the backdrop.
window.setTimeout(() => void startAttract(), 150);
