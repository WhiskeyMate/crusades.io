// A stress test: fills a multiplayer game with bot players who really play,
// and measures how the server and the engine hold up.
//
//   npm run stress -- [--server ws://127.0.0.1:8765] [--bots 63] [--map europe]
//                     [--minutes 5] [--teams 0] [--wait 20] [--site http://localhost:5183]
//
// Each bot is its own connection to the game server, exactly as a browser is:
// it joins the lobby, raises its banner, marches on its neighbours and builds
// towns. One of them (the first) also runs the game engine, as every real
// player's browser does. That is how the bots know what is around them, how
// the time each turn takes is measured, and how the server's check for
// players falling out of step gets exercised.
//
// --wait holds the lobby open for that many seconds before starting, and
// prints an invitation link: open it in a browser to sit in the same game and
// see what a full house does to a real player's frame rate.
//
// --map takes a map's folder name under public/maps (europe, earth, wheel...).
// --server may be the live one (wss://play.crusades.io); the bots are then
// real load on it, and visible to anyone in the hall while they gather.

import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { createGameRunner, GameRunner } from "@crusades/engine/GameRunner";
import { Difficulty, GameMapType, UnitType } from "@crusades/engine-api/game/GameTypes";
import { GameUpdateType } from "@crusades/engine-api/game/GameUpdates";
import { GameStartInfo, Turn } from "@crusades/engine-api/Schemas";
import { ATLAS } from "../src/worldgen/Atlas";
import { buildRealm, DEFAULT_CLANS, MapInfoFile, Realm } from "../src/worldgen/RealmGen";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SERVER = arg("server", "ws://127.0.0.1:8765");
const BOTS = Math.max(1, Math.min(64, Number(arg("bots", "63"))));
const MINUTES = Number(arg("minutes", "5"));
const TEAMS = Number(arg("teams", "0"));
const WAIT = Number(arg("wait", "0"));
const SITE = arg("site", "http://localhost:5183");
const entry = ATLAS.find((m) => m.dir === arg("map", "europe"));
if (!entry) throw new Error(`no map folder "${arg("map", "europe")}"; try one of: ${ATLAS.map((m) => m.dir).join(", ")}`);

type Msg = Record<string, unknown> & { type: string };

class Bot {
  ws!: WebSocket;
  clientID = "";
  bytesIn = 0;
  turnsIn = 0;
  lastTurnAt = 0;
  /** Gaps between turns arriving, in ms: what a player feels as lag. */
  gaps: number[] = [];
  onMessage: (m: Msg) => void = () => {};
  closed = false;

  constructor(readonly name: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(SERVER);
      this.ws.on("open", () => this.send({ type: "hello", name: this.name }));
      this.ws.on("error", reject);
      this.ws.on("close", () => (this.closed = true));
      this.ws.on("message", (data) => {
        const text = data.toString();
        this.bytesIn += text.length;
        const m = JSON.parse(text) as Msg;
        if (m.type === "welcome") {
          this.clientID = m.clientID as string;
          resolve();
        } else if (m.type === "turn") {
          const now = performance.now();
          if (this.lastTurnAt) this.gaps.push(now - this.lastTurnAt);
          this.lastTurnAt = now;
          this.turnsIn++;
        }
        this.onMessage(m);
      });
    });
  }

  send(m: Msg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T,>(a: readonly T[]): T => a[(Math.random() * a.length) | 0];
const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);

console.log(`stress: ${BOTS} bots on ${SERVER}, ${entry.map}${TEAMS >= 2 ? `, ${TEAMS} teams` : ""}, ${MINUTES} minutes`);

// ---- everyone connects
const bots = Array.from({ length: BOTS }, (_, i) => new Bot(`Bot House ${String(i + 1).padStart(2, "0")}`));
const t0 = performance.now();
for (let i = 0; i < bots.length; i += 8) await Promise.all(bots.slice(i, i + 8).map((b) => b.connect()));
console.log(`connected ${bots.length} in ${Math.round(performance.now() - t0)}ms`);

