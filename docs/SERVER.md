# Running the game server on your Windows machine

The game server is one Node process (`server/`). It keeps lobbies, bundles
each player's actions into a turn ten times a second and sends the turns to
everyone in the game. It does not run the simulation, so it is light: a
few kilobytes a second per player.

Your machine: **40.160.26.142**, Windows.

## What you need before starting

1. **A hostname.** Browsers on the https site will only open secure
   WebSocket (`wss://`) connections, and a certificate can only be issued for
   a name, not a bare IP. In your domain's DNS add an A record, for example
   `play.crusades.io → 40.160.26.142`. Wait until `nslookup play.crusades.io`
   answers with that address.
2. **Ports 80 and 443 reachable from the internet.** If the machine is
   behind a router, forward both TCP ports to it. 80 is only used to prove
   you own the name when the certificate is issued; the game runs on 443.
3. **Node 22 or newer** on the machine (`node --version`).
4. A copy of this repository on the machine (`git clone`, then `npm ci`).

## Install

In an **elevated** PowerShell, in the project folder:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\server\install-windows.ps1 -Hostname play.crusades.io
```

The script builds the server, copies it to `C:\crusades`, downloads NSSM
(a service wrapper) and Caddy (the HTTPS front door), registers both as
Windows services that start on boot and restart on a crash, and opens the
firewall. It ends by checking the server answers.

Then check from the outside: open `https://play.crusades.io/health` in a
browser on another network (your phone off wifi). It should show
`{"ok":true,...}`. The first visit can take a few seconds while Caddy
fetches the certificate.

## Point the site at it

In Netlify, **Site configuration > Environment variables**, add:

```
VITE_GAME_SERVER = wss://play.crusades.io
```

and redeploy. The setup dialog then shows "Host a game" and "Join" under the
single-player options. Without this variable the site has no online play
and never contacts your machine.

## The dashboard

The server has a control panel at `/admin`. On the machine itself open
`http://127.0.0.1:8765/admin`; from anywhere else open
`https://play.crusades.io/admin?token=…` with the token the install script
printed (it is kept in `C:\crusadesdmin-token.txt`; the script reuses it on
re-runs). Treat the token like a password: anyone with it can end games.

It shows who is online, every lobby and running game with its members and
turn count, memory and uptime, and the last 400 log lines, refreshing every
two seconds. Controls:

- **Notice to everyone** — a line shown to every connected player (a toast
  in game, a status line in the hall). Use it before a restart.
- **Public game countdown** — change the wait live, no restart.
- **Maintenance** — stops new games: the public game is withdrawn and
  hosting or joining is refused with a "back soon" message. Running games
  carry on. Turn it on, send a notice, wait for games to end, then update.
- Per game: **End** (running) or **Start now** (an open lobby with people in
  it). Per player: **kick** drops their connection; they can rejoin.

## Day to day

| Task | How |
| --- | --- |
| See it running | `services.msc`: CrusadesServer and CrusadesCaddy |
| Logs | `C:\crusades\logs\server.log`, `caddy.log` |
| Who is online | `http://127.0.0.1:8765/health` on the machine, or the `/health` page over https |
| Restart | `C:\crusades\bin\nssm.exe restart CrusadesServer` |
| Update after a code change | `git pull`, then re-run the install script (it rebuilds, copies the maps and restarts) |
| Remove | `nssm remove CrusadesServer confirm`, same for `CrusadesCaddy` |
| Change the public countdown | `nssm set CrusadesServer AppEnvironmentExtra PORT=8765 HOST=127.0.0.1 PUBLIC_WAIT_SECONDS=60`, then restart |

A restart drops every running game; players see "Lost the server". Do it
when `/health` shows `running: 0`.

## Things that will bite

- **Dynamic IP.** If your ISP changes your address, the DNS record goes
  stale and nobody can connect. Either get a static IP or run a dynamic DNS
  updater on the machine.
- **Carrier-grade NAT.** Some ISPs do not give you a reachable address at
  all. The sign is that port forwarding is set up but the health page never
  loads from outside. The fix is a tunnel (Cloudflare Tunnel works with
  WebSockets) or hosting elsewhere.
- **Windows Update reboots.** Set active hours, or games will drop at 3am.
- **Sleep.** Set the power plan to never sleep.
- **Upload speed.** Budget about 2 KB/s per connected player. 100 players
  is roughly 2 Mbit/s up. Check what your connection gives you.
- **Latency.** Every player's click waits for your machine to echo it back.
  Players on your side of the world will feel it at around 50 ms; players
  on the other side at 200 ms or more.

## Running it by hand (for testing)

```powershell
npm run server
```

starts it on `ws://localhost:8765` without Caddy or a service. The dev site
(`npm run dev`) connects to that address automatically.

## What the server does and does not do

- Validates every message against the engine's own schemas and refuses
  host-only actions (pausing, kicking, changing settings).
- Stamps every action with the sender's identity itself; a client cannot
  act as someone else.
- Keeps every turn of a running game so a player who drops can take their
  seat back (the browser remembers it for the tab's lifetime) and replay to
  the present.
- Marks a dropped player absent so the engine protects their realm for a
  while, and marks them back when they return.
- Compares the engine state hashes clients report and tells a client that
  has diverged.
- Generates each realm itself and sends a fingerprint; a browser whose own
  copy differs downloads the server's terrain instead of playing a
  different map.
- Keeps one public game open at all times, rotating through the realms,
  starting it 90 seconds after the first player joins (or at once when 40
  have), then opens the next.
- Closes a game two minutes after the last player leaves, or after four
  hours.
- Does **not** run the game, so it cannot catch a client that cheats by
  automating play. It cannot be used to conjure gold either, because every
  other client's engine would refuse the illegal action.
