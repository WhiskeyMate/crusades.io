# Notice

crusades.io is a modified version of OpenFront
(https://github.com/openfrontio/OpenFrontIO). The engine was taken from the
upstream repository and modified from 8 October 2026 onward.

- The simulation in `packages/` (engine, engine-api, engine-lib, zbin) and
  `src/client/MotionPlanResolver.ts` are taken from OpenFront and modified:
  package scope renamed, the real-world map list replaced by generated realms,
  player-facing strings rewritten. © OpenFront and Contributors.
- Everything else (the three.js client in `src/`, the realm generator, all
  models, names and text) is new work for crusades.io.

The whole program is licensed under the GNU Affero General Public License
v3.0 with the additional terms at the end of `LICENSE`. Those terms require
that the notice "© OpenFront and Contributors" stays visible to players (it is
in the main menu footer) and that this project does not present itself as
OpenFront or as endorsed by it.

No OpenFront artwork, maps, flags, sounds or proprietary assets are included.

If you host crusades.io for other people to play, the AGPL requires you to offer
them the source of the version you are running. Set `SOURCE_URL` in
`src/main.ts` to where it can be fetched; a link then appears in the menu.
