// Everything that can be bought. Real money buys Crowns (the credit);
// Crowns buy items. Prices in money are set in Stripe; the pack id here is
// what the checkout function looks up, and the Crown amounts are what the
// webhook grants. The database keeps a mirror of the Crown prices, written
// by `npm run catalog-sql`; re-run supabase/schema.sql after changing them.

import { GLYPHS, PROCEDURAL } from "./Cloths";
import { TRAILS } from "./Trails";

export type Slot = "territory" | "banner" | "ships" | "buildings" | "troops" | "trails";

export interface CrownPack {
  id: string;
  name: string;
  crowns: number;
  /** Crowns thrown in on top, shown as a ribbon. */
  bonus: number;
  /** Display price; the real one lives on the Stripe price. */
  price: string;
  /** Env var naming the Stripe price id for this pack. */
  priceEnv: string;
  tier: number;
}

export const PACKS: CrownPack[] = [
  { id: "page", name: "Page", crowns: 100, bonus: 0, price: "$4.99", priceEnv: "STRIPE_PRICE_PAGE", tier: 0 },
  { id: "squire", name: "Squire", crowns: 200, bonus: 50, price: "$9.99", priceEnv: "STRIPE_PRICE_SQUIRE", tier: 1 },
  { id: "knight", name: "Knight", crowns: 400, bonus: 200, price: "$19.99", priceEnv: "STRIPE_PRICE_KNIGHT", tier: 2 },
  { id: "baron", name: "Baron", crowns: 1000, bonus: 500, price: "$49.99", priceEnv: "STRIPE_PRICE_BARON", tier: 3 },
  { id: "duke", name: "Duke", crowns: 2000, bonus: 1500, price: "$99.99", priceEnv: "STRIPE_PRICE_DUKE", tier: 4 },
  { id: "king", name: "King", crowns: 4000, bonus: 4000, price: "$199.99", priceEnv: "STRIPE_PRICE_KING", tier: 5 },
];

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  blurb: string;
  crowns: number;
  /** Which visual variant the renderer uses; "default" is what everyone has. */
  variant: string;
  /** A short label on the card: what kind of thing this is. */
  tag?: "New models" | "Recolour" | "Jest" | "Heraldic" | "Pattern";
  /** Hidden from the store (the default everyone owns). */
  unlisted?: boolean;
}

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const rarityOf = (crowns: number): Rarity =>
  crowns >= 700 ? "legendary" : crowns >= 450 ? "epic" : crowns >= 250 ? "rare" : "common";

