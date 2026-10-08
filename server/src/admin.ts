// The server's dashboard: one page at /admin that polls /admin/api every two
// seconds. Shows who is connected, every lobby and game with its members and
// turn count, the recent log, and lets you end a game.
//
// Access: from the machine itself (127.0.0.1) always; from elsewhere only
// with ?token=ADMIN_TOKEN, which the install script generates.

import { IncomingMessage, ServerResponse } from "node:http";

export interface AdminSnapshot {
  version: string;
  startedAt: number;
  now: number;
  online: number;
  memoryMB: number;
  publicWaitSeconds: number;
  maintenance: boolean;
  verbose: boolean;
  clients: {
    clientID: string;
    name: string;
    lobby: string | null;
    from: string;
    connectedAt: number;
    intentsThisTurn: number;
  }[];
  lobbies: {
    code: string;
    kind: string;
    status: string;
    map: string;
    seed: number;
    kingdoms: number;
    clans: number;
    difficulty: string;
    maxPlayers: number;
    startsAt: number;
    startedAt: number;
    turns: number;
    pendingIntents: number;
    members: { clientID: string; name: string; connected: boolean }[];
  }[];
  log: string[];
}

const LOG_LINES = 400;
const logBuffer: string[] = [];

/** Keep the last few hundred log lines for the page. */
export function remember(line: string) {
  logBuffer.push(line);
  if (logBuffer.length > LOG_LINES) logBuffer.splice(0, logBuffer.length - LOG_LINES);
}

export function recentLog(): string[] {
  return logBuffer;
}

function allowed(req: IncomingMessage, url: URL, token: string | undefined): boolean {
  const addr = req.socket.remoteAddress ?? "";
  const local = addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
  // Behind Caddy every request looks local; trust the forwarded address then.
  const forwarded = req.headers["x-forwarded-for"];
  const reallyLocal = local && !forwarded;
  if (reallyLocal) return true;
  return token !== undefined && token !== "" && url.searchParams.get("token") === token;
}

