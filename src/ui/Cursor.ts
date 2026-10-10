// The cursor over the map says what a click there would do: march, sail,
// build, raise a banner, command a fleet. Each is a small drawing, set as a
// CSS cursor on the canvas; the hot spot is the point of the tool.

const INK = "#1b1410";
const GOLD = "#f2d27a";

function cursor(body: string, hotX: number, hotY: number, fallback: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotX} ${hotY}, ${fallback}`;
}

/** Stroke a shape twice: dark and wide, then pale and narrow, so it reads on any ground. */
const outlined = (d: string, fill: string, w = 1.6) =>
  `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;

export type CursorKind =
  | "pan" | "drag" | "march" | "sail" | "fleet" | "choose" | "build" | "raise" | "barred" | "own" | "ally" | "cast" | "box";

const DRAWN: Record<CursorKind, string> = {
  pan: "grab",
  drag: "grabbing",
  // A sword, point at the top left: march on this land.
  march: cursor(
    outlined("M3 3l4 1 13 13-3 3L4 7z", "#e8edf2") +
      outlined("M17 23l6-6 2 2-2 2 5 5-3 3-5-5-2 2z", "#8a5a2b") +
      `<path d="M6 6l12 12" stroke="${INK}" stroke-width="0.8"/>`,
    3, 3, "crosshair",
  ),
  // A longship: land across the water, to be reached by sea.
  sail: cursor(
    outlined("M4 20h24l-4 6H8z", "#8a5a2b") +
      outlined("M15 4v15h10z", "#f1ead8") +
      outlined("M13 7v12H6z", "#c71a21") +
      `<circle cx="4" cy="4" r="2.4" fill="${GOLD}" stroke="${INK}" stroke-width="1.2"/>`,
    4, 4, "crosshair",
  ),
  // An anchor: send the chosen galleys here.
  fleet: cursor(
    `<g fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"><path d="M16 9v18M9 14h14M6 20c1 5 5 7 10 7s9-2 10-7"/><circle cx="16" cy="6" r="3"/></g>` +
      `<g fill="none" stroke="${GOLD}" stroke-width="2.4" stroke-linecap="round"><path d="M16 9v18M9 14h14M6 20c1 5 5 7 10 7s9-2 10-7"/><circle cx="16" cy="6" r="3"/></g>`,
    16, 27, "crosshair",
  ),
  // A pointing gauntlet: take command of these galleys.
  choose: "pointer",
  // A hammer: build here.
  build: cursor(
    outlined("M3 6l6-3 8 4-2 5-4-1-5 1z", "#aab0b8") +
      outlined("M12 11l3 2 13 14-3 3L11 15z", "#8a5a2b"),
    4, 5, "crosshair",
  ),
  // A banner: raise your house here.
  raise: cursor(
    outlined("M5 2h2v28H5z", "#8a5a2b") + outlined("M7 4h20l-5 6 5 6H7z", "#c71a21"),
    6, 30, "crosshair",
  ),
  barred: "not-allowed",
  own: "default",
  // A shield: this land is held by a friend.
  ally: cursor(outlined("M5 4h22v10c0 9-6 12-11 14C11 26 5 23 5 14z", "#3f8a4a") + `<path d="M16 8v16M10 14h12" stroke="${GOLD}" stroke-width="2.6"/>`, 16, 14, "default"),
  // A star in a ring: loose the spell here.
  cast: cursor(
    `<circle cx="16" cy="16" r="12" fill="none" stroke="${INK}" stroke-width="4"/><circle cx="16" cy="16" r="12" fill="none" stroke="#ff8a3a" stroke-width="2"/>` +
      outlined("M16 7l2.4 6.4L25 16l-6.6 2.6L16 25l-2.4-6.4L7 16l6.6-2.6z", "#ffd24a", 1.2),
    16, 16, "crosshair",
  ),
  box: "crosshair",
};

// While placing something, the cursor is a picture of that thing. Each sits
// to the lower right of a gold point at the top left, which is the spot that
// will be built on or struck.
const POINT = `<circle cx="4" cy="4" r="3" fill="${GOLD}" stroke="${INK}" stroke-width="1.4"/>`;
const STONE = "#b9b3a6";
const WOODEN = "#8a5a2b";
const RED = "#c71a21";
const placing = (body: string) => cursor(POINT + body, 4, 4, "crosshair");

