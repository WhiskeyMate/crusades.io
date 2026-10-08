# crusades.io

A medieval territory-conquest game in 3D. Raise a banner, push your borders
out with levies you can see fighting on the line, build towns, keeps and
harbours, and take four fifths of the realm.

Play alone against AI kingdoms and clans, or host a game for friends. Built with
three.js on the OpenFront simulation engine (see `NOTICE.md`).

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5183. `npm run build` makes a static site in `dist/`.

`npm run sim -- Aldermark 7 900` plays a realm headless for 900 ticks and
prints the standings: a quick check that the engine still runs after a change.

## Play

- **Click** unclaimed land or a neighbour to attack with the share of your
  levies on the slider. Click land across water to send longships.
- **Right-click** a realm for diplomacy: pacts, gifts, trade bans.
- **1-0** or the bar picks something to build; click the map to place it.
  Click a building of the same kind to enlarge it.
- Click one of your war galleys, then the water, to send it somewhere.
- Drag to pan, wheel to zoom, right-drag or Q/E/R/F to turn and tilt, C to go
  home, Space to pause.

| In crusades.io   | What it does                                         |
| -------------- | ---------------------------------------------------- |
| Town           | Raises your levy cap                                 |
| Keep           | Makes nearby land much harder to take                |
| Harbour        | Merchant cogs for gold; needed for war galleys       |
| Market         | Roads and caravans between your holdings, for gold   |
| Ballista Tower | Shoots sorcery out of the sky                        |
| Mage Tower     | Needed to cast the three sorceries below             |
| Fireball       | Burns a town-sized hole                              |
| Dragon         | Lays a province to waste                             |
| Starfall       | Many falling stars on one enemy                      |

## Layout

```
packages/           the simulation (from OpenFront, modified)
resources/          name lists the simulation reads
src/worldgen/       realm loader: terrain from public/maps, kingdom seats from the seed
src/client/         session, state mirror, names, heraldry
src/net/            turn sources (local clock, game server), the wire protocol
server/             the game server (lobbies + turn relay) and Windows install script
src/render/         three.js: terrain, water, models, units, armies, effects
src/ui/             HUD, labels, styles
src/account/        optional sign-in, premium and custom arms
src/Attract.ts      the AI-only game behind the landing page
netlify/functions/  Stripe checkout, billing portal and webhook
supabase/           database schema for accounts
docs/               DEPLOY.md (Netlify, Supabase, Stripe), SERVER.md (game server), MULTIPLAYER.md
tools/              headless smoke run
```

Map terrain lives in `public/maps/` (OpenFront map data, CC BY-SA 4.0, see NOTICE.md); the kingdoms' seats and names come from the game's seed. Every model is
built from primitives in `src/render/Models.ts`; there are no art assets.

Accounts are off unless `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are
set at build time. On a dev server, `?premium` previews the arms editor.

## Licence

GNU AGPL v3.0, with the additional terms at the end of `LICENSE`. See `NOTICE.md`.
