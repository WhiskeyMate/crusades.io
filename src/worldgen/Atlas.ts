// Every realm the game is played on, in one list: its name, where its
// terrain lives (public/maps/<dir>/), how many kingdoms it holds by default,
// which shelf of the map picker it sits on, and a few words for its card.
//
// To add a map: draw it (tools/mapdraw.ts) or bring it in (tools/mapimport.mjs),
// run tools/mapfix.ts on it, add its name to GameMapType and a line here, and
// raise PROTOCOL_VERSION, since the server must have the same maps.

import { GameMapType } from "@crusades/engine-api/game/Maps.gen";

export type MapGroup = "old" | "wide" | "lands" | "isles" | "odd";

export const MAP_GROUPS: { id: MapGroup; name: string; blurb: string }[] = [
  { id: "old", name: "The Old World", blurb: "Christendom and the lands the crusades were fought over" },
  { id: "wide", name: "The Wide World", blurb: "Continents and countries further off" },
  { id: "lands", name: "Lands of Legend", blurb: "Invented continents, each with one idea to it" },
  { id: "isles", name: "Isles and Seas", blurb: "Invented maps where the sea decides" },
  { id: "odd", name: "Curiosities", blurb: "Shapes no coast ever had" },
];

export interface MapEntry {
  map: GameMapType;
  dir: string;
  kingdoms: number;
  group: MapGroup;
  blurb: string;
  /** Too large for a public game with strangers on modest machines; still there to choose. */
  heavy?: boolean;
}