export const ITEMS: Item[] = [
  // ------------------------------------------------------------------- troops
  { id: "troops-levy", slot: "troops", name: "Levies", blurb: "Spears and round shields.", crowns: 0, variant: "default", unlisted: true },
  { id: "troops-peasant", slot: "troops", name: "Peasant mob", blurb: "Straw hats and pitchforks. Angrier than they look.", crowns: 250, variant: "peasant", tag: "New models" },
  { id: "troops-mail", slot: "troops", name: "Men-at-arms", blurb: "Mail, kettle helms and kite shields.", crowns: 300, variant: "mail", tag: "New models" },
  { id: "troops-archer", slot: "troops", name: "Longbowmen", blurb: "Hooded archers with bows as tall as themselves.", crowns: 400, variant: "archer", tag: "New models" },
  { id: "troops-monk", slot: "troops", name: "Warrior monks", blurb: "Tonsured, robed, and swinging a blessed stick.", crowns: 400, variant: "monk", tag: "New models" },
  { id: "troops-crusader", slot: "troops", name: "Crusaders", blurb: "White surcoats, great helms and the cross.", crowns: 500, variant: "crusader", tag: "New models" },
  { id: "troops-viking", slot: "troops", name: "Northmen", blurb: "Horned helms, bearded axes and painted shields.", crowns: 500, variant: "viking", tag: "New models" },
  { id: "troops-wizard", slot: "troops", name: "Hedge wizards", blurb: "All beard and hat. Results may vary.", crowns: 600, variant: "wizard", tag: "New models" },
  { id: "troops-skeleton", slot: "troops", name: "The restless dead", blurb: "They have marched before. They did not enjoy it.", crowns: 650, variant: "skeleton", tag: "New models" },
  { id: "troops-ghost", slot: "troops", name: "The unquiet", blurb: "Still loyal. Still carrying the colours. No longer solid.", crowns: 700, variant: "ghost", tag: "New models" },
  { id: "troops-jester", slot: "troops", name: "Company of fools", blurb: "The court jesters, conscripted. Morale is complicated.", crowns: 700, variant: "jester", tag: "Jest" },
  { id: "troops-rabbit", slot: "troops", name: "Killer rabbits", blurb: "From the margins of the psalter, with axes.", crowns: 800, variant: "rabbit", tag: "Jest" },
  { id: "troops-chicken", slot: "troops", name: "Poultry levy", blurb: "Very large chickens, armed. Morale is excellent.", crowns: 800, variant: "chicken", tag: "Jest" },
  { id: "troops-goose", slot: "troops", name: "Geese", blurb: "Nobody has ever won a fight with one. They have found knives.", crowns: 850, variant: "goose", tag: "Jest" },
  { id: "troops-cavalry", slot: "troops", name: "Knights on horse", blurb: "Mounted knights in caparison, lances high.", crowns: 900, variant: "cavalry", tag: "New models" },
  { id: "troops-snail", slot: "troops", name: "Snail knights", blurb: "The knight's oldest enemy, at last on your side. Slow to anger.", crowns: 900, variant: "snail", tag: "Jest" },

  // -------------------------------------------------------------------- ships
  { id: "ships-oak", slot: "ships", name: "Oaken fleet", blurb: "Plain oak hulls, undyed sails.", crowns: 0, variant: "default", unlisted: true },
  { id: "ships-black", slot: "ships", name: "Black fleet", blurb: "Tarred black hulls and dark sails. Feared in every port.", crowns: 250, variant: "black", tag: "Recolour" },
  { id: "ships-gilt", slot: "ships", name: "Gilded fleet", blurb: "Gold-trimmed hulls fit for a royal progress.", crowns: 400, variant: "gilt", tag: "Recolour" },
  { id: "ships-norse", slot: "ships", name: "Dragon ships", blurb: "Clinker-built longships: dragon prows, striped sails and a wall of shields.", crowns: 700, variant: "norse", tag: "New models" },
  { id: "ships-lateen", slot: "ships", name: "Southern galleys", blurb: "Twin lateen sails, a bronze ram and a tented stern.", crowns: 700, variant: "lateen", tag: "New models" },
  { id: "ships-junk", slot: "ships", name: "Eastern junks", blurb: "High-sterned hulls under great battened sails.", crowns: 750, variant: "junk", tag: "New models" },
  { id: "ships-wraith", slot: "ships", name: "The drowned fleet", blurb: "Went down with all hands. Came back up with them.", crowns: 850, variant: "wraith", tag: "New models" },
  { id: "ships-tub", slot: "ships", name: "Three men in a tub", blurb: "A washtub, a broom for a mast and somebody's shirt. Spoons for oars.", crowns: 800, variant: "tub", tag: "Jest" },
  { id: "ships-swan", slot: "ships", name: "Swan boats", blurb: "For a more elegant invasion. Each wears a small crown.", crowns: 900, variant: "swan", tag: "Jest" },
  { id: "ships-duck", slot: "ships", name: "The duck armada", blurb: "Enormous wooden bath ducks. They float, they fight, they squeak.", crowns: 1000, variant: "duck", tag: "Jest" },
  { id: "ships-serpent", slot: "ships", name: "Sea serpents", blurb: "Saddled, more or less tame, and here be them.", crowns: 1100, variant: "serpent", tag: "New models" },
  { id: "ships-turtle", slot: "ships", name: "Tower turtles", blurb: "A great turtle with a keep on its back. It goes where it likes.", crowns: 1200, variant: "turtle", tag: "Jest" },

  // ---------------------------------------------------------------- buildings
  { id: "build-timber", slot: "buildings", name: "Timber and thatch", blurb: "Honest halls of wood and straw.", crowns: 0, variant: "default", unlisted: true },
  { id: "build-slate", slot: "buildings", name: "Grey stone", blurb: "Pale ashlar walls, northern style.", crowns: 250, variant: "slate", tag: "Recolour" },
  { id: "build-redbrick", slot: "buildings", name: "Red brick", blurb: "Warm brick walls and dark timber.", crowns: 250, variant: "brick", tag: "Recolour" },
  { id: "build-nordic", slot: "buildings", name: "Northern holds", blurb: "Longhouses, stave churches and palisaded mottes in dark timber.", crowns: 800, variant: "nordic", tag: "New models" },
  { id: "build-desert", slot: "buildings", name: "Desert cities", blurb: "Sandstone, flat roofs, domes and minarets among the palms.", crowns: 800, variant: "desert", tag: "New models" },
  { id: "build-eastern", slot: "buildings", name: "Onion domes", blurb: "White walls, tent roofs, a brick kremlin and gilded domes.", crowns: 850, variant: "eastern", tag: "New models" },
  { id: "build-tourney", slot: "buildings", name: "The tourney", blurb: "A city of striped pavilions, bunting and a siege engine on a cart.", crowns: 900, variant: "tourney", tag: "New models" },
  { id: "build-necropolis", slot: "buildings", name: "Necropolis", blurb: "Crypts, railings, a leaning spire and a keep with a face.", crowns: 950, variant: "necropolis", tag: "New models" },
  { id: "build-apiary", slot: "buildings", name: "The apiary", blurb: "A realm kept in straw beehives. The inhabitants are busy.", crowns: 950, variant: "apiary", tag: "Jest" },
  { id: "build-toadstool", slot: "buildings", name: "Toadstool towns", blurb: "A fairy ring that got out of hand.", crowns: 1000, variant: "toadstool", tag: "Jest" },

  // ------------------------------------------------------------------- trails
  ...TRAILS.map((t): Item => ({
    id: t.key === "default" ? "trail-chalk" : `trail-${t.key.replace("g:", "g-")}`,
    slot: "trails", name: t.name, blurb: t.blurb, crowns: t.crowns, variant: t.key,
    ...(t.crowns === 0 ? { unlisted: true } : { tag: t.glyph !== undefined ? "Heraldic" : "Pattern" }),
  })),

  // ---------------------------------------------------------------- territory
  { id: "terr-plain", slot: "territory", name: "Plain", blurb: "The common cloth.", crowns: 0, variant: "plain", unlisted: true },
  ...PROCEDURAL.map((p): Item => ({
    id: `terr-${p.key}`, slot: "territory", name: p.name, blurb: p.blurb, crowns: p.crowns, variant: p.key, tag: "Pattern",
  })),
  ...GLYPHS.map((g): Item => ({
    id: `terr-g-${g.key}`, slot: "territory", name: g.name, blurb: g.blurb, crowns: g.crowns, variant: `g:${g.key}`, tag: "Heraldic",
  })),

  // ------------------------------------------------------------------- banner
  { id: "banner-birth", slot: "banner", name: "Arms by birth", blurb: "The arms your house name gives you.", crowns: 0, variant: "default", unlisted: true },
  { id: "banner-custom", slot: "banner", name: "Your own arms", blurb: "Design your shield: two tinctures, eighteen divisions and more than seventy charges.", crowns: 300, variant: "custom", tag: "Heraldic" },
];

