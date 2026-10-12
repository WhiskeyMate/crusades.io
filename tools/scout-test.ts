// Plays out scouting parties and ward towers in the engine with two houses,
// and checks each rule: a party spreads unseen and takes open land around
// buildings; its camp keeps that land from being swallowed; a ward tower
// uncovers a party; an uncovered party can be routed, a hidden one cannot.
// `npm run scout-test`
import { readFileSync } from "node:fs";
import { createGameRunner } from "@crusades/engine/GameRunner";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  UnitType,
} from "@crusades/engine-api/game/GameTypes";
import { GameUpdateType } from "@crusades/engine-api/game/GameUpdates";
import { SCOUT_CLEARANCE, SCOUT_GROW_TICKS, SCOUT_MAX_RADIUS, WARD_RANGE } from "@crusades/engine-api/game/Scouting";
import { GameStartInfo } from "@crusades/engine-api/Schemas";
import { buildRealm, DEFAULT_KINGDOMS, MAP_DIR, MapInfoFile } from "../src/worldgen/RealmGen";

const map = GameMapType.Europe;
const dir = `public/maps/${MAP_DIR[map]}`;
const realm = buildRealm(
  { map, seed: 7, kingdoms: DEFAULT_KINGDOMS[map] },
  JSON.parse(readFileSync(`${dir}/info.json`, "utf8")) as MapInfoFile,
  new Uint8Array(readFileSync(`${dir}/main.bin`)),
  new Uint8Array(readFileSync(`${dir}/mini.bin`)),
);

const A = "SCOUTAAA";
const B = "WARDBBBB";
const C = "THIRDCCC";
const info: GameStartInfo = {
  gameID: "SCOUTS01",
  lobbyCreatedAt: 0,
  config: {
    gameMap: map,
    difficulty: Difficulty.Easy,
    donateGold: true,
    donateTroops: true,
    gameType: GameType.Private,
    gameMode: GameMode.FFA,
    gameMapSize: GameMapSize.Normal,
    nations: "disabled",
    bots: 0,
    infiniteGold: true,
    infiniteTroops: true,
    instantBuild: true,
    randomSpawn: false,
  },
  players: [
    { clientID: A, username: "Scout", clanTag: null },
    { clientID: B, username: "Warden", clanTag: null },
    { clientID: C, username: "Bystander", clanTag: null },
  ],
} as GameStartInfo;

let error: string | null = null;
/** Every tile any scouting party has reported covering, as a client would hear it. */
const told: number[] = [];
const runner = await createGameRunner(info, A, realm.files, (gu) => {
  if (!("updates" in gu)) {
    error = gu.errMsg + "\n" + gu.stack;
    return;
  }
  for (const u of gu.updates[GameUpdateType.Unit]) if (u.scoutTiles) told.push(...u.scoutTiles);
});
const g = runner.game;
let turn = 0;
const step = (intents: Record<string, unknown>[] = []) => {
  runner.addTurn({ turnNumber: turn++, intents: intents as never });
  runner.executeNextTick();
  if (error) {
    console.error("ENGINE ERROR", error);
    process.exit(1);
  }
};
const run = (n: number) => {
  for (let i = 0; i < n; i++) step();
};

let failed = 0;
const check = (what: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

// Two houses, far apart on open land.
const w = realm.width;
const land: number[] = [];
for (let t = 0; t < w * realm.height; t++) if (g.isLand(t) && !g.isImpassable(t)) land.push(t);
const far = (a: number, b: number) => Math.hypot(g.x(a) - g.x(b), g.y(a) - g.y(b));
/** A tile with nothing but open land for `r` tiles around it. */
const inland = (from: number, r: number, avoid?: number) => {
  for (let i = from; i < land.length; i += 997) {
    const t = land[i];
    if (avoid !== undefined && far(t, avoid) < 400) continue;
    let ok = true;
    for (let dy = -r; dy <= r && ok; dy += 4) {
      for (let dx = -r; dx <= r && ok; dx += 4) {
        const x = g.x(t) + dx;
        const y = g.y(t) + dy;
        if (x < 0 || y < 0 || x >= w || y >= realm.height) ok = false;
        else {
          const n = g.ref(x, y);
          if (!g.isLand(n) || g.isImpassable(n)) ok = false;
        }
      }
    }
    if (ok) return t;
  }
  throw new Error("no open land found");
};
const homeB = inland(0, 110);
const homeA = inland(0, 30, homeB);
const homeC = inland(land.length >> 1, 20, homeB);
step([{ type: "spawn", tile: homeA, clientID: A }, { type: "spawn", tile: homeB, clientID: B }, { type: "spawn", tile: homeC, clientID: C }]);
while (g.inSpawnPhase()) step();
const a = g.playerByClientID(A)!;
const b = g.playerByClientID(B)!;
const c = g.playerByClientID(C)!;
check("both houses stand", !!a && !!b && a.isAlive() && b.isAlive());

// Each is handed the open land around its seat, so there is a realm to creep
// into without waiting for one to be conquered. (Left alone on a single
// tile, a house is swallowed as soon as a neighbour's land closes round it.)
const grant = (who: typeof a, centre: number, r: number) => {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const t = g.ref(g.x(centre) + dx, g.y(centre) + dy);
      if (g.isLand(t) && !g.isImpassable(t)) who.conquer(t);
    }
  }
};
grant(a, homeA, 30);
grant(b, homeB, 110);
grant(c, homeC, 20);
run(20);
console.log(`       A holds ${a.numTilesOwned()} tiles, B ${b.numTilesOwned()}`);
while (g.isSpawnImmunityActive()) run(50);

