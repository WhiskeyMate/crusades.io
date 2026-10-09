// Colours and coats of arms, all derived from a player's id and name so the
// game ships no flag artwork.

import { PlayerType } from "@crusades/engine-api/game/GameTypes";

export type RGB = [number, number, number];

function hsl(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A premium player's chosen arms: field colour, how the shield is divided, and the charge on it. */
export interface Skin {
  /** "#rrggbb" */
  color: string;
  division: number;
  charge: number;
  /** The second tincture, "#rrggbb"; a metal is chosen from the name if absent. */
  second?: string;
  /** The colour of the charge; left out, the herald picks one that shows. */
  ink?: string | null;
}

export const DIVISION_NAMES = [
  "Per pale", "Chief", "Per bend", "Pale", "Plain", "Per fess", "Quarterly", "Saltire", "Cross",
  "Bordure", "Chevron", "Bend", "Fess", "Gyronny", "Chequy", "Barry", "Paly", "Lozengy",
];
export const DIVISION_COUNT = DIVISION_NAMES.length;

let liegeName: string | null = null;
let liegeSkin: Skin | null = null;

/** Who the local player is, and the arms they have chosen (null for the default crimson). */
export function setLiege(name: string | null, skin: Skin | null) {
  liegeName = name;
  liegeSkin = skin;
}

/** Arms chosen by other players in this game, by house name. */
const armsByName = new Map<string, Skin>();
export function setArms(name: string, skin: Skin | null) {
  if (skin) armsByName.set(name, skin);
  else armsByName.delete(name);
}
export function clearArms() {
  armsByName.clear();
}

export function hexToRGB(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function validSkin(v: unknown): v is Skin {
  const k = v as Skin;
  return (
    typeof k === "object" && k !== null &&
    typeof k.color === "string" && /^#[0-9a-fA-F]{6}$/.test(k.color) &&
    Number.isInteger(k.division) && k.division >= 0 && k.division < DIVISION_COUNT &&
    Number.isInteger(k.charge) && k.charge >= 0 && k.charge < CHARGES.length &&
    (k.second === undefined || k.second === null || (typeof k.second === "string" && /^#[0-9a-fA-F]{6}$/.test(k.second))) &&
    (k.ink === undefined || k.ink === null || (typeof k.ink === "string" && /^#[0-9a-fA-F]{6}$/.test(k.ink)))
  );
}

/** The player's own realm is crimson unless they chose arms; nobody else gets a red. */
export function playerColor(
  smallID: number,
  type: PlayerType,
  mine: boolean,
  name: string,
): RGB {
  if (mine) return liegeSkin ? hexToRGB(liegeSkin.color) : [0.78, 0.1, 0.13];
  const t = (smallID * 0.61803398875) % 1;
  const hue = (28 + t * 300) / 360;
  const v = (hash(name) % 1000) / 1000;
  if (type === PlayerType.Bot) return hsl(hue, 0.24 + v * 0.16, 0.5 + v * 0.1);
  return hsl(hue, 0.6 + v * 0.22, 0.4 + v * 0.12);
}

export const css = (c: RGB, mul = 1) =>
  `rgb(${Math.round(Math.min(1, c[0] * mul) * 255)},${Math.round(Math.min(1, c[1] * mul) * 255)},${Math.round(Math.min(1, c[2] * mul) * 255)})`;

const METALS = ["#e8d9a0", "#f1efe6"];
/** Append only: saved arms store the index. The first is "no charge". */
export const CHARGES = [
  "✚", "♜", "⚜", "★", "♞", "☗", "❖", "♛", "⚔", "☾", "♣", "⛨",
  "", "♥", "♠", "♦", "☀", "☠", "⚓", "♚", "♝", "✠", "☩", "✦", "❀", "☘", "⚒", "♆", "☥", "⚚",
  "♔", "♕", "♖", "♗", "♘", "♙", "✝", "☨", "☦", "✙", "✜", "✢", "✣", "✤", "✥", "❦", "☙", "✿", "❁", "✾",
  "✶", "✴", "✹", "❂", "☼", "☽", "⚖", "⚑", "⚐", "♱", "♰", "⚘", "✪", "❉", "✺", "✧", "♤", "♧", "♡", "♢",
  "☧", "⚝", "✵", "❃", "⚔", "♨",
].slice(0, 76);


/** A small shield as inline SVG: field in the realm's colour, a division and a charge. */
export function shieldSVG(name: string, color: RGB, size = 18, skin?: Skin | null): string {
  const h = hash(name);
  // The local player's chosen arms replace the ones their name would give.
  const worn = skin ?? (liegeSkin && name === liegeName ? liegeSkin : (armsByName.get(name) ?? null));
  const metal = worn?.second ?? METALS[h % 2];
  const main = css(color);
  const dark = css(color, 0.55);
  const division = worn ? worn.division : (h >>> 3) % 5;
  // The selector asks for the plain text form: no coloured emoji on a shield.
  const raw = CHARGES[worn ? worn.charge : (h >>> 7) % 12];
  const charge = raw ? raw + "︎" : raw;
  const path = "M2 2h20v10c0 7-5 10-10 12C7 22 2 19 2 12z";
  const m = `fill="${metal}"`;
  let field = "";
  switch (division) {
    case 0: field = `<rect x="12" y="0" width="12" height="26" ${m}/>`; break;
    case 1: field = `<rect x="0" y="0" width="24" height="9" ${m}/>`; break;
    case 2: field = `<path d="M0 0L24 26V0z" ${m}/>`; break;
    case 3: field = `<rect x="9" y="0" width="6" height="26" ${m}/>`; break;
    case 5: field = `<rect x="0" y="13" width="24" height="13" ${m}/>`; break;
    case 6: field = `<rect x="12" y="0" width="12" height="13" ${m}/><rect x="0" y="13" width="12" height="13" ${m}/>`; break;
    case 7: field = `<path d="M0 0l4 0 8 9 8-9 4 0 0 4-8 9 8 9 0 4-4 0-8-9-8 9-4 0 0-4 8-9-8-9z" ${m}/>`; break;
    case 8: field = `<rect x="9.5" y="0" width="5" height="26" ${m}/><rect x="0" y="8" width="24" height="5" ${m}/>`; break;
    case 9: field = `<path d="M2 2h20v10c0 7-5 10-10 12C7 22 2 19 2 12z" fill="none" stroke="${metal}" stroke-width="6"/>`; break;
    case 10: field = `<path d="M0 18L12 7l12 11v5L12 12 0 23z" ${m}/>`; break;
    case 11: field = `<path d="M0 0h6l18 20v6h-2L0 6z" ${m}/>`; break;
    case 12: field = `<rect x="0" y="9" width="24" height="7" ${m}/>`; break;
    case 13: field = `<path d="M12 13L0 0h12zM12 13L24 0v13zM12 13l12 13H12zM12 13L0 26V13z" ${m}/>`; break;
    case 14: {
      for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2 === 0) field += `<rect x="${x * 6}" y="${y * 5.5}" width="6" height="5.5" ${m}/>`;
      break;
    }
    case 15: field = [0, 2, 4].map((i) => `<rect x="0" y="${i * 4.4}" width="24" height="4.4" ${m}/>`).join(""); break;
    case 16: field = [0, 2, 4].map((i) => `<rect x="${i * 4.8}" y="0" width="4.8" height="26" ${m}/>`).join(""); break;
    case 17: {
      for (let y = -1; y < 6; y++) for (let x = -1; x < 5; x++) if ((x + y) % 2 === 0) field += `<path d="M${x * 6 + 3} ${y * 6}l3 3-3 3-3-3z" ${m}/>`;
      break;
    }
    default: field = "";
  }
  const id = `s${h.toString(36)}${division}${size}${worn ? worn.charge : ""}${(worn?.second ?? "").slice(1)}${main.length}${Math.round(color[0] * 255)}${Math.round(color[2] * 255)}`;
  return (
    `<svg width="${size}" height="${Math.round(size * 1.08)}" viewBox="0 0 24 26">` +
    `<clipPath id="${id}"><path d="${path}"/></clipPath>` +
    `<g clip-path="url(#${id})"><rect width="24" height="26" fill="${main}"/>${field}` +
    `<text x="12" y="16" font-size="11" text-anchor="middle" fill="${worn?.ink ?? (division === 4 ? metal : dark)}" font-family="serif">${charge}</text></g>` +
    `<path d="${path}" fill="none" stroke="#1b1410" stroke-width="1.6"/></svg>`
  );
}
