# Multiplayer: design

Status: public games (one always gathering on the landing page, timed
start), private lobbies with a link, lockstep play, reconnect, desync check
and realm fingerprint all work. Snapshots for long games and server-issued
arms are still to do. Deployment: docs/SERVER.md.

## The model: lockstep

The engine was built for this. It is deterministic: give two copies the same
realm and the same list of turns and they stay identical tick for tick. So
the simulation never has to be sent over the network. Every player's browser
runs the whole game; the only shared thing is the **turn stream**.

```
 player clicks ──intent──▶ game server ──turn (all intents this 100 ms)──▶ every player
                                                                              │
                                                              each browser runs the tick
```

- An **intent** is "I attack X with N levies", "build a keep here".
- Ten times a second the server bundles the intents it received into a
  **turn**, numbers it, and sends it to everyone in the game.
- Each client feeds turns to its engine worker in order. That is all.

The server does not simulate anything. It is a relay with a clock, which is
why one small machine can carry many games.

## What has to be built

| Part | Runs on | State |
| --- | --- | --- |
| Static site | Netlify | done |
| Turn source seam in the client | browser | **done**: `src/net/Transport.ts` |
| A game that starts on a timer with no solo player | browser | **done**: the landing-page backdrop uses it |
| `SocketTransport` (turns from a server) | browser | **done**: `src/net/SocketTransport.ts` |
| Game server: lobbies, relay, clock | a long-running Node process | **done**: `server/src/index.ts` |
| Lobby screens and the hall (public list, host, solo) | browser | **done**: `src/ui/Lobby.ts`, landing page |
| Public game rotation | server | **done**: one open at a time, `PUBLIC_WAIT_SECONDS` |
| Reconnect (replay from turn 0) | both | **done**; late join and snapshots to do |
| Desync detection | both | **done** (first report per tick wins; the other is told) |
| Accounts and arms visible to others | server + Supabase | to do |

### The seam that exists

`Session` no longer makes its own turns. It asks a `Transport`:

```ts
interface Transport {
  onTurn: (turn: Turn) => void;   // every turn, in order
  send(intent: Intent): void;     // what the local player wants
  start(): void; stop(): void;
  turnMs(): number;
  readonly ownsClock: boolean;    // may this client pause / change speed?
}
```

Single-player uses `LocalTransport`, a clock in the page. Multiplayer adds a
`SocketTransport` with the same shape; `Session`, the renderer and the HUD do
not change. Pause and speed already switch themselves off when the transport
does not own the clock.

## The game server

One Node process using `ws`. It reuses the engine's own schemas
(`packages/engine-api/src/Schemas.ts`) to validate what clients send.

**Lobby.** A lobby has an id, a config (realm layout, seed, kingdoms, clans,
difficulty) and a list of members. Two kinds:

- *Private*: someone creates it and shares a link (`/?join=ABCD1234`). The
  creator presses start.
- *Public*: the server keeps one open at a time and starts it when it fills
  or a countdown ends. This is the "Play online" button.