const PLACING: Record<string, string> = {
  // Town: two houses, one behind the other.
  City: placing(
    outlined("M15 19l6-6 6 6v10H15z", "#e8dcc0") + outlined("M14 19l7-7 7 7", RED, 1.4) +
      outlined("M7 23l5-5 5 5v6H7z", "#e8dcc0") + outlined("M6 23l6-6 6 6", RED, 1.4),
  ),
  // Keep: a square tower with battlements.
  "Defense Post": placing(
    outlined("M10 29V13h3v-3h3v3h3v-3h3v3h3v16z", STONE) + outlined("M16 29v-6a2 2 0 0 1 4 0v6z", INK, 0.8),
  ),
  // Harbour: a jetty on piles, and water under it.
  Port: placing(
    outlined("M8 17h20v4H8z", WOODEN) +
      `<path d="M11 21v8M17 21v8M23 21v8" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M11 21v8M17 21v8M23 21v8" stroke="${WOODEN}" stroke-width="1.8" stroke-linecap="round"/>` +
      `<path d="M7 28q3-3 6 0t6 0 6 0 5 0" fill="none" stroke="${INK}" stroke-width="3"/><path d="M7 28q3-3 6 0t6 0 6 0 5 0" fill="none" stroke="#7fd0e6" stroke-width="1.5"/>`,
  ),
  // Market: a stall under a striped awning.
  Factory: placing(
    outlined("M9 19h20v10H9z", WOODEN) + outlined("M7 12h24l-2 8H9z", "#f1ead8") +
      `<path d="M13 12l-1 8M19 12v8M25 12l1 8" stroke="${RED}" stroke-width="3"/>`,
  ),
  // War galley: a hull with a ram, one square sail.
  Warship: placing(
    outlined("M7 21h22l3 2-5 6H11z", WOODEN) + outlined("M12 8h12v11H12z", RED) +
      `<path d="M18 7v15" stroke="${INK}" stroke-width="1.6"/>`,
  ),
  // Ballista tower: a great crossbow.
  "SAM Launcher": placing(
    `<path d="M9 14q10-9 20 0" fill="none" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/><path d="M9 14q10-9 20 0" fill="none" stroke="${WOODEN}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<path d="M9 14h20" stroke="${INK}" stroke-width="1.2"/>` +
      outlined("M17.6 8h2.8v19h-2.8z", "#c9a56a") + outlined("M19 4l3 5h-6z", "#d8dce2"),
  ),
  // Mage tower: a thin tower, a pointed roof, a light at the top.
  "Missile Silo": placing(
    outlined("M15 29V16h8v13z", STONE) + outlined("M13 16l6-10 6 10z", "#6a3fa6") +
      `<circle cx="19" cy="5" r="2.4" fill="#9ff3ff" stroke="${INK}" stroke-width="1.1"/>`,
  ),
  // Fireball.
  "Atom Bomb": placing(
    outlined("M19 8c2 4 8 6 8 13a8 8 0 0 1-16 0c0-4 2-5 3-8 1 2 2 3 3 3 0-3 1-5 2-8z", "#ff8a1c") +
      outlined("M19 17c1 2 4 3 4 6a4 4 0 0 1-8 0c0-2 2-3 4-6z", "#ffe27a", 1),
  ),
  // Dragon: a horned head, jaws open.
  "Hydrogen Bomb": placing(
    outlined("M9 28V18l3-6-2-6 6 4 5 1 7 4 2 3-1 2h-8l6 4-8 2-3 3z", "#2f8a4a") +
      outlined("M23 21l8 1.5-5 1.5z", "#ff8a1c", 1) + `<circle cx="19.5" cy="14.5" r="1.5" fill="${GOLD}" stroke="${INK}" stroke-width="0.8"/>`,
  ),
  // Starfall: three stars coming down.
  MIRV: placing(
    `<path d="M13 9l5 8M22 8l4 9M12 19l3 6" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M13 9l5 8M22 8l4 9M12 19l3 6" stroke="#ffd98a" stroke-width="1.6" stroke-linecap="round"/>` +
      outlined("M19 15l1.5 3 3.3.4-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.4z", "#fff3b0", 1.1) +
      outlined("M27 16l1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z", "#fff3b0", 1) +
      outlined("M15.5 24l.8 1.7 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.7.9.3-1.9-1.3-1.3 1.9-.3z", "#fff3b0", 1),
  ),
};

/**
 * Sets the cursor shown over the map. Cheap to call every frame. While
 * placing, pass what is being placed and the cursor becomes a picture of it.
 */
export function setCursor(canvas: HTMLElement, kind: CursorKind, placed?: string | null) {
  const picture = (kind === "build" || kind === "cast") && placed ? PLACING[placed] : undefined;
  // Remembered on the canvas itself: each game makes a new one.
  const key = picture ? `${kind}:${placed}` : kind;
  if (canvas.dataset.cursor === key) return;
  canvas.dataset.cursor = key;
  canvas.style.cursor = picture ?? DRAWN[kind];
}
