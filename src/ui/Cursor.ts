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

/** Sets the cursor shown over the map. Cheap to call every frame. */
export function setCursor(canvas: HTMLElement, kind: CursorKind) {
  // Remembered on the canvas itself: each game makes a new one.
  if (canvas.dataset.cursor === kind) return;
  canvas.dataset.cursor = kind;
  canvas.style.cursor = DRAWN[kind];
}
