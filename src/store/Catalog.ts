// Everything that can be bought. Real money buys Crowns (the credit);
// Crowns buy items. Prices in money are set in Stripe; the pack id here is
// what the checkout function looks up, and the Crown amounts are what the
// webhook grants. Both sides import this file, so a change here is the only
// change needed.

export type Slot = "territory" | "banner" | "ships" | "buildings" | "troops";

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
  /** Hidden from the store (granted by bundles or the default). */
  unlisted?: boolean;
}

export const ITEMS: Item[] = [
  // Territory: how your land is painted.
  { id: "terr-plain", slot: "territory", name: "Plain", blurb: "The common cloth.", crowns: 0, variant: "plain", unlisted: true },
  { id: "terr-stripes", slot: "territory", name: "Barry", blurb: "Horizontal bars across your land.", crowns: 150, variant: "stripes" },
  { id: "terr-checks", slot: "territory", name: "Chequy", blurb: "A chequered field, as on a treasurer's board.", crowns: 150, variant: "checks" },
  { id: "terr-chevrons", slot: "territory", name: "Chevronny", blurb: "Chevrons marching across your realm.", crowns: 200, variant: "chevrons" },
  { id: "terr-lozenges", slot: "territory", name: "Lozengy", blurb: "A lattice of diamonds.", crowns: 200, variant: "lozenges" },
  // Banner: the arms on your shield and labels. "custom" unlocks the editor.
  { id: "banner-birth", slot: "banner", name: "Arms by birth", blurb: "The arms your house name gives you.", crowns: 0, variant: "default", unlisted: true },
  { id: "banner-custom", slot: "banner", name: "Your own arms", blurb: "Choose the field, the division and the charge yourself.", crowns: 300, variant: "custom" },
  // Ships.
  { id: "ships-oak", slot: "ships", name: "Oaken fleet", blurb: "Plain oak hulls, undyed sails.", crowns: 0, variant: "default", unlisted: true },
  { id: "ships-black", slot: "ships", name: "Black fleet", blurb: "Tarred black hulls and dark sails. Feared in every port.", crowns: 250, variant: "black" },
  { id: "ships-gilt", slot: "ships", name: "Gilded fleet", blurb: "Gold-trimmed hulls fit for a royal progress.", crowns: 400, variant: "gilt" },
  // Buildings.
  { id: "build-timber", slot: "buildings", name: "Timber and thatch", blurb: "Honest halls of wood and straw.", crowns: 0, variant: "default", unlisted: true },
  { id: "build-slate", slot: "buildings", name: "Grey stone", blurb: "Slate roofs on pale stone, northern style.", crowns: 250, variant: "slate" },
  { id: "build-redbrick", slot: "buildings", name: "Red brick", blurb: "Warm brick walls and terracotta roofs.", crowns: 250, variant: "brick" },
  // Troops.
  { id: "troops-levy", slot: "troops", name: "Levies", blurb: "Spears and round shields.", crowns: 0, variant: "default", unlisted: true },
  { id: "troops-mail", slot: "troops", name: "Men-at-arms", blurb: "Mail, kettle helms and kite shields.", crowns: 300, variant: "mail" },
  { id: "troops-crusader", slot: "troops", name: "Crusaders", blurb: "White surcoats, great helms and the cross.", crowns: 500, variant: "crusader" },
];

export interface Bundle {
  id: string;
  name: string;
  blurb: string;
  items: string[];
  crowns: number;
}

export const BUNDLES: Bundle[] = [
  { id: "bundle-northern", name: "The Northern Lord", blurb: "Grey stone halls, a black fleet and mailed men.", items: ["build-slate", "ships-black", "troops-mail"], crowns: 650 },
  { id: "bundle-crusade", name: "The Crusade", blurb: "Crusaders, a gilded fleet and chevrons on your land.", items: ["troops-crusader", "ships-gilt", "terr-chevrons"], crowns: 900 },
  { id: "bundle-herald", name: "The Herald", blurb: "Your own arms and every pattern of cloth.", items: ["banner-custom", "terr-stripes", "terr-checks", "terr-chevrons", "terr-lozenges"], crowns: 800 },
];

/** A reserved house name, yours alone on every server. */
export const NAME_COST = 200;

export const SLOT_NAMES: Record<Slot, string> = {
  territory: "Territory",
  banner: "Banner",
  ships: "Ships",
  buildings: "Buildings",
  troops: "Troops",
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
