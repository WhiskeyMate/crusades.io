// House rules for a private game: reading them off the creation screen, and
// saying them back in plain words in the lobby so everyone knows what they
// have joined.

import type { UnitType } from "@crusades/engine-api/game/GameTypes";
import type { Rules } from "../net/Protocol";
import { BUILD_ORDER, UNIT_LORE } from "./Lexicon";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const checked = (id: string) => el<HTMLInputElement>(id).checked;
const chosen = (id: string) => Number(el<HTMLSelectElement>(id).value);

/** The checkboxes for banning each thing that can be built or cast. */
export function drawBans() {
  el("rule-bans").innerHTML = BUILD_ORDER.map(
    (t) => `<label class="check"><input type="checkbox" data-ban="${t}" /> ${UNIT_LORE[t].name}</label>`,
  ).join("");
}

/** The rules as set on the creation screen; only the ones changed from the usual. */
export function readRules(): Rules {
  const r: Rules = {};
  if (checked("rule-instant")) r.instantBuild = true;
  if (checked("rule-gold")) r.infiniteGold = true;
  if (checked("rule-levies")) r.infiniteTroops = true;
  if (checked("rule-nopacts")) r.noPacts = true;
  if (checked("rule-nogold")) r.noGoldGifts = true;
  if (checked("rule-nolevy")) r.noLevyGifts = true;
  if (chosen("rule-start") > 0) r.startingGold = chosen("rule-start");
  if (chosen("rule-income") !== 1) r.goldMultiplier = chosen("rule-income");
  if (chosen("rule-truce") > 0) r.truceSeconds = chosen("rule-truce");
  if (chosen("rule-limit") > 0) r.limitMinutes = chosen("rule-limit");
  if (chosen("rule-pact") > 0) r.pactMinutes = chosen("rule-pact");
  const banned = Array.from(document.querySelectorAll<HTMLInputElement>("#rule-bans input:checked")).map(
    (b) => b.dataset.ban as UnitType,
  );
  if (banned.length > 0) r.banned = banned;
  return r;
}

const gold = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}K`);

/** The rules in words, for the lobby; empty when the game is by the standard rules. */
export function describeRules(r: Rules | undefined): string[] {
  if (!r) return [];
  const out: string[] = [];
  if (r.instantBuild) out.push("instant building");
  if (r.infiniteGold) out.push("endless gold");
  if (r.infiniteTroops) out.push("endless levies");
  if (r.startingGold) out.push(`start with ${gold(r.startingGold)} gold`);
  if (r.goldMultiplier && r.goldMultiplier !== 1) out.push(`income ×${r.goldMultiplier}`);
  if (r.truceSeconds) out.push(`${r.truceSeconds >= 60 ? `${r.truceSeconds / 60} minute` : `${r.truceSeconds} second`} truce at the start`);
  if (r.limitMinutes) out.push(`ends after ${r.limitMinutes} minutes`);
  if (r.noPacts) out.push("no pacts");
  else if (r.pactMinutes) out.push(`pacts last ${r.pactMinutes} minute${r.pactMinutes === 1 ? "" : "s"}`);
  if (r.noGoldGifts && r.noLevyGifts) out.push("no gifts");
  else if (r.noGoldGifts) out.push("no gifts of gold");
  else if (r.noLevyGifts) out.push("no lending of levies");
  if (r.banned && r.banned.length > 0) out.push(`banned: ${r.banned.map((t) => UNIT_LORE[t].name).join(", ")}`);
  return out;
}
