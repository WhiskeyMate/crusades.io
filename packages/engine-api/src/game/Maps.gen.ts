// The realms crusades.io is played on. Terrain for each lives in
// public/maps/<id>/ (see src/worldgen/RealmGen.ts); the seats of the
// kingdoms and their names come from the game's seed.

export enum GameMapType {
  Europe = "Europe",
  Mediterranean = "Mediterranean",
  Greece = "Greece",
  Britannia = "Britannia",
  France = "France",
  Germany = "Germany",
  Italia = "Italia",
  Scandinavia = "Scandinavia",
  Balkans = "The Balkans",
  Baltics = "The Baltic",
  BlackSea = "The Black Sea",
  Iceland = "Iceland",
  Bosphorus = "The Bosphorus",
  Levant = "The Levant",
  MiddleEast = "The Middle East",
  Caucasus = "The Caucasus",
  NileDelta = "The Nile",
  Earth = "Earth",
  Africa = "Africa",
  Asia = "Asia",
  NorthAmerica = "North America",
  SouthAmerica = "South America",
  Australia = "Australia",
  India = "India",
  China = "China",
  Japan = "Japan",
  SoutheastAsia = "South-East Asia",
  Caribbean = "The Caribbean",
  SunderedSea = "The Sundered Sea",
  Ironspine = "Ironspine",
  Mirrormere = "Mirrormere",
  Hourglass = "The Hourglass",
  GreatRiver = "The Great River",
  Lakelands = "The Lakelands",
  FjordCoast = "The Fjord Coast",
  GreatPlain = "The Great Plain",
  Delta = "The Delta",
  Horseshoe = "The Horseshoe",
  Crescent = "The Crescent",
  CrownIsles = "The Crown Isles",
  FourRealms = "The Four Realms",
  ShatteredIsles = "The Shattered Isles",
  ThreeSisters = "The Three Sisters",
  Honeycomb = "The Honeycomb",
  Necklace = "The Necklace",
  Maelstrom = "The Maelstrom",
  Serpent = "The Serpent",
  Wheel = "The Wheel",
  Crossing = "The Crossing",
  Star = "The Star",
  Pinwheel = "The Pinwheel",
  Ladder = "The Ladder",
}

export type GameMapName = keyof typeof GameMapType;

export type MapCategory =
  | "featured"
  | "new"
  | "world"
  | "continental"
  | "europe"
  | "asia"
  | "north_america"
  | "africa"
  | "south_america"
  | "oceania"
  | "antarctica"
  | "countries"
  | "cosmic"
  | "fictional"
  | "arcade"
  | "tournament";

// Category display order in the map picker.
export const mapCategoryOrder: readonly MapCategory[] = [
  "featured",
  "new",
  "world",
  "continental",
  "europe",
  "asia",
  "north_america",
  "africa",
  "south_america",
  "oceania",
  "antarctica",
  "countries",
  "cosmic",
  "fictional",
  "arcade",
  "tournament",
];

export type SpecialModifierKey =
  | "isRandomSpawn"
  | "isCompact"
  | "isCrowded"
  | "isHardNations"
  | "startingGold1M"
  | "startingGold5M"
  | "startingGold25M"
  | "goldMultiplier"
  | "isAlliancesDisabled"
  | "isNukesDisabled"
  | "isSAMsDisabled"
  | "isPeaceTime"
  | "isWaterNukes"
  | "isDoomsdayClock";

export interface MapInfo {
  /** GameMapType enum key — the UpperCamelCase folder name. */
  id: GameMapName;
  /** Canonical map name (wire format) — the GameMapType enum value. */
  type: GameMapType;
  /** Key of the map's display name in resources/lang/en.json. */
  translationKey: string;
  /** Map picker categories. */
  categories: MapCategory[];
  /** How many times the map appears in the multiplayer playlist (fallback). */
  multiplayerFrequency: number;
  /** FFA lobby rotation weight. -1 = use multiplayerFrequency. */
  ffaFrequency: number;
  /** Team lobby rotation weight. -1 = use multiplayerFrequency. */
  teamFrequency: number;
  /** Special lobby rotation weight. -1 = use multiplayerFrequency. */
  specialFrequency: number;
  /** Position in the featured grid (1 = first); unranked featured maps sort last. */
  featuredRank?: number;
  /** Preferred team count in team/special games (see MapPlaylist). */
  specialTeamCount?: number;
  /** Modifiers that should never be rolled for this map in special games. */
  disabledModifiers?: SpecialModifierKey[];
  /** Modifiers forced on for this map. Plain key or "key:percentage" (e.g. "goldMultiplier:75"). */
  forcedModifiers?: string[];
  /** Tribe name theme(s) (keys in tribeNameThemes.json). */
  themes?: string[];
  /** Custom tribe entry: a string (random spawn) or an object with name and coordinates. */
  customTribes?: CustomTribe[];
  /** Map layers rendered between terrain and territory. */
  layers?: MapLayer[];
  /** Default nation count defined in the map's manifest/info. */
  defaultNationCount: number;
}

export interface CustomTribe {
  name: string;
  coordinates?: [number, number];
}

export type LayerPlacement = "land" | "water";

export interface MapLayer {
  /** Unique identifier — also the PNG filename (without extension). */
  id: string;
  /** Whether the layer sits on land or water tiles. */
  placement: LayerPlacement;
  /** If true, the layer is permanently destroyed in nuke impact radii. */
  nukeable?: boolean;
}

const entry = (id: GameMapName, type: GameMapType, categories: MapCategory[]): MapInfo => ({
  id,
  type,
  translationKey: `map.${id.toLowerCase()}`,
  categories,
  multiplayerFrequency: 1,
  ffaFrequency: -1,
  teamFrequency: -1,
  specialFrequency: -1,
  defaultNationCount: 12,
  themes: ["default"],
});

export const maps: readonly MapInfo[] = [
  entry("Earth", GameMapType.Earth, ["world"]),
  entry("Europe", GameMapType.Europe, ["continental", "europe"]),
  entry("Mediterranean", GameMapType.Mediterranean, ["europe", "africa"]),
  entry("Greece", GameMapType.Greece, ["europe"]),
];
