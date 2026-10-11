// How much the game draws. Three levels: "high" is everything; "medium" is
// for phones and modest machines; "low" is for a browser drawing without a
// graphics card, or anything else that cannot keep up.
//
// Left on "auto", the level is guessed from the device when the page opens
// and lowered a step whenever the game is seen to be running slowly. The
// player can also fix it by hand, which stops the guessing.
//
// The parts of the renderer read the settings below each frame (or when
// `version` changes), so a change takes hold in the middle of a game. The
// one exception is edge smoothing, which a browser fixes when the picture is
// first set up: that follows the level at the start of each game.

export type Level = "high" | "medium" | "low";
export type Choice = "auto" | Level;

const ORDER: Level[] = ["high", "medium", "low"];
const CHOICE = "crusades.graphics";
const FLOOR = "crusades.graphics.floor";
/** How long a lowering made for slowness is remembered: the machine may only have been busy. */
const FLOOR_LASTS = 3 * 24 * 3600 * 1000;

/** Names a browser gives the renderer when it is drawing in software. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // No storage: the setting lasts for this visit only.
  }
}

const worse = (a: Level, b: Level): Level => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

class Quality {
  /** What the player asked for. */
  choice: Choice = "auto";
  /** What is in force. */
  level: Level = "high";
  /** Goes up whenever the level changes; the renderer watches it. */
  version = 0;
  private phone = false;
  private software = false;
  /** The lowest the game has had to go to run smoothly, while on auto. */
  private floor: Level = "high";

  constructor() {
    if (typeof window === "undefined") return;
    this.phone = window.matchMedia("(pointer: coarse)").matches;
    const saved = read(CHOICE);
    if (saved === "high" || saved === "medium" || saved === "low") this.choice = saved;
    const [floor, until] = (read(FLOOR) ?? "").split("|");
    if ((floor === "medium" || floor === "low") && Number(until) > Date.now()) this.floor = floor;
    this.settle();
  }

  /** The level a device like this one should start on. */
  private guess(): Level {
    if (this.software) return "low";
    const nav = navigator as Navigator & { deviceMemory?: number };
    const modest = (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) || (navigator.hardwareConcurrency ?? 8) <= 4;
    return this.phone || modest ? "medium" : "high";
  }

  private settle() {
    const next = this.choice === "auto" ? worse(this.guess(), this.floor) : this.choice;
    if (next === this.level) return;
    this.level = next;
    this.version++;
  }

  /** The player's own setting; "auto" hands it back to the game. */
  set(choice: Choice) {
    this.choice = choice;
    write(CHOICE, choice === "auto" ? null : choice);
    if (choice === "auto") {
      // Asking for auto again is a fresh start.
      this.floor = "high";
      write(FLOOR, null);
    }
    this.settle();
  }

  /** Told what is doing the drawing, once a picture has been set up. */
  noteRenderer(name: string) {
    const software = SOFTWARE.test(name);
    if (software === this.software) return;
    this.software = software;
    this.settle();
  }

  /**
   * The game is running slowly: go down a level, if on auto and not already
   * at the bottom. Returns whether anything changed.
   */
  lower(): boolean {
    if (this.choice !== "auto" || this.level === "low") return false;
    this.floor = ORDER[ORDER.indexOf(this.level) + 1];
    write(FLOOR, `${this.floor}|${Date.now() + FLOOR_LASTS}`);
    this.settle();
    return true;
  }

  /** Picture elements drawn for each point of the page's own measure. */
  get pixelRatio(): number {
    const dpr = window.devicePixelRatio || 1;
    if (this.level === "high") return Math.min(dpr, this.phone ? 1.5 : 2);
    if (this.level === "medium") return Math.min(dpr, 1);
    // Low: well under the screen's own resolution, stretched to fit.
    return this.phone ? 0.7 : 0.6;
  }

  /** Edge smoothing. Read once, when a game's picture is set up. */
  get antialias(): boolean {
    return this.level === "high";
  }

  /** How much of the woods is planted, 0 to 1. */
  get treeShare(): number {
    return this.level === "high" ? 1 : this.level === "medium" ? 0.4 : 0;
  }

  /** How many of each company's soldiers are drawn, 0 to 1. */
  get soldierShare(): number {
    return this.level === "high" ? 1 : this.level === "medium" ? 0.6 : 0.35;
  }

  /** Smoke, sparks, dust and trails. The great blasts are always drawn. */
  get particles(): boolean {
    return this.level !== "low";
  }

  /** Most frames drawn in a second; 0 for as many as the screen shows. */
  get frameCap(): number {
    return this.level === "low" ? 30 : 0;
  }

  /** Whether the landing page should run its live world. */
  get backdrop(): boolean {
    return this.level !== "low";
  }
}

export const quality = new Quality();

/**
 * Watches how long frames take and says when the game has been slow for long
 * enough to be worth lowering the level. One per game.
 */
export class SlowWatch {
  private slowFor = 0;
  private since = 0;

  /** Call each frame with the seconds since the last. True when it is time to go down a level. */
  frame(dt: number): boolean {
    // A long gap is a tab coming back or the machine waking, not slowness.
    if (dt > 0.5) return false;
    this.since += dt;
    // The first seconds of a game are busy with loading; so are those after a change.
    if (this.since < 8) return false;
    // Slower than about 24 frames a second counts; anything better eases the tally.
    if (dt > 0.042) this.slowFor += dt;
    else this.slowFor = Math.max(0, this.slowFor - dt * 2);
    if (this.slowFor < 4) return false;
    this.slowFor = 0;
    this.since = 0;
    return true;
  }
}
