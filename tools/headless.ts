// Headless smoke run: generate a realm, play some ticks with one human who
// spawns and attacks, print what happened. `npm run sim -- [map] [seed] [ticks]`
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createGameRunner } from "@crusades/engine/GameRunner";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
} from "@crusades/engine-api/game/GameTypes";
import { GameUpdateType } from "@crusades/engine-api/game/GameUpdates";
import { GameStartInfo } from "@crusades/engine-api/Schemas";
import { readFileSync } from "node:fs";
import { buildRealm, MAP_DIR, MapInfoFile } from "../src/worldgen/RealmGen";

function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    rgb.subarray(y * w * 3, (y + 1) * w * 3).forEach((v, i) => (raw[y * (w * 3 + 1) + 1 + i] = v));
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const mapArg = (process.argv[2] ?? "Greece") as GameMapType;
const seed = Number(process.argv[3] ?? 7);
const ticks = Number(process.argv[4] ?? 600);

let t0 = performance.now();
const dir = `public/maps/${MAP_DIR[mapArg]}`;
const realm = buildRealm(
  { map: mapArg, seed },
  JSON.parse(readFileSync(`${dir}/info.json`, "utf8")) as MapInfoFile,
  new Uint8Array(readFileSync(`${dir}/main.bin`)),
  new Uint8Array(readFileSync(`${dir}/mini.bin`)),
);
console.log(`realm ${mapArg} seed ${seed}: ${realm.width}x${realm.height}, land ${realm.numLandTiles} (${((realm.numLandTiles / (realm.width * realm.height)) * 100).toFixed(1)}%), ${(performance.now() - t0).toFixed(0)}ms`);

{
  const { width: w, height: h, elevation: e } = realm;
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    let r, g, b;
    if (e[i] < 0) { const d = Math.min(1, -e[i] / 30); r = 40 - d * 25; g = 90 - d * 50; b = 150 - d * 60; }
    else if (e[i] < 10) { r = 90 + e[i] * 4; g = 140 + e[i] * 2; b = 70; }
    else if (e[i] < 20) { r = 130 + (e[i] - 10) * 3; g = 130; b = 80; }
    else { const m = (e[i] - 20) / 10; r = g = b = 140 + m * 110; }
    rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
  }
  for (const nat of realm.files.manifest.nations) {
    const [x, y] = nat.coordinates!;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const i = (y + dy) * w + x + dx;
      rgb[i * 3] = 255; rgb[i * 3 + 1] = 0; rgb[i * 3 + 2] = 0;
    }
  }
  writeFileSync(`tools/preview-${mapArg.replace(/\s/g, "")}.png`, png(w, h, rgb));
}

const clientID = "HUMAN001";
const info: GameStartInfo = {
  gameID: "SIMRUN01",
  lobbyCreatedAt: 0,
  config: {
    gameMap: mapArg,
    difficulty: Difficulty.Medium,
    donateGold: true,
    donateTroops: true,
    gameType: GameType.Singleplayer,
    gameMode: GameMode.FFA,
    gameMapSize: GameMapSize.Normal,
    nations: "default",
    bots: 120,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
  },
  players: [{ clientID, username: "Tester", clanTag: null }],
};

const counts: Record<string, number> = {};
let tileUpdates = 0;
let slowest = 0;
let error: string | null = null;
const spawn = realm.files.manifest.nations[0].coordinates!;
const spawnTile = (spawn[1] + 30) * realm.width + spawn[0] + 30;

t0 = performance.now();
const runner = await createGameRunner(info, clientID, realm.files, (gu) => {
  if (!("updates" in gu)) {
    error = gu.errMsg + "\n" + gu.stack;
    return;
  }
  tileUpdates += gu.packedTileUpdates.length / 2;
  slowest = Math.max(slowest, gu.tickExecutionDuration ?? 0);
  for (const [k, v] of Object.entries(gu.updates)) {
    if (v.length) counts[GameUpdateType[Number(k)]] = (counts[GameUpdateType[Number(k)]] ?? 0) + v.length;
  }
});
console.log(`engine init ${(performance.now() - t0).toFixed(0)}ms`);

t0 = performance.now();
for (let i = 0; i < ticks && !error; i++) {
  const intents: any[] = [];
  if (i === 5) intents.push({ type: "spawn", tile: spawnTile, clientID });
  if (i === 150) intents.push({ type: "attack", targetID: null, troops: null, clientID });
  runner.addTurn({ turnNumber: i, intents });
  runner.executeNextTick();
}
const ms = performance.now() - t0;
if (error) {
  console.error("TICK ERROR", error);
  process.exit(1);
}
console.log(`${ticks} ticks in ${ms.toFixed(0)}ms (${(ms / ticks).toFixed(2)}ms/tick, slowest ${slowest.toFixed(1)}ms), ${tileUpdates} tile updates`);
console.log(counts);
const players = runner.game.players().sort((a, b) => b.numTilesOwned() - a.numTilesOwned());
console.log(`${players.length} alive players; top:`);
for (const p of players.slice(0, 6)) console.log(`  ${p.type().padEnd(7)} ${p.displayName().padEnd(34)} tiles ${p.numTilesOwned()} troops ${p.troops()} gold ${p.gold()}`);
const me = players.find((p) => p.clientID() === clientID);
console.log("human:", me ? `${me.numTilesOwned()} tiles, ${me.troops()} troops` : "not spawned");
