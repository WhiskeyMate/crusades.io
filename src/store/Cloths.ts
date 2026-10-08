// Territory cloths: the list of patterns a realm's land can be painted with.
// Pure data, shared by the catalogue (what is for sale) and the renderer
// (how each is drawn). Procedural patterns are computed in the shader;
// glyph patterns repeat a symbol or emoji drawn into an atlas.

export interface ProceduralCloth {
  key: string;
  /** The number the shader knows it by (1..31). */
  id: number;
  name: string;
  blurb: string;
  crowns: number;
}

export interface GlyphCloth {
  key: string;
  /** The symbol to repeat. "custom:<name>" is drawn by hand in the atlas. */
  glyph: string;
  /** Plain symbols are printed in a pale tincture; emoji keep their colours. */
  emoji: boolean;
  name: string;
  blurb: string;
  crowns: number;
}

export const PROCEDURAL: ProceduralCloth[] = [
  { key: "stripes", id: 1, name: "Barry", blurb: "Horizontal bars across your land.", crowns: 150 },
  { key: "checks", id: 2, name: "Chequy", blurb: "A chequered field, as on a treasurer's board.", crowns: 150 },
  { key: "chevrons", id: 3, name: "Chevronny", blurb: "Chevrons marching across your realm.", crowns: 200 },
  { key: "lozenges", id: 4, name: "Lozengy", blurb: "A lattice of diamonds.", crowns: 200 },
  { key: "paly", id: 5, name: "Paly", blurb: "Upright stripes, north to south.", crowns: 150 },
  { key: "bendy", id: 6, name: "Bendy", blurb: "Diagonal bands.", crowns: 150 },
  { key: "dots", id: 7, name: "Bezanty", blurb: "Strewn with roundels like scattered coin.", crowns: 200 },
  { key: "waves", id: 8, name: "Wavy", blurb: "Rolling bars, for a sea power.", crowns: 200 },
  { key: "scales", id: 9, name: "Scaly", blurb: "Overlapping scales, like a wyrm's hide.", crowns: 250 },
  { key: "bricks", id: 10, name: "Masoned", blurb: "Coursed like a castle wall.", crowns: 200 },
  { key: "tartan", id: 11, name: "Tartan", blurb: "A highland weave.", crowns: 250 },
  { key: "honeycomb", id: 12, name: "Honeycomb", blurb: "Cells upon cells.", crowns: 250 },
  { key: "rainbow", id: 13, name: "Rainbow", blurb: "Every colour at once. Subtle it is not.", crowns: 400 },
  { key: "hazard", id: 14, name: "Hazard", blurb: "Black and yellow. They were warned.", crowns: 350 },
  { key: "camo", id: 15, name: "Motley", blurb: "Blotched like a jester's coat.", crowns: 300 },
];

const sym = (key: string, glyph: string, name: string, blurb: string, crowns = 250): GlyphCloth => ({
  key, glyph: glyph + "︎", emoji: false, name, blurb, crowns,
});
const emo = (key: string, glyph: string, name: string, blurb: string, crowns = 350): GlyphCloth => ({
  key, glyph, emoji: true, name, blurb, crowns,
});

/** Order is the atlas order: append only, never reorder (ids are index + 32). */
export const GLYPHS: GlyphCloth[] = [
  sym("fleur", "⚜", "Fleurs-de-lis", "Semy of lilies, in the French manner."),
  sym("crowns", "♛", "Crowns", "A field of crowns. Presumptuous."),
  sym("crosses", "✚", "Crosses", "Semy of crosses, for the pious."),
  sym("stars", "★", "Stars", "Strewn with stars."),
  sym("towers", "♜", "Towers", "Castles upon castles."),
  sym("horses", "♞", "Chargers", "Knights' horses, row on row."),
  sym("swords", "⚔", "Crossed swords", "No one will mistake your intent."),
  sym("anchors", "⚓", "Anchors", "For lords of the coast."),
  sym("moons", "☾", "Crescents", "A field of crescent moons."),
  sym("suns", "☀", "Suns", "The sun in splendour, many times over."),
  sym("hearts", "♥", "Hearts", "Semy of hearts. Disarming."),
  sym("skulls", "☠", "Death's heads", "A warning, repeated."),
  sym("spades", "♠", "Spades", "From the card table to the map."),
  sym("clubs", "♣", "Trefoils", "Three-leaved, for luck."),
  emo("lions", "🦁", "Lions", "The king of beasts, everywhere you rule."),
  emo("eagles", "🦅", "Eagles", "Imperial ambitions."),
  emo("dragons", "🐉", "Dragons", "Here be dragons. Yours.", 450),
  emo("wolves", "🐺", "Wolves", "The pack holds this land."),
  emo("bears", "🐻", "Bears", "Northern and unfriendly."),
  emo("boars", "🐗", "Boars", "Stubborn as its lord."),
  emo("roses", "🌹", "Roses", "A rose for every acre."),
  emo("flames", "🔥", "Flames", "Your land, on fire, on purpose.", 400),
  emo("bees", "🐝", "Bees", "Industrious. Stings."),
  emo("frogs", "🐸", "Frogs", "It is Wednesday in your realm.", 400),
  emo("chickens", "🐔", "Chickens", "Poultry as far as the eye can see.", 400),
  emo("ducks", "🦆", "Ducks", "Quack.", 400),
  emo("crabs", "🦀", "Crabs", "The realm is gone.", 400),
  emo("clowns", "🤡", "Clowns", "An honest statement about your rule.", 500),
  emo("poop", "💩", "Dung", "Fertile land, proudly labelled.", 500),
  emo("skulls2", "💀", "Skulls", "I am deceased.", 400),
  emo("eyes", "👀", "Eyes", "The land is watching.", 400),
  emo("cheese", "🧀", "Cheese", "A dairy power.", 400),
  emo("ale", "🍺", "Ale", "The realm's true religion.", 400),
  emo("gold", "💰", "Moneybags", "Subtle wealth.", 450),
  emo("peppers", "🌶", "Peppers", "Spicy.", 400),
  emo("bananas", "🍌", "Bananas", "Potassium.", 400),
  emo("rats", "🐀", "Rats", "They were here first.", 400),
  emo("cats", "😼", "Smirking cats", "Insufferable.", 450),
  emo("moai", "🗿", "Stone heads", "Unbothered.", 500),
  emo("hundred", "💯", "Hundreds", "Keeping it one hundred, per tile.", 450),
  { key: "smug", glyph: "custom:smug", emoji: true, name: "Smug faces", blurb: "A grinning face that says you meant to do that.", crowns: 600 },
  { key: "jester", glyph: "custom:jester", emoji: true, name: "Jester's caps", blurb: "Bells on, all the way down.", crowns: 500 },
];

export const GLYPH_BASE = 32;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8;

/** The shader's number for a territory variant ("plain", "stripes", "g:fleur", ...). */
export function clothId(variant: string): number {
  if (variant.startsWith("g:")) {
    const i = GLYPHS.findIndex((g) => g.key === variant.slice(2));
    return i < 0 ? 0 : GLYPH_BASE + i;
  }
  return PROCEDURAL.find((p) => p.key === variant)?.id ?? 0;
}