**Start.** The server fixes the player list and sends everyone the same
`GameStartInfo` (the engine's own type: game id, config, players) plus the
realm seed. Game type is `Private` or `Public`, which gives the timed opening
(20 seconds to pick a seat) instead of the solo "wait for the player" one.

**Relay.** Every 100 ms: take the intents received since the last turn, stamp
each with the sender's client id **from the connection, not from the
message**, and broadcast the turn. Keep every turn of the game in memory.

**End.** Clients report the winner the engine announced; the server closes
the game when they agree or everyone has left.

### Messages (first draft, JSON)

Client to server:

| Message | Fields |
| --- | --- |
| `hello` | `name`, optional `token` (Supabase access token) |
| `create` | lobby config |
| `join` | `lobby` id, optional `fromTurn` when reconnecting |
| `start` | (lobby owner only) |
| `intent` | one engine `Intent` |
| `hash` | `tick`, `hash` (see Desync) |

Server to client:

| Message | Fields |
| --- | --- |
| `welcome` | your `clientID` |
| `lobby` | members, config, countdown |
| `start` | `GameStartInfo`, `seed`, `realmHash`, `cosmetics` |
| `turn` | one engine `Turn` |
| `catchup` | an array of turns (reconnect or late join) |
| `desync` | you have diverged; reload from turn 0 |
| `error` | reason |

JSON is fine to begin with: a turn with a few intents is a few hundred bytes.
The engine ships a compact binary encoding for these same schemas
(`packages/zbin`) to switch to if bandwidth ever matters.

## Things that need care

**The realm must be identical everywhere.** Realms are generated in the
browser from the seed. The generator uses floating-point maths
(`Math.hypot`, `Math.pow`) whose last bits can differ between browsers, and
one different tile is a desync. So: the server generates the realm too and
sends a hash of the terrain bytes in `start`. A client whose own realm
hashes the same uses it; one that differs downloads the terrain from the
server (about 1.2 MB before compression). Cheap to build, and it removes the
risk entirely.

**Desync.** The engine already emits a state hash every 10 ticks. Clients
send it up; the server compares; a client in the minority is told to reload
and replay. Without this, a diverged player quietly plays a different game.

**Reconnect and late join.** Because the server keeps every turn, a client
can always rebuild the game: start from turn 0 and fast-forward (the worker
has a `run_turns` call that runs turns as fast as it can). That is seconds
for a young game, longer for an old one. The engine can also snapshot its
whole state; having one client upload a snapshot every few minutes would cap
catch-up time. Start with replay, add snapshots when games run long.

**Cheating.** Every client holds the whole game state, so there is nothing
hidden to peek at, and the server cannot check moves because it does not
simulate. What it can and must do: validate every intent against the schema,
stamp identity itself, and rate-limit. An illegal intent (attacking with
levies you do not have) is simply refused by every engine identically.
A modified client can automate play but cannot conjure gold.

**Players who leave.** The engine has a `mark_disconnected` intent; the
server sends it for a dropped connection so the realm stops being a free
target for a grace period.

**Slow machines.** A client that cannot keep up at 10 ticks a second falls
behind and catches up in bursts. The client should show "catching up" and
the lobby should cap realm size and clan count for public games.

## Accounts and arms in multiplayer

Guests can play: the server hands them an id. A signed-in player sends their
Supabase token in `hello`; the server verifies it, looks up `profiles` and
`skins` with the service key, and puts the result in the `cosmetics` map of
the `start` message (`clientID -> Skin`). Clients colour each human realm
from that map. Because the server is the one saying who wears what, premium
cannot be faked in a shared game, which it can today in solo play.

## Where the server runs

**Not on Netlify.** Netlify serves files and runs short request/response
functions. A game server holds WebSocket connections open for an hour and
runs a 100 ms clock; that needs a process that stays up.

| Option | Good for | Notes |
| --- | --- | --- |
| **Fly.io** (recommended to start) | getting going, adding regions later | Deploys a Dockerfile, gives you HTTPS and WebSockets, lets you pin one machine. A small shared VM costs a few dollars a month. |
| A VPS (Hetzner, DigitalOcean) | lowest cost, most control | You manage the box: Node, a process manager, Caddy or nginx for TLS. |
| Railway / Render | least setup | Push a repo, get a URL. Check that the plan does not sleep idle services, or games will drop. |
| Cloudflare Durable Objects | very large scale later | One object per game, WebSockets included, no machine to run. A different programming model; not a first step. |

Whichever you choose, the shape is the same:

1. The server lives in this repository (say `server/`) with its own
   `package.json`, importing the engine's schema package.
2. It listens on one port for WebSocket connections at `wss://play.YOURDOMAIN`.
3. The site is built with `VITE_GAME_SERVER=wss://play.YOURDOMAIN`; with that
   unset, the "Play online" button does not appear.
4. The server gets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` so it can
   check tokens and read arms.

**Size.** Relaying is light: per game, ten small messages a second to each
player. One 1-vCPU machine with 512 MB should carry several hundred
concurrent players. The limit you hit first is more likely a single browser
struggling with a huge realm than the server. Scaling out later means more
processes behind a small "which machine has lobby X" lookup; one game always
lives on one process.

**Regions.** Lockstep adds your ping to every action, so a player far from
the server feels a delay between click and effect. One region is fine to
launch; add a second when players elsewhere complain, and let the lobby list
show both.

## Order of work

1. **Private games with a link.** Server (lobby, start, relay), a
   `SocketTransport`, a lobby screen. Server sends the realm hash. This is
   the first thing two people can play.
2. **Staying in the game.** Reconnect by replay, disconnect marking, desync
   detection, a "catching up" indicator.
3. **Public games.** The always-open public lobby, a server list, sensible
   caps on realm size.
4. **Identity.** Token check on `hello`, arms sent to everyone, names
   reserved for accounts.
5. **Scale.** Snapshots for long games, binary messages, more than one
   server process, a second region.

## Decisions that are yours

- **Where to host the server** (table above). Fly.io is my suggestion.
- **How many humans per game.** The engine handles hundreds of realms; the
  practical cap is what the slowest player's browser can simulate. I would
  launch public games at 30 to 50 humans plus clans and raise it from there.
- **Guests in public games,** or accounts only. Guests mean more players and
  more throwaway griefers; accounts-only is quieter and smaller.
- **Licence of the server.** It imports the engine's schemas, so it is AGPL
  with the rest and its source is published. The account functions are
  separate programs and need not be, though here they sit in the same repo.