const offset = (t: number, dx: number, dy: number) => g.ref(g.x(t) + dx, g.y(t) + dy);
const parties = () => a.units(UnitType.ScoutingParty);
const heldBy = (who: typeof a, centre: number, r: number) => {
  let n = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      if (g.owner(offset(centre, dx, dy)) === who) n++;
    }
  }
  return n;
};

// ---- 1. Unseen, around a building, and the land stays.
console.log("\n1. a party nobody sees");
const spot1 = offset(homeB, -45, 0);
check("B holds the ground it is sent to", g.owner(spot1) === b);
const town = offset(spot1, 9, 0);
step([{ type: "build_unit", unit: UnitType.City, tile: town, clientID: B }]);
run(5);
const towns = b.units(UnitType.City);
check("B has a town beside it", towns.length === 1);
const townAt = towns[0]?.tile() ?? town;
check("a party cannot be sent onto a building", a.canBuild(UnitType.ScoutingParty, townAt) === false);
check("nor onto its owner's land", a.canBuild(UnitType.ScoutingParty, homeA) === false);
const goldBefore = a.gold();
step([{ type: "build_unit", unit: UnitType.ScoutingParty, tile: spot1, clientID: A }]);
run(3);
check("the party is out", parties().length === 1);
const p1 = parties()[0];
check("it starts hidden", p1 !== undefined && !p1.isTargetable() && !p1.reachedTarget());
void goldBefore;
step([{ type: "rout_scouts", unitId: p1.id(), clientID: B }]);
run(2);
check("a hidden party cannot be routed", p1.isActive());
run(Math.floor(SCOUT_GROW_TICKS / 2));
check("half way: it reaches further, and has taken nothing yet", p1.troops() > 8 && p1.troops() < SCOUT_MAX_RADIUS && heldBy(a, spot1, SCOUT_MAX_RADIUS) === 0, `reach ${p1.troops()}`);
check("and it has told the clients of every tile it covered, once each", told.length > 500 && told.length < 700 && new Set(told).size === told.length && told.every((t) => g.owner(t) === b), `${told.length} tiles`);
check("still hidden with no ward tower about", !p1.isTargetable());
run(Math.ceil(SCOUT_GROW_TICKS / 2) + 5);
const took = heldBy(a, spot1, SCOUT_MAX_RADIUS);
check("done: the land around it is A's", took > 1000 && took <= 1200, `${took} tiles`);
check("it stands as a camp", p1.isActive() && p1.reachedTarget());
check("the town is still B's", towns[0].isActive() && towns[0].owner() === b);
check("and the ground at the town was left alone", heldBy(b, townAt, SCOUT_CLEARANCE - 1) > 0 && g.owner(townAt) === b);
check("with a lane left from the town to B's own land", g.owner(offset(townAt, 6, 0)) === b && g.owner(offset(townAt, SCOUT_MAX_RADIUS - 8, 0)) === b);
check("but the land either side of the lane was taken", g.owner(offset(townAt, 4, 7)) === a && g.owner(offset(townAt, 4, -7)) === a);
check("nothing beyond its reach was taken", g.owner(offset(spot1, -(SCOUT_MAX_RADIUS + 3), 0)) === b);
run(400);
const kept = heldBy(a, spot1, SCOUT_MAX_RADIUS);
check("surrounded, the land stays while the camp stands", kept === took, `${kept} tiles after 40s`);

