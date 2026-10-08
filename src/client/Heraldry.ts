// Colours and coats of arms, all derived from a player's id and name so the
// game ships no flag artwork.

import { PlayerType } from "@vassal/engine-api/game/GameTypes";

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
}

export const DIVISION_COUNT = 5;

let liegeName: string | null = null;
let liegeSkin: Skin | null = null;

/** Who the local player is, and the arms they have chosen (null for the default crimson). */
export function setLiege(name: string | null, skin: Skin | null) {
  liegeName = name;
  liegeSkin = skin;
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
    Number.isInteger(k.charge) && k.charge >= 0 && k.charge < CHARGES.length
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
export const CHARGES = ["✚", "♜", "⚜", "★", "♞", "☗", "❖", "♛", "⚔", "☾", "♣", "⛨"];

/** A small shield as inline SVG: field in the realm's colour, a division and a charge. */
export function shieldSVG(name: string, color: RGB, size = 18, skin?: Skin | null): string {
  const h = hash(name);
  // The local player's chosen arms replace the ones their name would give.
  const worn = skin ?? (liegeSkin && name === liegeName ? liegeSkin : null);
  const metal = METALS[h % 2];
  const main = css(color);
  const dark = css(color, 0.55);
  const division = worn ? worn.division : (h >>> 3) % DIVISION_COUNT;
  const charge = CHARGES[worn ? worn.charge : (h >>> 7) % CHARGES.length];
  const path = "M2 2h20v10c0 7-5 10-10 12C7 22 2 19 2 12z";
  let field = "";
  switch (division) {
    case 0:
      field = `<rect x="12" y="0" width="12" height="26" fill="${metal}"/>`;
      break;
    case 1:
      field = `<rect x="0" y="0" width="24" height="9" fill="${metal}"/>`;
      break;
    case 2:
      field = `<path d="M0 0L24 26V0z" fill="${metal}"/>`;
      break;
    case 3:
      field = `<rect x="9" y="0" width="6" height="26" fill="${metal}"/>`;
      break;
    default:
      field = "";
  }
  const id = `s${h.toString(36)}${division}${size}`;
  return (
    `<svg width="${size}" height="${Math.round(size * 1.08)}" viewBox="0 0 24 26">` +
    `<clipPath id="${id}"><path d="${path}"/></clipPath>` +
    `<g clip-path="url(#${id})"><rect width="24" height="26" fill="${main}"/>${field}` +
    `<text x="12" y="16" font-size="11" text-anchor="middle" fill="${division === 4 ? metal : dark}" font-family="serif">${charge}</text></g>` +
    `<path d="${path}" fill="none" stroke="#1b1410" stroke-width="1.6"/></svg>`
  );
}
