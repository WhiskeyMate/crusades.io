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
  { key: "vair", id: 13, name: "Vair", blurb: "The squirrel-fur of kings: rows of little bells.", crowns: 300 },
  { key: "fretty", id: 14, name: "Fretty", blurb: "A trellis of interlaced bands.", crowns: 300 },
  { key: "camo", id: 15, name: "Motley", blurb: "Blotched like a jester's coat.", crowns: 300 },
];

const sym = (key: string, glyph: string, name: string, blurb: string, crowns = 250): GlyphCloth => ({
  key, glyph: glyph + "\uFE0E", name, blurb, crowns,
});
/** A charge drawn by hand in the atlas (see render/Cloth.ts). */
const drawn = (key: string, name: string, blurb: string, crowns = 300): GlyphCloth => ({
  key, glyph: `custom:${key}`, name, blurb, crowns,
});

/**
 * Order is the atlas order (ids are index + 32). Everything here is a
 * heraldic charge, printed in a pale tincture on the realm's colour: no
 * pictures, nothing a herald of 1300 would not have recognised.
 */
export const GLYPHS: GlyphCloth[] = [
  sym("fleur", "⚜", "Fleurs-de-lis", "Semy of lilies, in the French manner."),
  sym("crowns", "♛", "Crowns", "A field of crowns. Presumptuous."),
  sym("crosses", "✚", "Crosses", "Semy of crosses, for the pious."),
  sym("stars", "★", "Mullets", "Strewn with five-pointed stars."),
  sym("towers", "♜", "Towers", "Castles upon castles."),
  sym("horses", "♞", "Chargers", "Knights' horses, row on row."),
  sym("swords", "⚔", "Crossed swords", "No one will mistake your intent."),
  sym("anchors", "⚓", "Anchors", "For lords of the coast."),
  sym("moons", "☾", "Crescents", "A field of crescent moons."),
  sym("suns", "☀", "Suns in splendour", "The sun, many times over."),
  sym("hearts", "♥", "Hearts", "Semy of hearts. Disarming."),
  sym("skulls", "☠", "Death's heads", "A warning, repeated.", 300),
  sym("spades", "♠", "Pikeheads", "Spear-points, row on row."),
  sym("clubs", "♣", "Trefoils", "Three-leaved, for luck."),
  sym("kings", "♚", "Royal crowns", "The closed crown of a king."),
  sym("mitres", "♝", "Mitres", "For prince-bishops."),
  sym("pattee", "✠", "Crosses pattée", "The cross of the military orders.", 300),
  sym("jerusalem", "☩", "Crosses potent", "As borne by the kings of Jerusalem.", 300),
  sym("lorraine", "☨", "Crosses of Lorraine", "Two bars, one faith."),
  sym("roses", "❀", "Roses", "The heraldic rose, five petals."),
  sym("shamrocks", "☘", "Shamrocks", "A field of clover."),
  sym("hammers", "⚒", "Hammers", "For a realm of smiths and miners."),
  sym("tridents", "♆", "Tridents", "Sea-lords only."),
  sym("scales", "⚖", "Scales", "Justice, or at least taxation."),
  sym("lozenge", "♦", "Lozenges", "Diamonds, strewn."),
  sym("estoiles", "✶", "Estoiles", "Six-pointed stars."),
  sym("cinquefoils", "✿", "Cinquefoils", "Five-leaved flowers."),
  sym("quatrefoils", "✤", "Quatrefoils", "Four-leaved, as on a cathedral window."),
  sym("ivy", "❦", "Ivy leaves", "The scribe's flourish, everywhere."),
  sym("pennons", "⚑", "Pennons", "Flags upon your flag."),
  drawn("keys", "Keys", "The keys of the city. All of them."),
  drawn("chalices", "Chalices", "A field of golden cups.", 350),
  drawn("ermine", "Ermine", "The fur of dukes: black tails on white.", 350),
  drawn("horseshoes", "Horseshoes", "Luck, by the hundred."),
  drawn("bells", "Bells", "Ring them all."),
  drawn("axes", "Battle-axes", "A woodsman's realm, or a headsman's.", 350),
  drawn("arrows", "Broad arrows", "Pheons, points down.", 300),
  drawn("shields", "Escutcheons", "Shields upon your shield.", 350),
  drawn("jester", "Jester's caps", "Bells on, all the way down.", 400),
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