export const ATLAS: MapEntry[] = [
  { map: GameMapType.Europe, dir: "europe", kingdoms: 52, group: "old", blurb: "From Iberia to the Urals" },
  { map: GameMapType.Mediterranean, dir: "mediterranean", kingdoms: 38, group: "old", blurb: "The sea in the middle" },
  { map: GameMapType.Greece, dir: "greece", kingdoms: 29, group: "old", blurb: "Aegean isles and straits" },
  { map: GameMapType.Britannia, dir: "britannia", kingdoms: 20, group: "old", blurb: "Two islands and a narrow sea" },
  { map: GameMapType.France, dir: "france", kingdoms: 25, group: "old", blurb: "From the Channel to the Pyrenees" },
  { map: GameMapType.Germany, dir: "germany", kingdoms: 16, group: "old", blurb: "The heart of the Empire" },
  { map: GameMapType.Italia, dir: "italia", kingdoms: 15, group: "old", blurb: "The boot, and the islands at its toe" },
  { map: GameMapType.Scandinavia, dir: "scandinavia", kingdoms: 24, group: "old", blurb: "Fjords, and the sea they enclose" },
  { map: GameMapType.Balkans, dir: "balkans", kingdoms: 23, group: "old", blurb: "Mountains between three seas" },
  { map: GameMapType.Baltics, dir: "baltics", kingdoms: 35, group: "old", blurb: "The crusade in the north" },
  { map: GameMapType.BlackSea, dir: "blacksea", kingdoms: 12, group: "old", blurb: "One sea, and every shore of it" },
  { map: GameMapType.Iceland, dir: "iceland", kingdoms: 10, group: "old", blurb: "An island at the edge of the world" },
  { map: GameMapType.Bosphorus, dir: "bosphorus", kingdoms: 16, group: "old", blurb: "The strait before the city" },
  { map: GameMapType.Levant, dir: "levant", kingdoms: 15, group: "old", blurb: "Outremer: the crusader coast" },
  { map: GameMapType.MiddleEast, dir: "middleeast", kingdoms: 27, group: "old", blurb: "From the Nile to Persia" },
  { map: GameMapType.Caucasus, dir: "caucasus", kingdoms: 21, group: "old", blurb: "A wall of mountains between two seas" },
  { map: GameMapType.NileDelta, dir: "niledelta", kingdoms: 12, group: "old", blurb: "The delta, and the river behind it" },
  { map: GameMapType.Earth, dir: "earth", kingdoms: 107, group: "wide", blurb: "The whole world, slowly", heavy: true },
  { map: GameMapType.Africa, dir: "africa", kingdoms: 44, group: "wide", blurb: "Desert, forest and the long coast" },
  { map: GameMapType.Asia, dir: "asia", kingdoms: 25, group: "wide", blurb: "The greatest of the continents" },
  { map: GameMapType.NorthAmerica, dir: "northamerica", kingdoms: 60, group: "wide", blurb: "From the ice to the isthmus" },
  { map: GameMapType.SouthAmerica, dir: "southamerica", kingdoms: 25, group: "wide", blurb: "The river, the mountains, the cape" },
  { map: GameMapType.Australia, dir: "australia", kingdoms: 12, group: "wide", blurb: "A wide land with few harbours" },
  { map: GameMapType.India, dir: "india", kingdoms: 52, group: "wide", blurb: "The subcontinent and its island" },
  { map: GameMapType.China, dir: "china", kingdoms: 34, group: "wide", blurb: "The middle kingdom" },
  { map: GameMapType.Japan, dir: "japan", kingdoms: 12, group: "wide", blurb: "A chain of islands off the mainland" },
  { map: GameMapType.SoutheastAsia, dir: "southeastasia", kingdoms: 31, group: "wide", blurb: "A thousand islands" },
  { map: GameMapType.Caribbean, dir: "caribbean", kingdoms: 24, group: "wide", blurb: "Island after island" },
  { map: GameMapType.SunderedSea, dir: "sundered", kingdoms: 60, group: "lands", blurb: "Two continents and the strait between" },
  { map: GameMapType.Ironspine, dir: "ironspine", kingdoms: 70, group: "lands", blurb: "A mountain chain and a walled province", heavy: true },
  { map: GameMapType.Mirrormere, dir: "mirrormere", kingdoms: 56, group: "lands", blurb: "A ring of land round an inland sea" },
  { map: GameMapType.Hourglass, dir: "hourglass", kingdoms: 48, group: "lands", blurb: "Two lands and the one neck between" },
  { map: GameMapType.GreatRiver, dir: "greatriver", kingdoms: 46, group: "lands", blurb: "One land, one river, three fords" },
  { map: GameMapType.Lakelands, dir: "lakelands", kingdoms: 56, group: "lands", blurb: "More water inside than out" },
  { map: GameMapType.FjordCoast, dir: "fjords", kingdoms: 56, group: "lands", blurb: "Long arms of the sea in a long land" },
  { map: GameMapType.GreatPlain, dir: "greatplain", kingdoms: 46, group: "lands", blurb: "Land from edge to edge: no sea to hide behind" },
  { map: GameMapType.Delta, dir: "delta", kingdoms: 56, group: "lands", blurb: "A river that parts into five" },
  { map: GameMapType.Horseshoe, dir: "horseshoe", kingdoms: 50, group: "lands", blurb: "One land bent round a deep gulf" },
  { map: GameMapType.Crescent, dir: "crescent", kingdoms: 40, group: "lands", blurb: "A horned moon about a bay" },
  { map: GameMapType.CrownIsles, dir: "crownisles", kingdoms: 44, group: "isles", blurb: "Nine isles in a ring; the tenth must be taken" },
  { map: GameMapType.FourRealms, dir: "fourrealms", kingdoms: 56, group: "isles", blurb: "Four lands, a cross of sea, one isle between" },
  { map: GameMapType.ShatteredIsles, dir: "shattered", kingdoms: 40, group: "isles", blurb: "No mainland: thirty islands" },
  { map: GameMapType.ThreeSisters, dir: "threesisters", kingdoms: 39, group: "isles", blurb: "Three great islands and a small one" },
  { map: GameMapType.Honeycomb, dir: "honeycomb", kingdoms: 57, group: "isles", blurb: "Nineteen islands, a strait round each" },
  { map: GameMapType.Necklace, dir: "necklace", kingdoms: 40, group: "isles", blurb: "A chain of islands strung across the sea" },
  { map: GameMapType.Maelstrom, dir: "maelstrom", kingdoms: 40, group: "odd", blurb: "A land coiled round a stronghold" },
  { map: GameMapType.Serpent, dir: "serpent", kingdoms: 48, group: "odd", blurb: "One long land, pinched at every bend" },
  { map: GameMapType.Wheel, dir: "wheel", kingdoms: 48, group: "odd", blurb: "A hub, a rim and six spokes" },
  { map: GameMapType.Crossing, dir: "crossing", kingdoms: 44, group: "odd", blurb: "A land in the shape of a cross" },
  { map: GameMapType.Star, dir: "star", kingdoms: 36, group: "odd", blurb: "Five points about a lake" },
  { map: GameMapType.Pinwheel, dir: "pinwheel", kingdoms: 48, group: "odd", blurb: "Four arms, all curling one way" },
  { map: GameMapType.Ladder, dir: "ladder", kingdoms: 44, group: "odd", blurb: "Two lands and five rungs between" },
];

export const atlasOf = (map: GameMapType): MapEntry => ATLAS.find((m) => m.map === map) ?? ATLAS[0];
