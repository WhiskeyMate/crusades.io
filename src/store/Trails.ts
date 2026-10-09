// Wake trails: the dotted line a longship leaves from where it put to sea
// to where it is now. Pure data, shared by the catalogue (what is for sale)
// and the renderer (how each is drawn).

import { GLYPHS } from "./Cloths";

export type TrailShape = "dot" | "ring" | "diamond" | "glyph";

export interface Trail {
  key: string;
  name: string;
  blurb: string;
  crowns: number;
  shape: TrailShape;
  /** A fixed colour, the owner's colour, or a hue that runs along the line. */
  color: [number, number, number] | "team" | "rainbow";
  /** Size of a mark, in tiles at close zoom. */
  size: number;
  /** Tiles between marks. */
  gap: number;
  /** For glyph trails: the symbol's place in the glyph atlas. */
  glyph?: number;
  meme?: boolean;
}

const dots = (
  key: string, name: string, blurb: string, crowns: number, color: Trail["color"],
  shape: TrailShape = "dot", size = 0.7, gap = 3,
): Trail => ({ key, name, blurb, crowns, shape, color, size, gap });

const PLAIN: Trail[] = [
  dots("default", "Chalk dots", "A plain dotted line.", 0, [0.95, 0.95, 0.9]),
  dots("team", "House colours", "Dots in your own colour.", 100, "team"),
  dots("gold", "Gold dust", "A line of gold across the sea.", 150, [1.0, 0.8, 0.25]),
  dots("blood", "Blood in the water", "Red, for those who come to kill.", 150, [0.85, 0.1, 0.1]),
  dots("ink", "Squid ink", "Black as the deep.", 150, [0.08, 0.07, 0.09]),
  dots("emerald", "Emerald", "Green as envy.", 150, [0.2, 0.85, 0.45]),
  dots("royal", "Royal purple", "The dye of emperors.", 150, [0.62, 0.3, 0.9]),
  dots("ice", "Ice", "Pale blue, northern.", 150, [0.6, 0.9, 1.0]),
  dots("rose", "Rose", "Pink. Unapologetically.", 150, [1.0, 0.5, 0.75]),
  dots("ember", "Embers", "Orange sparks on the swell.", 150, [1.0, 0.5, 0.12]),
  dots("line", "Chalk line", "An unbroken white line.", 200, [0.95, 0.95, 0.9], "dot", 0.42, 0.7),
  dots("teamline", "House line", "An unbroken line in your colour.", 250, "team", "dot", 0.42, 0.7),
  dots("goldline", "Golden thread", "An unbroken line of gold.", 300, [1.0, 0.8, 0.25], "dot", 0.42, 0.7),
  dots("pearls", "String of pearls", "Fat white beads.", 200, [0.97, 0.95, 0.9], "dot", 1.15, 2.6),
  dots("rings", "Ripples", "Rings spreading on the water.", 200, [0.9, 0.97, 1.0], "ring", 1.2, 3.5),
  dots("teamrings", "House rings", "Rings in your colour.", 250, "team", "ring", 1.2, 3.5),
  dots("diamonds", "Lozenges", "A line of white diamonds.", 200, [0.95, 0.95, 0.9], "diamond", 0.95, 3),
  dots("rubies", "Rubies", "A line of red gems.", 250, [0.9, 0.12, 0.2], "diamond", 0.95, 3),
  dots("sapphires", "Sapphires", "A line of blue gems.", 250, [0.2, 0.45, 1.0], "diamond", 0.95, 3),
  dots("rainbow", "Rainbow", "Every colour, in order.", 350, "rainbow", "dot", 0.85, 2.2),
  dots("rainbowline", "Rainbow road", "An unbroken rainbow.", 450, "rainbow", "dot", 0.5, 0.7),
  dots("rainbowgems", "Jewel box", "Gems of every colour.", 400, "rainbow", "diamond", 1.0, 3),
];

