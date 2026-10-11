// The wheel that opens under a right-click: one thing to do in the middle,
// the rest in a ring around it. A slice can open a ring of its own (what to
// build, what to give), and then the middle becomes the way back.
//
// It knows nothing of the game: the HUD hands it slices and it draws them.

export interface Slice {
  /** A drawing (the inside of a 24×24 SVG) or a single glyph. */
  icon: string;
  label: string;
  /** A second, smaller line: a cost, a count. */
  sub?: string;
  /** Said under the wheel while the pointer is on the slice. */
  about?: string;
  disabled?: boolean;
  tone?: "bad";
  /** The colour of the slice, by what kind of thing it does. */
  tint?: "info" | "sail" | "pact" | "attack" | "build";
  act?: () => void;
  /** Opens a ring of these instead of acting. */
  children?: () => Slice[] | Promise<Slice[]>;
}

export interface Wheel {
  /** The middle; null leaves it empty. */
  centre: Slice | null;
  slices: Slice[];
  /** Shown under the wheel when nothing is pointed at. */
  caption: string;
  /** Icons only, drawn large: the caption under the wheel names them. */
  bare?: boolean;
}

// Drawings, in the manner of the cursors: plain strokes, gold on dark.
export const ICON = {
  sword: `<path d="M20 3l-9.5 9.5M20 3v4l-8.5 8.5-3-3L17 4zM7.5 13.5l4 4M4 20l3.5-3.5"/>`,
  hammer: `<path d="M13 3.5l7 7-3 3-7-7zM11.5 8.5L4 16l3.5 3.5L15 12"/>`,
  ship: `<path d="M3 15h18l-3 5H6zM12 4v11M12 5l6 8h-6z"/>`,
  pact: `<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>`,
  broken: `<circle cx="8" cy="12" r="4.5"/><circle cx="16" cy="12" r="4.5"/><path d="M5 20L19 4"/>`,
  scroll: `<path d="M7 4h11v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10v1M9.5 8.5h6M9.5 12h6"/>`,
  gift: `<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1-3-5-4-5-1.5S10 7 12 7zm0 0c1-3 5-4 5-1.5S14 7 12 7z"/>`,
  coin: `<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M14.5 9.5c-.5-1-4.5-1.3-4.5.8 0 2.200 4.500 1.200 4.500 3.400 0 2.100-4.200 1.800-4.800.6"/>`,
  men: `<circle cx="8" cy="8" r="3"/><circle cx="16.500" cy="9" r="2.500"/><path d="M2.500 20c0-4 2.500-6 5.500-6s5.500 2 5.500 6M15 14.500c3-.5 6 1 6 5"/>`,
  flame: `<path d="M12 3c1.500 3.500 6 5.500 6 11a6 6 0 0 1-12 0c0-3 1.500-4 2.500-6.500.800 1.500 1.500 2.200 2.300 2.300C10.500 7.500 11 5.500 12 3z"/>`,
  back: `<path d="M14.500 5.500L8 12l6.500 6.500"/>`,
} as const;

const SIZE = 268;
const C = SIZE / 2;
const INNER = 47;
const OUTER = 126;
const MID = (INNER + OUTER) / 2;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const at = (r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + Math.cos(a) * r, C + Math.sin(a) * r];
};

/** The outline of one slice of the ring, from angle a to angle b (degrees, clockwise from the top). */
function sector(a: number, b: number): string {
  const [x1, y1] = at(OUTER, a);
  const [x2, y2] = at(OUTER, b);
  const [x3, y3] = at(INNER, b);
  const [x4, y4] = at(INNER, a);
  const big = b - a > 180 ? 1 : 0;
  const f = (n: number) => n.toFixed(2);
  return `M${f(x1)} ${f(y1)}A${OUTER} ${OUTER} 0 ${big} 1 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${INNER} ${INNER} 0 ${big} 0 ${f(x4)} ${f(y4)}Z`;
}

const drawing = (icon: string, px: number) =>
  icon.startsWith("<")
    ? `<svg viewBox="0 0 24 24" width="${px}" height="${px}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`
    : `<i style="font-size:${Math.round(px * 0.92)}px">${icon}</i>`;

let root: HTMLElement | null = null;
let stack: Wheel[] = [];

export function radialOpen(): boolean {
  return root !== null && !root.hidden;
}

export function closeRadial() {
  if (root) root.hidden = true;
  stack = [];
}