// ---- 2. A ward tower uncovers a party, and it is routed.
console.log("\n2. a party a ward tower finds");
const spot2 = offset(homeB, 45, 30);
const ward = offset(spot2, WARD_RANGE - 10, 0);
check("B holds the ground", g.owner(spot2) === b && g.owner(ward) === b);
step([{ type: "build_unit", unit: UnitType.WardTower, tile: ward, clientID: B }]);
run(5);
check("B has a ward tower", b.units(UnitType.WardTower).length === 1);
step([{ type: "build_unit", unit: UnitType.ScoutingParty, tile: spot2, clientID: A }]);
run(12);
const p2 = parties().find((u) => u !== p1);
check("the second party is out", p2 !== undefined);
check("the ward tower has uncovered it", !!p2 && p2.isTargetable());
step([{ type: "rout_scouts", unitId: p2!.id(), clientID: A }]);
run(2);
check("its owner cannot rout it", p2!.isActive());
step([{ type: "rout_scouts", unitId: p2!.id(), clientID: B }]);
run(2);
check("B routs it at a stroke", !p2!.isActive());
run(SCOUT_GROW_TICKS);
check("and it took no land", heldBy(a, spot2, SCOUT_MAX_RADIUS) === 0);

// ---- 3. Out of a ward tower's sight until it grows into it.
console.log("\n3. a party that grows into a ward tower's sight");
const spot3 = offset(ward, -(WARD_RANGE + 10), 0);
step([{ type: "build_unit", unit: UnitType.ScoutingParty, tile: spot3, clientID: A }]);
run(12);
const p3 = parties().find((u) => u !== p1 && u.isActive());
check("the third party is out, and hidden", !!p3 && !p3.isTargetable(), p3 ? `reach ${p3.troops()}` : "");
run(Math.floor(SCOUT_GROW_TICKS * 0.75));
check("grown, its reach meets the tower's sight and it is uncovered", !!p3 && p3.isTargetable(), p3 ? `reach ${p3.troops()}` : "");

// ---- 4. A camp falls with the ground under it.
console.log("\n4. a camp is lost with its ground");
// B fights its way in from outside: a strip of land from its own to the camp.
for (let dx = -(SCOUT_MAX_RADIUS + 3); dx <= 0; dx++) {
  for (let dy = -1; dy <= 1; dy++) b.conquer(offset(spot1, dx, dy));
}
run(3);
check("the camp is gone once B retakes its tile", !p1.isActive());
run(400);
const left = heldBy(a, spot1, SCOUT_MAX_RADIUS);
check("and the land, cut off, goes back", left === 0, `${left} tiles left`);

// ---- 5. Only the realm it was sent into.
console.log("\n5. a party stops at the border of the next realm");
// At B's rim a third house, C, holds the land beyond: from 8 tiles off the party, outward.
const spot5 = offset(homeB, 0, -98);
let cTiles = 0;
for (let dy = -30; dy <= -8; dy++) {
  for (let dx = -30; dx <= 30; dx++) {
    const t = offset(spot5, dx, dy);
    if (g.isLand(t) && !g.isImpassable(t)) {
      c.conquer(t);
      cTiles++;
    }
  }
}
run(30);
const cBefore = heldBy(c, offset(spot5, 0, -16), 7);
check("B holds the ground, and C the land beyond it", g.owner(spot5) === b && g.owner(offset(spot5, 0, -9)) === c && cBefore > 100, `${cTiles} tiles to C`);
step([{ type: "build_unit", unit: UnitType.ScoutingParty, tile: spot5, clientID: A }]);
run(3);
const p5 = parties().find((u) => u.isActive() && u.tile() === spot5);
check("the party is out", p5 !== undefined);
run(SCOUT_GROW_TICKS + 10);
check("it is done", !!p5 && p5.reachedTarget());
check("it took B's land right up to the border", g.owner(offset(spot5, 0, -6)) === a && g.owner(offset(spot5, 10, 0)) === a);
check("and none of C's", g.owner(offset(spot5, 0, -9)) === c && heldBy(c, offset(spot5, 0, -16), 7) === cBefore && heldBy(a, offset(spot5, 0, -16), 7) === 0);

console.log(failed === 0 ? "\nall scouting checks passed" : `\n${failed} check(s) FAILED`);
process.exit(failed === 0 ? 0 : 1);