export interface Bundle {
  id: string;
  name: string;
  blurb: string;
  items: string[];
  crowns: number;
}

export const BUNDLES: Bundle[] = [
  { id: "bundle-risen", name: "The Risen", blurb: "A necropolis, the drowned fleet and the restless dead, under death's heads.", items: ["build-necropolis", "ships-wraith", "troops-skeleton", "terr-g-skulls", "trail-g-skulls"], crowns: 2400 },
  { id: "bundle-marginalia", name: "The Margins", blurb: "Everything the monks drew when they were bored: snails, toadstools and a turtle with a tower.", items: ["troops-snail", "build-toadstool", "ships-turtle", "terr-g-ivy", "trail-illuminated"], crowns: 2700 },
  { id: "bundle-fool", name: "The Fool's Court", blurb: "A company of fools, in pavilions, at sea in a tub.", items: ["troops-jester", "build-tourney", "ships-tub", "terr-g-jester", "trail-g-jester"], crowns: 2400 },
  { id: "bundle-farmyard", name: "The Farmyard", blurb: "Geese, an apiary and the duck armada. Nobody is safe.", items: ["troops-goose", "build-apiary", "ships-duck", "terr-g-shamrocks", "trail-surf"], crowns: 2600 },
  { id: "bundle-northmen", name: "The Northmen", blurb: "Northern holds, dragon ships and Northmen to crew them.", items: ["build-nordic", "ships-norse", "troops-viking", "terr-g-axes", "trail-g-axes"], crowns: 2000 },
  { id: "bundle-sultan", name: "The Sultan", blurb: "Desert cities, southern galleys, longbowmen and a field of crescents.", items: ["build-desert", "ships-lateen", "troops-archer", "terr-g-moons", "trail-sunset"], crowns: 1900 },
  { id: "bundle-tsar", name: "The Tsar", blurb: "Onion domes, eastern junks and knights on horse beneath royal crowns.", items: ["build-eastern", "ships-junk", "troops-cavalry", "terr-g-kings", "trail-regal"], crowns: 2300 },
  { id: "bundle-crusade", name: "The Crusade", blurb: "Crusaders, a gilded fleet, grey stone and the cross on everything.", items: ["troops-crusader", "ships-gilt", "build-slate", "terr-g-pattee", "trail-g-pattee"], crowns: 1350 },
  { id: "bundle-enchanter", name: "The Enchanter", blurb: "Hedge wizards on sea serpents, with marsh lights behind them.", items: ["troops-wizard", "ships-serpent", "terr-g-estoiles", "trail-fairy"], crowns: 1900 },
  { id: "bundle-herald", name: "The Herald", blurb: "Your own arms and six classic cloths.", items: ["banner-custom", "terr-stripes", "terr-checks", "terr-chevrons", "terr-lozenges", "terr-g-fleur", "terr-g-crowns"], crowns: 950 },
];

/** A reserved house name, yours alone on every server. */
export const NAME_COST = 200;

export const SLOT_NAMES: Record<Slot, string> = {
  territory: "Territory",
  banner: "Banner",
  ships: "Ships",
  buildings: "Buildings",
  troops: "Troops",
  trails: "Sea trail",
};

export const itemById = (id: string): Item | undefined => ITEMS.find((i) => i.id === id);

/** The default item for a slot, which everyone owns. */
export const defaultItem = (slot: Slot): Item => ITEMS.find((i) => i.slot === slot && i.crowns === 0)!;

/** What a player wears: slot -> item id. */
export type Equipped = Partial<Record<Slot, string>>;

/** The visual variants a set of equipped items amounts to. */
export function variantsOf(equipped: Equipped | null | undefined): Record<Slot, string> {
  const out = {} as Record<Slot, string>;
  for (const slot of Object.keys(SLOT_NAMES) as Slot[]) {
    const item = equipped?.[slot] ? itemById(equipped[slot]!) : undefined;
    out[slot] = item?.slot === slot ? item.variant : defaultItem(slot).variant;
  }
  return out;
}