export function handleAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  token: string | undefined,
  snapshot: () => AdminSnapshot,
  act: (action: string, arg: string) => string,
): boolean {
  if (!url.pathname.startsWith("/admin")) return false;
  if (!allowed(req, url, token)) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end(
      token
        ? "Forbidden: open this page as /admin?token=... (the token is in C:\\crusades\\admin-token.txt on the server)."
        : "Forbidden: the dashboard is only reachable from the server itself unless ADMIN_TOKEN is set.",
    );
    return true;
  }
  if (url.pathname === "/admin/api") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(snapshot()));
    return true;
  }
  if (url.pathname === "/admin/act" && req.method === "POST") {
    const result = act(url.searchParams.get("action") ?? "", url.searchParams.get("arg") ?? "");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ result }));
    return true;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(PAGE);
  return true;
}

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>crusades.io server</title>
<style>
  :root { --ink:#f2e6c9; --dim:#b9a98a; --gold:#dcb65a; --bad:#e2664f; --good:#8fcf7a; --edge:#6b5230; }
  body { margin:0; background:#15100a; color:var(--ink); font:14px/1.45 "Palatino Linotype","Book Antiqua",Georgia,serif; }
  header { display:flex; flex-wrap:wrap; gap:18px 32px; align-items:baseline; padding:14px 22px; background:#1e150e; border-bottom:1px solid var(--edge); }
  header h1 { margin:0; font-size:20px; color:var(--gold); }
  header h1 span { color:#d0443a; }
  .stat b { font-size:20px; display:block; line-height:1.1; }
  .stat span { font-size:11px; text-transform:uppercase; letter-spacing:.7px; color:var(--dim); }
  main { padding:16px 22px; display:grid; gap:18px; grid-template-columns: 1fr; max-width:1400px; }
  @media (min-width:1100px) { main { grid-template-columns: 3fr 2fr; } .wide { grid-column:1/3; } }
  section { background:#1e150e; border:1px solid var(--edge); border-radius:6px; padding:12px 14px; min-width:0; }
  h2 { margin:0 0 8px; font-size:15px; color:var(--gold); display:flex; justify-content:space-between; align-items:baseline; }
  h2 small { color:var(--dim); font-weight:normal; font-size:12px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { text-align:left; color:var(--dim); font-weight:normal; font-size:11px; text-transform:uppercase; letter-spacing:.6px; padding:4px 6px; border-bottom:1px solid #33271a; }
  td { padding:5px 6px; border-bottom:1px solid #2a2016; vertical-align:top; }
  tr:last-child td { border-bottom:0; }
  .code { font-family:Consolas,monospace; letter-spacing:1px; color:var(--gold); }
  .tag { display:inline-block; padding:1px 7px; border-radius:9px; font-size:11px; border:1px solid var(--edge); color:var(--dim); }
  .tag.running { color:#1b1410; background:var(--good); border-color:var(--good); }
  .tag.open { color:#1b1410; background:var(--gold); border-color:var(--gold); }
  .tag.public { color:#cfe4ff; border-color:#4c6f9a; }
  .members { color:var(--dim); font-size:12px; }
  .members i { font-style:normal; color:var(--bad); }
  button { font:inherit; font-size:12px; color:var(--ink); background:#33240f; border:1px solid var(--edge); border-radius:4px; padding:2px 8px; cursor:pointer; }
  button:hover { border-color:var(--bad); color:#ffb4a3; }
  pre { margin:0; max-height:420px; overflow:auto; font:12px/1.4 Consolas,monospace; color:#d9ccae; white-space:pre-wrap; }
  pre .t { color:#6f6250; }
  .dim { color:var(--dim); }
  .bad { color:var(--bad); }
  #status { font-size:12px; color:var(--dim); margin-left:auto; }
  .controls .row { display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; padding:4px 0; }
  .controls label { display:flex; gap:8px; align-items:center; color:var(--dim); }
  .controls input[type=text], .controls input:not([type]), .controls input[type=number] { font:inherit; color:var(--ink); background:#120c07; border:1px solid var(--edge); border-radius:4px; padding:4px 8px; min-width:260px; }
  .controls input[type=number] { min-width:0; }
  .controls button { padding:4px 12px; }
  .controls button:hover { border-color:var(--gold); color:var(--ink); }
  button.kick { padding:0 5px; font-size:11px; margin-left:4px; }
  .switch input { accent-color:#c0392b; }
</style>
</head>
<body>
<header>
  <h1>crusades<span>.io</span> server</h1>
  <div class="stat"><b id="online">–</b><span>online</span></div>
  <div class="stat"><b id="running">–</b><span>games running</span></div>
  <div class="stat"><b id="waiting">–</b><span>in lobbies</span></div>
  <div class="stat"><b id="uptime">–</b><span>uptime</span></div>
  <div class="stat"><b id="mem">–</b><span>memory</span></div>
  <div class="stat"><b id="version">–</b><span>protocol</span></div>
  <div id="status"></div>
</header>
<main>
  <section class="wide controls">
    <h2>Controls</h2>
    <div class="row">
      <label>Notice to everyone <input id="notice" maxlength="300" placeholder="e.g. Restarting in 5 minutes"></label>
      <button id="send-notice">Send</button>
    </div>
    <div class="row">
      <label>Public game countdown <input id="wait" type="number" min="10" max="600" style="width:70px"> s</label>
      <button id="set-wait">Apply</button>
      <label class="switch"><input id="maint" type="checkbox"> Maintenance: no new games, hall shows nothing</label>
      <label class="switch"><input id="verbose" type="checkbox"> Verbose log: every message per client</label>
      <span id="result" class="dim"></span>
    </div>
  </section>
  <section>
    <h2>Games and lobbies <small id="lobby-note"></small></h2>
    <table><thead><tr><th>Code</th><th>Kind</th><th>Realm</th><th>Lords</th><th>Progress</th><th></th></tr></thead><tbody id="lobbies"></tbody></table>
  </section>
  <section>
    <h2>Connected <small id="client-note"></small></h2>
    <table><thead><tr><th>House</th><th>Id</th><th>In</th><th>From</th><th>For</th></tr></thead><tbody id="clients"></tbody></table>
  </section>
  <section class="wide">
    <h2>Log <small>last 400 lines, newest at the bottom</small></h2>
    <pre id="log"></pre>
  </section>
</main>
<script>
const token = new URLSearchParams(location.search).get("token");
const q = token ? "?token=" + encodeURIComponent(token) : "";
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const ago = ms => { const s = Math.max(0, Math.round(ms/1000)); if (s < 60) return s + "s"; const m = Math.floor(s/60); if (m < 60) return m + "m " + (s%60) + "s"; const h = Math.floor(m/60); return h + "h " + (m%60) + "m"; };
let pinned = false;
async function tick() {
  let d;
  try {
    const r = await fetch("/admin/api" + q, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status + " " + r.statusText);
    d = await r.json();
    document.getElementById("status").textContent = "updated " + new Date().toLocaleTimeString();
  } catch (e) {
    document.getElementById("status").innerHTML = '<span class="bad">cannot reach the server: ' + esc(e.message) + '</span>';
    return;
  }
  const running = d.lobbies.filter(l => l.status === "running");
  const waiting = d.lobbies.filter(l => l.status === "open").reduce((n, l) => n + l.members.length, 0);
  document.getElementById("online").textContent = d.online;
  document.getElementById("running").textContent = running.length;
  document.getElementById("waiting").textContent = waiting;
  document.getElementById("uptime").textContent = ago(d.now - d.startedAt);
  document.getElementById("mem").textContent = d.memoryMB + " MB";
  document.getElementById("version").textContent = d.version;
  document.getElementById("lobby-note").textContent = d.lobbies.length === 0 ? "none" : "public games wait " + d.publicWaitSeconds + "s after the first lord joins";
  document.getElementById("lobbies").innerHTML = d.lobbies.map(l => {
    const progress = l.status === "running"
      ? "turn " + l.turns.toLocaleString() + " · " + ago(d.now - l.startedAt) + (l.pendingIntents ? " · " + l.pendingIntents + " queued" : "")
      : l.kind === "public" ? (l.members.length ? "starts in " + ago(l.startsAt - d.now) : "waiting for a lord") : "waiting for the host";
    const members = l.members.map(m => esc(m.name) + (m.connected ? ' <button class=kick data-kick="' + m.clientID + '" title="Disconnect this player">kick</button>' : " <i>(away)</i>")).join(", ") || "<span class=dim>nobody</span>";
    return '<tr><td class=code>' + l.code + '</td>'
      + '<td><span class="tag ' + l.kind + '">' + l.kind + '</span> <span class="tag ' + l.status + '">' + l.status + '</span></td>'
      + '<td>' + esc(l.map) + '<div class=dim>seed ' + l.seed + ' · ' + l.kingdoms + ' kingdoms · ' + l.clans + ' clans · ' + esc(l.difficulty) + '</div></td>'
      + '<td>' + l.members.length + '/' + l.maxPlayers + '<div class=members>' + members + '</div></td>'
      + '<td>' + progress + '</td>'
      + '<td>' + (l.status === "running" ? '<button data-end="' + l.code + '">End</button>' : (l.members.length ? '<button data-start="' + l.code + '">Start now</button>' : '')) + '</td></tr>';
  }).join("");
  for (const b of document.querySelectorAll("[data-end]")) b.onclick = () => confirm("End game " + b.dataset.end + " for everyone?") && act("end", b.dataset.end);
  for (const b of document.querySelectorAll("[data-start]")) b.onclick = () => act("start", b.dataset.start);
  for (const b of document.querySelectorAll("[data-kick]")) b.onclick = () => act("kick", b.dataset.kick);
  if (document.activeElement !== document.getElementById("wait")) document.getElementById("wait").value = d.publicWaitSeconds;
  document.getElementById("maint").checked = d.maintenance;
  document.getElementById("verbose").checked = d.verbose;
  document.getElementById("client-note").textContent = d.clients.length + " connection" + (d.clients.length === 1 ? "" : "s");
  document.getElementById("clients").innerHTML = d.clients.map(c =>
    '<tr><td>' + (c.name ? esc(c.name) : '<span class=dim>(no name yet)</span>') + '</td><td class=code>' + c.clientID + '</td>'
    + '<td>' + (c.lobby ? '<span class=code>' + c.lobby + '</span>' : '<span class=dim>the hall</span>') + '</td>'
    + '<td class=dim>' + esc(c.from) + '</td><td class=dim>' + ago(d.now - c.connectedAt) + '</td></tr>').join("");
  const pre = document.getElementById("log");
  const atBottom = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 30;
  pre.innerHTML = d.log.map(line => line.replace(/^(\\S+)\\s/, '<span class=t>$1</span> ')).map(esc2).join("\\n");
  if (atBottom) pre.scrollTop = pre.scrollHeight;
}
// Escape everything except the timestamp span we just added.
function esc2(line) { return line.replace(/<span class=t>|<\\/span>/g, m => m === "<span class=t>" ? "\\u0001" : "\\u0002").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])).replace(/\\u0001/g, "<span class=t>").replace(/\\u0002/g, "</span>"); }
async function act(action, arg) {
  const r = await fetch("/admin/act" + (q ? q + "&" : "?") + "action=" + action + "&arg=" + encodeURIComponent(arg), { method: "POST" });
  const d = await r.json();
  document.getElementById("result").textContent = d.result;
  tick();
}
document.getElementById("send-notice").onclick = () => { const i = document.getElementById("notice"); if (i.value.trim()) { act("notice", i.value); i.value = ""; } };
document.getElementById("notice").onkeydown = e => { if (e.key === "Enter") document.getElementById("send-notice").click(); };
document.getElementById("set-wait").onclick = () => act("wait", document.getElementById("wait").value);
document.getElementById("maint").onchange = e => act("maintenance", e.target.checked ? "1" : "0");
document.getElementById("verbose").onchange = e => act("verbose", e.target.checked ? "1" : "0");
tick();
setInterval(tick, 2000);
</script>
</body>
</html>`;
