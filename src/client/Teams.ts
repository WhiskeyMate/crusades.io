// Team games: the lords are sorted into two to four teams and win or lose
// together. The engine names its teams by colour, in this order.

import type { RGB } from "./Heraldry";

export const TEAM_NAMES = ["Red", "Blue", "Yellow", "Green", "Purple", "Orange", "Teal"] as const;

/** The colour a team's lands are drawn in. Members vary a little around it, so their borders still show. */
export const TEAM_COLORS: Record<string, RGB> = {
  Red: [0.78, 0.15, 0.15],
  Blue: [0.2, 0.42, 0.85],
  Yellow: [0.86, 0.7, 0.16],
  Green: [0.22, 0.62, 0.28],
  Purple: [0.55, 0.3, 0.72],
  Orange: [0.88, 0.47, 0.14],
  Teal: [0.14, 0.62, 0.6],
};

export const teamName = (index: number | undefined | null): string => (index === undefined || index === null ? "" : (TEAM_NAMES[index] ?? `Team ${index + 1}`));

/** As a CSS colour, for the lobby and the lists. */
export function teamCSS(team: string): string {
  const c = TEAM_COLORS[team];
  return c ? `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})` : "#8a7a5c";
}

/** In words: "2 teams", or nothing for a free-for-all. */
export const teamsText = (teams: number | undefined): string => (teams && teams >= 2 ? `${teams} teams` : "");