// ---- the first opens a lobby, the rest join it
const host = bots[0];
let lobbyCode = "";
let lobbySeed = 0;
let lobbyKingdoms = entry.kingdoms;
let start: (Msg & { info: GameStartInfo; turns: Turn[] }) | null = null;
const turns: Turn[] = [];
let desyncs = 0;
let errors = 0;
host.onMessage = (m) => {
  if (m.type === "lobby") {
    const l = m.lobby as { code: string; config: { seed: number; kingdoms: number } };
    lobbyCode = l.code;
    lobbySeed = l.config.seed;
    lobbyKingdoms = l.config.kingdoms;
  } else if (m.type === "start") start = m as never;
  else if (m.type === "turn") turns.push(m.turn as Turn);
  else if (m.type === "desync") desyncs++;
  else if (m.type === "error") {
    errors++;
    console.log(`server says: ${m.message}`);
  }
};
host.send({
  type: "create",
  config: {
    map: entry.map,
    seed: 1 + Math.floor(Math.random() * 999_999),
    difficulty: Difficulty.Medium,
    kingdoms: entry.kingdoms,
    clans: DEFAULT_CLANS,
    maxPlayers: 64,
    ...(TEAMS >= 2 ? { teams: TEAMS } : {}),
  },
});
while (!lobbyCode) await sleep(50);
for (const b of bots.slice(1)) b.send({ type: "join", lobby: lobbyCode });
console.log(`lobby ${lobbyCode} open; invitation: ${SITE}/?join=${lobbyCode}`);
if (WAIT > 0) {
  console.log(`waiting ${WAIT}s before starting: join now from a browser to watch from inside`);
  await sleep(WAIT * 1000);
}
host.send({ type: "start" });
while (!start) await sleep(50);
const info = (start as { info: GameStartInfo }).info;
console.log(`game ${info.gameID} started with ${info.players.length} players`);

// ---- the first bot runs the engine, as a browser would
const dir = `public/maps/${entry.dir}`;
const realm: Realm = buildRealm(
  { map: entry.map as GameMapType, seed: lobbySeed, kingdoms: lobbyKingdoms },
  JSON.parse(readFileSync(`${dir}/info.json`, "utf8")) as MapInfoFile,
  new Uint8Array(readFileSync(`${dir}/main.bin`)),
  new Uint8Array(readFileSync(`${dir}/mini.bin`)),
);
const land: number[] = [];
for (let i = 0; i < realm.terrain.length; i += 7) if (realm.terrain[i] & 0x80 && (realm.terrain[i] & 0x1f) !== 31) land.push(i);

const tickMs: number[] = [];
let engineError: string | null = null;
let ticksRun = 0;
const runner: GameRunner = await createGameRunner(info, host.clientID, realm.files, (gu) => {
  if (!("updates" in gu)) {
    engineError = `${gu.errMsg}`;
    return;
  }
  ticksRun++;
  tickMs.push(gu.tickExecutionDuration ?? 0);
  // Report where this engine has got to, as a player's browser does: the
  // server compares everyone's and says so if one has fallen out of step.
  for (const h of gu.updates[GameUpdateType.Hash] as { tick: number; hash: number }[]) host.send({ type: "hash", tick: h.tick, hash: h.hash });
});
const game = runner.game;

// ---- what the bots do
let intents = 0;
const act = (bot: Bot) => {
  const g = game as unknown as {
    inSpawnPhase(): boolean;
    playerByClientID(id: string): BotPlayer | null;
    hasOwner(tile: number): boolean;
  };
  const me = g.playerByClientID(bot.clientID);
  const send = (intent: Msg) => {
    intents++;
    bot.send({ type: "intent", intent });
  };
  if (g.inSpawnPhase()) {
    if (me?.hasSpawned()) return;
    for (let tries = 0; tries < 40; tries++) {
      const tile = pick(land);
      if (!g.hasOwner(tile)) return send({ type: "spawn", tile });
    }
    return;
  }
  if (!me || !me.isAlive()) return;
  const roll = Math.random();
  if (roll < 0.7) {
    // March on a neighbour, or on the wilds.
    const around = me.nearby();
    if (around.length === 0) return;
    const foe = pick(around);
    if (foe.isPlayer() && me.isFriendly(foe)) return;
    send({ type: "attack", targetID: foe.isPlayer() ? foe.id() : null, troops: Math.floor(me.troops() * 0.3) });
  } else if (roll < 0.9 && Number(me.gold()) > 150_000) {
    // Raise a town somewhere on the border.
    const edge = [...me.borderTiles()];
    if (edge.length) send({ type: "build_unit", unit: UnitType.City, tile: pick(edge) });
  }
};
interface BotPlayer {
  hasSpawned(): boolean;
  isAlive(): boolean;
  troops(): number;
  gold(): bigint;
  id(): string;
  nearby(): { isPlayer(): boolean; id(): string }[];
  isFriendly(other: unknown): boolean;
  borderTiles(): Iterable<number>;
}