function render(wheel: Wheel, fresh: boolean) {
  const box = root!;
  const n = wheel.slices.length;
  // A crowded ring has no room for words: there the icons stand alone and the
  // caption under the wheel does the talking.
  const crowded = n > 6 || wheel.bare === true;
  const span = n > 0 ? 360 / n : 360;
  const gap = n > 1 ? 1.6 : 0;
  let shapes = "";
  let words = "";
  wheel.slices.forEach((s, i) => {
    const mid = i * span;
    const cls = `slice${s.disabled ? " off" : ""}${s.tone === "bad" ? " bad" : ""}${s.tint ? ` t-${s.tint}` : ""}`;
    shapes +=
      n === 1
        ? `<path class="${cls}" data-i="${i}" fill-rule="evenodd" d="M${C - OUTER} ${C}a${OUTER} ${OUTER} 0 1 0 ${OUTER * 2} 0a${OUTER} ${OUTER} 0 1 0 ${-OUTER * 2} 0M${C - INNER} ${C}a${INNER} ${INNER} 0 1 0 ${INNER * 2} 0a${INNER} ${INNER} 0 1 0 ${-INNER * 2} 0"/>`
        : `<path class="${cls}" data-i="${i}" d="${sector(mid - span / 2 + gap, mid + span / 2 - gap)}"/>`;
    const [x, y] = at(MID, mid);
    words +=
      `<div class="slice-face${s.disabled ? " off" : ""}${s.tone === "bad" ? " bad" : ""}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">` +
      drawing(s.icon, wheel.bare ? 34 : crowded ? 26 : 24) +
      (crowded ? "" : `<b>${esc(s.label)}</b>`) +
      (s.sub ? `<span>${esc(s.sub)}</span>` : "") +
      `</div>`;
  });
  const deep = stack.length > 1;
  const centre: Slice | null = deep ? { icon: ICON.back, label: "Back" } : wheel.centre;
  box.innerHTML =
    `<div class="wheel${fresh ? " fresh" : ""}">` +
    `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${shapes}` +
    (centre
      ? `<circle class="hub${centre.disabled ? " off" : ""}${deep ? " back" : ""}" data-i="hub" cx="${C}" cy="${C}" r="${INNER - 5}"/>`
      : "") +
    `</svg>${words}` +
    (centre
      ? `<div class="slice-face hub-face${centre.disabled ? " off" : ""}" style="left:${C}px;top:${C}px">${drawing(centre.icon, 26)}<b>${esc(centre.label)}</b>${centre.sub ? `<span>${esc(centre.sub)}</span>` : ""}</div>`
      : "") +
    `</div><div class="wheel-caption"></div>`;
  const caption = box.querySelector<HTMLElement>(".wheel-caption")!;
  const say = (s: Slice | null) => {
    caption.innerHTML = s
      ? `<b>${esc(s.label)}${s.sub ? ` · ${esc(s.sub)}` : ""}</b>${s.about ? `<span>${esc(s.about)}</span>` : ""}`
      : `<b>${esc(wheel.caption)}</b>`;
  };
  say(null);
  for (const shape of Array.from(box.querySelectorAll<SVGElement>("[data-i]"))) {
    const hub = shape.dataset.i === "hub";
    const s = hub ? centre! : wheel.slices[Number(shape.dataset.i)];
    shape.addEventListener("pointerenter", () => say(s));
    shape.addEventListener("pointerleave", () => say(null));
    shape.addEventListener("click", async () => {
      if (hub && deep) {
        stack.pop();
        return render(stack[stack.length - 1], false);
      }
      if (s.disabled) return;
      if (s.children) {
        const here = stack.length;
        const slices = await s.children();
        // Closed, or moved on, while the answer was coming.
        if (!radialOpen() || stack.length !== here) return;
        const next: Wheel = { centre: null, slices, caption: s.label };
        stack.push(next);
        return render(next, false);
      }
      closeRadial();
      s.act?.();
    });
  }
}

/** Opens the wheel centred on a point of the page, kept wholly on screen. */
export function openRadial(clientX: number, clientY: number, wheel: Wheel) {
  if (!root) {
    root = document.getElementById("radial");
    if (!root) return;
    // A press anywhere else puts it away.
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (radialOpen() && !root!.contains(e.target as Node)) closeRadial();
      },
      true,
    );
    root.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  const half = SIZE / 2 + 8;
  const x = Math.min(Math.max(clientX, half), window.innerWidth - half);
  // Room below for the caption.
  const y = Math.min(Math.max(clientY, half), window.innerHeight - half - 44);
  root.style.left = `${x}px`;
  root.style.top = `${y}px`;
  root.hidden = false;
  stack = [wheel];
  render(wheel, true);
}