/** Symbols and emoji from the cloth atlas that also make a good wake. */
const GLYPH_TRAILS: [key: string, name: string, blurb: string, crowns: number, meme?: boolean][] = [
  ["fleur", "Trail of lilies", "Fleurs-de-lis in your wake.", 250],
  ["crowns", "Trail of crowns", "Royalty passed this way.", 250],
  ["crosses", "Trail of crosses", "A pilgrim's road across the sea.", 250],
  ["stars", "Trail of stars", "Steering by them, leaving them behind.", 250],
  ["anchors", "Trail of anchors", "Somebody will want those back.", 250],
  ["swords", "Trail of swords", "They know why you are coming.", 250],
  ["hearts", "Trail of hearts", "An invasion, with love.", 250],
  ["skulls", "Trail of death's heads", "A warning to whoever follows.", 300],
  ["moons", "Trail of crescents", "Night crossings only.", 250],
  ["suns", "Trail of suns", "Fair weather all the way.", 250],
  ["flames", "Trail of fire", "The sea is burning behind you.", 350],
  ["roses", "Trail of roses", "Petals on the water.", 300],
  ["dragons", "Trail of dragons", "Sea serpents, tamed.", 400],
  ["bees", "Trail of bees", "They follow the ship. Nobody knows why.", 300],
  ["ducks", "Trail of ducklings", "They imprinted on the longship.", 350, true],
  ["frogs", "Trail of frogs", "Hopping mad.", 350, true],
  ["crabs", "Trail of crabs", "Sideways, all the way across.", 350, true],
  ["chickens", "Trail of chickens", "Why did the chicken cross the sea?", 350, true],
  ["rats", "Trail of rats", "They left the ship. Draw your own conclusions.", 350, true],
  ["poop", "Trail of dung", "The bilges needed emptying.", 400, true],
  ["clowns", "Trail of clowns", "The whole circus is coming.", 400, true],
  ["skulls2", "Trail of skulls", "Bones in the wake.", 350, true],
  ["eyes", "Trail of eyes", "The sea watches you leave.", 350, true],
  ["bananas", "Trail of bananas", "A slipping hazard for pursuers.", 350, true],
  ["gold", "Trail of moneybags", "Somebody has a hole in the hold.", 400, true],
  ["cheese", "Trail of cheese", "Leaking provisions.", 350, true],
  ["ale", "Trail of ale", "The crew has been at the barrels.", 350, true],
  ["peppers", "Trail of peppers", "A spicy crossing.", 350, true],
  ["cats", "Trail of smirking cats", "They know something.", 400, true],
  ["moai", "Trail of stone heads", "Unbothered, and somehow floating.", 450, true],
  ["hundred", "Trail of hundreds", "A flawless crossing.", 400, true],
  ["smug", "Trail of smug faces", "You meant to land there.", 500, true],
  ["jester", "Trail of jester's caps", "Bells, bobbing in the swell.", 450, true],
];

export const TRAILS: Trail[] = [
  ...PLAIN,
  ...GLYPH_TRAILS.flatMap(([key, name, blurb, crowns, meme]): Trail[] => {
    const glyph = GLYPHS.findIndex((g) => g.key === key);
    if (glyph < 0) return [];
    return [{ key: `g:${key}`, name, blurb, crowns, shape: "glyph", color: [1, 1, 1], size: 1.9, gap: 4.5, glyph, meme }];
  }),
];

const BY_KEY = new Map(TRAILS.map((t) => [t.key, t]));

/** The trail for a variant name; the plain dotted line if it is unknown. */
export const trailFor = (variant: string | undefined): Trail => BY_KEY.get(variant ?? "default") ?? TRAILS[0];

/** The colour of mark `i` along a trail. */
export function trailColor(trail: Trail, team: readonly number[], i: number): [number, number, number] {
  if (trail.color === "team") return [team[0], team[1], team[2]];
  if (trail.color === "rainbow") {
    const h = i * 0.09;
    return [
      0.55 + 0.45 * Math.cos(6.2832 * h),
      0.55 + 0.45 * Math.cos(6.2832 * (h + 0.33)),
      0.55 + 0.45 * Math.cos(6.2832 * (h + 0.67)),
    ];
  }
  return trail.color;
}
