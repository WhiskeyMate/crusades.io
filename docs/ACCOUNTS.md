# Accounts and signing in

Accounts are optional for players. Someone who signs in gets a record that
follows them from device to device (games, victories, the full statistics on
the Stats tab, and a standing from Squire to King) and a Customisation tab for
whatever cosmetics they own. The store is a separate switch: see
[STORE.md](STORE.md).

## Switches

| Where | Variable | What it does |
|---|---|---|
| Netlify (build) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | With both set, signing in is offered. |
| Netlify (build) | `VITE_ACCOUNTS=off` | Shuts accounts even though Supabase is set up. |
| Netlify (build) | `VITE_SIGNIN` | Which ways of signing in are offered, in order. Default `email`. Example: `discord,google,steam,email`. |
| Netlify (build) | `VITE_STORE_OPEN=on` | Opens the store (see STORE.md). Not needed for accounts. |
| Netlify (functions) | `STEAM_LOGIN=on` | Lets the two Steam functions run. |
| Netlify (functions) | `STEAM_API_KEY` | Optional. With it, a Steam player's account carries their Steam name. |
| Netlify (functions) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Already needed by the store's functions; the Steam functions use them too. |
| Game server (`C:\crusades\server.env`) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | With both set the game server recognises signed-in players (reserved names, cosmetics). No longer depends on `STORE_OPEN`. |

Only name a way of signing in in `VITE_SIGNIN` once it is set up below: a
button for one that is not set up leads to an error page.

## Database

Run `supabase/schema.sql` in the Supabase SQL editor. It is safe to re-run. It
adds the `records` table and the `record_game` function the Stats tab needs.
Until it has been run, signing in works but nothing is recorded.

## Redirect addresses

In Supabase, under Authentication > URL Configuration:

- Site URL: `https://crusades.io`
- Redirect URLs: `https://crusades.io`, and `http://localhost:5183` if you
  want to sign in on a dev server.

## Discord

1. At <https://discord.com/developers/applications>, make an application.
2. Under OAuth2, add the redirect
   `https://<your-project>.supabase.co/auth/v1/callback`.
3. Copy the Client ID and Client Secret into Supabase under Authentication >
   Providers > Discord, and enable it.
4. Add `discord` to `VITE_SIGNIN` and redeploy.

## Google

1. In the Google Cloud console, under APIs & Services > Credentials, make an
   OAuth client ID of type "Web application".
2. Authorised redirect URI:
   `https://<your-project>.supabase.co/auth/v1/callback`.
3. Set up the OAuth consent screen (app name, support email, the privacy
   policy and terms links). While it is in "Testing" only the test users you
   list can sign in; publish it to open it to everyone.
4. Copy the Client ID and Client Secret into Supabase under Authentication >
   Providers > Google, and enable it.
5. Add `google` to `VITE_SIGNIN` and redeploy.

## Steam

Steam uses OpenID 2.0, which Supabase does not speak, so two Netlify functions
stand between them (`netlify/functions/steam-login.mts` and
`steam-callback.mts`). Nothing needs registering with Steam.

1. Set `STEAM_LOGIN=on` in Netlify.
2. Optionally set `STEAM_API_KEY` (from
   <https://steamcommunity.com/dev/apikey>) so accounts carry Steam names.
3. Add `steam` to `VITE_SIGNIN` and redeploy.

How it works: the player is sent to Steam, which sends them back with a signed
statement of their Steam id. The callback asks Steam to confirm that statement
(it confirms each one once only), then signs the player in to an account filed
under `steam-<id>@steam.invalid`, making it on the first visit. That address
receives no mail, so the account cannot be entered by emailed link.

This path has not been exercised against the live Steam and Supabase services
yet. Test it on the deployed site before announcing it.

## What is recorded

When a game ends for a signed-in player (victory, defeat, their realm falling,
or leaving), their browser files it: the kind of game (public, private, solo),
whether it was won, the most land held, time played, and the engine's own
count of buildings, ships, sorcery, levies and gold. Games with endless gold or
instant building are not filed, nor are games under a minute.

The figures are self-reported by the browser. The database bounds what it
takes and accepts one game a minute per account, which is enough for a
personal record but not for anything with a prize attached.

## Trying it without Supabase

On a dev server, `?premium` signs you in as a pretend player with the store
open; `?premium&account` does the same with the store closed. Everything is
kept in the browser's local storage.