// ---- run
const began = performance.now();
const until = began + MINUTES * 60_000;
let lastReport = began;
let nextAct = began + 500;
let turnAt = 0;
let complained = false;
while (performance.now() < until && !engineError && !host.closed) {
  // The engine keeps up with the turns the server has sent.
  while (turnAt < turns.length) {
    runner.addTurn(turns[turnAt++]);
    runner.executeNextTick();
  }
  const now = performance.now();
  if (now >= nextAct) {
    // A few bots act each beat, so that all of them act every few seconds.
    nextAct = now + (turnAt > 0 && (game as unknown as { inSpawnPhase(): boolean }).inSpawnPhase() ? 1000 : 250);
    // While realms are being founded every bot gets its turn, so none is left
    // without one; after that a few act each beat, all of them every few seconds.
    const founding = (game as unknown as { inSpawnPhase(): boolean }).inSpawnPhase();
    const turn = founding ? bots : Array.from({ length: Math.max(1, Math.floor(bots.length / 12)) }, () => pick(bots));
    for (const bot of turn) {
      try {
        act(bot);
      } catch (e) {
        // A bot that cannot decide this beat simply waits; the first reason is worth knowing.
        if (!complained) {
          complained = true;
          console.log(`a bot could not act: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }
  if (now - lastReport >= 10_000) {
    lastReport = now;
    const recent = tickMs.slice(-100);
    const gaps = host.gaps.slice(-100).sort((a, b) => a - b);
    const alive = bots.filter((b) => !b.closed).length;
    console.log(
      `${String(Math.round((now - began) / 1000)).padStart(4)}s  turn ${turns.length}  engine ${(recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length)).toFixed(1)}ms/tick ` +
        `(worst ${Math.max(0, ...recent).toFixed(0)})  turn gap ${pct(gaps, 0.5).toFixed(0)}ms median, ${pct(gaps, 0.99).toFixed(0)} worst  ` +
        `${alive}/${bots.length} connected  ${intents} orders  ${desyncs} out-of-step`,
    );
  }
  await sleep(5);
}

// ---- what happened
const seconds = (performance.now() - began) / 1000;
const allTicks = [...tickMs].sort((a, b) => a - b);
const allGaps = bots.flatMap((b) => b.gaps).sort((a, b) => a - b);
const bytes = bots.reduce((n, b) => n + b.bytesIn, 0);
let server = "";
try {
  const http = SERVER.replace(/^ws/, "http").replace(/\/$/, "");
  const snap = (await (await fetch(`${http}/admin/api`, { signal: AbortSignal.timeout(3000) })).json()) as { memoryMB: number; online: number };
  server = `server memory ${snap.memoryMB} MB with ${snap.online} connected`;
} catch {
  server = "server memory: not readable from here (the dashboard answers only on the server itself, or with its token)";
}
const players = (game as unknown as { players(): { isAlive(): boolean; clientID(): string | null; numTilesOwned(): number }[] }).players();
const humans = players.filter((p) => p.clientID() !== null);
console.log(`
---- ${Math.round(seconds)}s, ${bots.length} bots, ${entry.map} ----
turns received        ${turns.length} (${(turns.length / seconds).toFixed(1)} a second; 10 is on time)
engine, per turn      ${(allTicks.reduce((a, b) => a + b, 0) / Math.max(1, allTicks.length)).toFixed(2)} ms average, ${pct(allTicks, 0.99).toFixed(1)} ms at the 99th, ${Math.max(0, ...allTicks).toFixed(0)} ms worst (100 is the budget)
gap between turns     ${pct(allGaps, 0.5).toFixed(0)} ms median, ${pct(allGaps, 0.99).toFixed(0)} ms at the 99th, ${Math.max(0, ...allGaps).toFixed(0)} ms worst, across all bots (100 is on time)
sent to each player   ${(bytes / bots.length / 1024 / seconds).toFixed(1)} KB a second
orders given          ${intents} (${(intents / seconds).toFixed(1)} a second)
still connected       ${bots.filter((b) => !b.closed).length} of ${bots.length}
bot realms alive      ${humans.filter((p) => p.isAlive()).length} of ${humans.length}
fell out of step      ${desyncs}
server errors         ${errors}${engineError ? `\nENGINE ERROR: ${engineError}` : ""}
${server}`);
for (const b of bots) b.ws.close();
process.exit(engineError || desyncs > 0 ? 1 : 0);
