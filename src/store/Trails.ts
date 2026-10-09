// Sea trails: the ribbon a longship lays on the water from where it put to
// sea to where it is now. Pure data, shared by the catalogue (what is for
// sale) and the renderer (render/SeaTrails.ts, which knows the styles).

import { GLYPHS } from "./Cloths";

/** How the ribbon is figured. The numbers are the shader's. */
export const STYLE = {
  solid: 0,
  /** Colours banded along the ribbon, blending one into the next. */
  gradient: 1,
  /** The whole ribbon one colour at a time, drifting through them. */
  shift: 2,
  /** A centre stripe and two borders, lengthwise. */
  stripe: 3,
  chevron: 4,
  check: 5,
  /** Diagonal stripes, like a barber's pole. */
  barber: 6,
  /** A dashed centre line. */
  dash: 7,
  rainbow: 8,
  /** A rainbow that runs along the ribbon. */
  flow: 9,
  glyph: 10,
  /** Scalloped borders, like lace or surf. */
  scallop: 11,
  /** Flickering fire. */
  flame: 12,
  /** Twinkling lights. */
  twinkle: 13,
  /** Three colours side by side, lengthwise. */
  tricolour: 14,
} as const;

type RGB = [number, number, number];
/** "team" stands for the owner's own colour. */
type Ink = RGB | "team";

export interface Trail {
  key: string;
  name: string;
  blurb: string;
  crowns: number;
  style: number;
  colors: [Ink, Ink, Ink];
  /** For glyph trails: the symbol's place in the glyph atlas. */
  glyph?: number;
}

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];
const ink = (c: string): Ink => (c === "team" ? "team" : hex(c));

const t = (
  key: string, name: string, blurb: string, crowns: number, style: number, a: string, b = a, c = b,
): Trail => ({ key, name, blurb, crowns, style, colors: [ink(a), ink(b), ink(c)] });

const WHITE = "#f1ece0";
const GOLD = "#f2c23c";
const BLACK = "#15110f";

const FIGURED: Trail[] = [
  t("default", "Wake", "Plain white water.", 0, STYLE.solid, WHITE),

  // One colour.
  t("team", "House colours", "A ribbon in your own colour.", 100, STYLE.solid, "team"),
  t("gold", "Cloth of gold", "A golden road across the sea.", 150, STYLE.solid, GOLD),
  t("blood", "Blood in the water", "Red, for those who come to kill.", 150, STYLE.solid, "#c2181c"),
  t("ink", "Squid ink", "Black as the deep.", 150, STYLE.solid, BLACK),
  t("royal", "Royal purple", "The dye of emperors.", 150, STYLE.solid, "#7a3fc4"),

  // Gradients along the ribbon.
  t("sunset", "Sunset", "Gold into rose into dusk.", 250, STYLE.gradient, "#ffc24a", "#f0527a", "#5a2f9c"),
  t("aurora", "Northern lights", "Green, teal and violet.", 250, STYLE.gradient, "#3df0a0", "#27b6d6", "#8a4be0"),
  t("deep", "The deep", "From shallows to abyss.", 250, STYLE.gradient, "#7fe3ea", "#2a7fd0", "#141f5c"),
  t("ember", "Ember", "Coal, flame and ash.", 250, STYLE.gradient, "#ffd45a", "#e8541e", "#3a1512"),
  t("frost", "Hoarfrost", "White, ice and steel.", 250, STYLE.gradient, "#ffffff", "#9fdcf5", "#5b7fa8"),
  t("forest", "Greenwood", "Leaf, moss and bark.", 250, STYLE.gradient, "#b7e05a", "#3f9a4a", "#5a3d22"),
  t("teamfade", "House fade", "Your colour, fading to white and back.", 250, STYLE.gradient, "team", WHITE, "team"),
  t("bruise", "Bruise", "Purple, black and blue.", 250, STYLE.gradient, "#8a3fb0", BLACK, "#2f56c4"),

  // Colours that drift over time.
  t("pulse", "Heartbeat", "Your colour, pulsing to white.", 300, STYLE.shift, "team", WHITE, "team"),
  t("mood", "Changeable", "It cannot make up its mind.", 350, STYLE.shift, "#f0527a", "#f2c23c", "#27b6d6"),
  t("alarm", "Beacon", "A warning fire, flaring and fading.", 300, STYLE.shift, "#e0201c", WHITE, "#e0201c"),
  t("witch", "Witchlight", "Green to violet and back.", 350, STYLE.shift, "#4dff8a", "#b04dff", "#2ad0c0"),

  // Lengthwise stripes.
  t("teamstripe", "House stripe", "White water with your colour down the middle.", 200, STYLE.stripe, "team", WHITE, GOLD),
  t("regal", "Royal road", "Purple, bordered in gold.", 250, STYLE.stripe, "#7a3fc4", GOLD, WHITE),
  t("crusader", "Crusader's road", "White, with a red stripe.", 250, STYLE.stripe, "#c2181c", WHITE, "#c2181c"),
  t("mourning", "Mourning band", "Black, edged in silver.", 250, STYLE.stripe, BLACK, "#c9ccd2", "#c9ccd2"),
  t("tricolour", "Tricolour", "Blue, white and red, side by side.", 250, STYLE.tricolour, "#2c56b3", WHITE, "#c2181c"),
  t("teamtri", "House tricolour", "Your colour between white and gold.", 250, STYLE.tricolour, WHITE, "team", GOLD),
  t("imperial", "Imperial", "Black, red and gold.", 250, STYLE.tricolour, BLACK, "#c2181c", GOLD),
  t("verdant", "Green and gold", "Green, white and gold.", 250, STYLE.tricolour, "#2f8a4a", WHITE, GOLD),

  // Patterns.
  t("chevrons", "Chevrons", "Arrows, pointing where you are going.", 300, STYLE.chevron, "team", WHITE),
  t("goldchev", "Gilded chevrons", "Gold on black, pointing the way.", 350, STYLE.chevron, GOLD, BLACK),
  t("barber", "Barber's pole", "Red and white, round and round.", 300, STYLE.barber, "#c2181c", WHITE),
  t("teambarber", "House twist", "Your colour, twisted with white.", 300, STYLE.barber, "team", WHITE),
  t("chequer", "Chequered", "A treasurer's board, laid on the sea.", 300, STYLE.check, BLACK, WHITE),
  t("teamcheck", "House chequer", "Your colour and white, chequered.", 300, STYLE.check, "team", WHITE),
  t("harlequin", "Harlequin", "Red and gold, chequered.", 350, STYLE.check, "#c2181c", GOLD),
  t("surf", "Surf", "Blue water, scalloped in foam.", 300, STYLE.scallop, "#2a8fd0", WHITE),
  t("lace", "Lace", "Your colour, edged in lace.", 300, STYLE.scallop, "team", WHITE),
  t("goldlace", "Gold lace", "Crimson, edged in gold.", 350, STYLE.scallop, "#9c1420", GOLD),

  t("mosaic", "Mosaic", "Gold and lapis, laid in squares.", 350, STYLE.check, "#f2c23c", "#2c46a8"),
  t("goldbarber", "Gilded cord", "Gold and black, twisted like rope.", 350, STYLE.barber, "#f2c23c", "#15110f"),
  t("illuminated", "Illuminated", "Vermilion, lapis and gold leaf.", 300, STYLE.gradient, "#d2301c", "#2c46a8", "#f2c23c"),

  // Showpieces.
  t("fire", "Wake of fire", "The sea is burning behind you.", 600, STYLE.flame, "#b0180c", "#ff8a1c", "#fff0a0"),
  t("ghostfire", "Ghost fire", "Cold green flame.", 600, STYLE.flame, "#0c5a3a", "#3dffa0", "#e8fff0"),
  t("bluefire", "Wizard's fire", "It burns blue, and wet.", 600, STYLE.flame, "#1a2f9c", "#3a9cff", "#e0f4ff"),
  t("stars", "Starlight", "The night sky, laid on the water.", 500, STYLE.twinkle, "#141a44", "#fff6c8"),
  t("fairy", "Marsh lights", "Will-o-the-wisps, in your own colour.", 500, STYLE.twinkle, "team", WHITE),
  t("treasure", "Treasure fleet", "Black water, glittering with gold.", 500, STYLE.twinkle, BLACK, GOLD),
];

/** Charges from the cloth atlas, repeated along a band. */
const GLYPH_TRAILS: [key: string, name: string, blurb: string, crowns: number, band: string][] = [
  ["fleur", "Road of lilies", "Fleurs-de-lis on royal blue.", 350, "#2c46a8"],
  ["crowns", "Road of crowns", "Royalty passed this way.", 350, "#7a1c24"],
  ["crosses", "Pilgrim's road", "Crosses, all the way across.", 350, "#9c1420"],
  ["pattee", "Templar's road", "The cross of the order, on black.", 400, "#15110f"],
  ["stars", "Road of stars", "Stars on midnight blue.", 350, "#141a44"],
  ["anchors", "Road of anchors", "Somebody will want those back.", 350, "#1f5f7a"],
  ["swords", "Road of swords", "They know why you are coming.", 350, "#4a2a2a"],
  ["hearts", "Road of hearts", "An invasion, with love.", 350, "#b02a5a"],
  ["skulls", "Road of death's heads", "A warning to whoever follows.", 400, "#1a1614"],
  ["roses", "Road of roses", "Petals on the water.", 350, "#7a1c3a"],
  ["towers", "Road of towers", "A wall across the sea.", 350, "#4a4e58"],
  ["horses", "Road of chargers", "The cavalry is coming, by boat.", 350, "#5a3d22"],
  ["tridents", "Road of tridents", "The sea-lord's own.", 350, "#12384a"],
  ["keys", "Road of keys", "Every lock in the realm, opened.", 400, "#2f5f2a"],
  ["chalices", "Road of chalices", "A procession of cups.", 400, "#5a1f4a"],
  ["ermine", "Road of ermine", "A duke's mantle, unrolled on the water.", 450, "#efe9da"],
  ["bells", "Road of bells", "You can hear this one coming.", 400, "#1f4a2a"],
  ["axes", "Road of axes", "Headsman's progress.", 400, "#3a1512"],
  ["arrows", "Road of arrows", "All pointing the same way: at them.", 400, "#2a3a2a"],
  ["shields", "Road of shields", "A shield-wall, laid flat.", 400, "#2c46a8"],
  ["horseshoes", "Road of horseshoes", "Luck, all the way over.", 400, "#4a2f18"],
  ["jester", "Fool's road", "Bells, bobbing in the swell.", 450, "#3a1f5a"],
];

export const TRAILS: Trail[] = [
  ...FIGURED,
  ...GLYPH_TRAILS.flatMap(([key, name, blurb, crowns, band]): Trail[] => {
    const glyph = GLYPHS.findIndex((g) => g.key === key);
    if (glyph < 0) return [];
    return [{ key: `g:${key}`, name, blurb, crowns, style: STYLE.glyph, colors: [hex(band), hex(band), hex(band)], glyph }];
  }),
];

const BY_KEY = new Map(TRAILS.map((trail) => [trail.key, trail]));

/** The trail for a variant name; the plain wake if it is unknown. */
export const trailFor = (variant: string | undefined): Trail => BY_KEY.get(variant ?? "default") ?? TRAILS[0];
