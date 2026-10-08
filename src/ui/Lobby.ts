// Online play from the hall: the list of public games starting soon,
// hosting a private lobby, joining by code, and the waiting room.

import { Session } from "../client/Session";
import { GAME_SERVER, Online } from "../net/Online";
import { LobbyConfig, LobbyView, PublicGame } from "../net/Protocol";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface OnlineHooks {
  /** The player's house name from the hall. */
  name: () => string;
  /** A started game, ready to launch. */
  begin: (session: Session) => void;
  /** The settings in the setup dialog, for a lobby to host. */
  lobbyConfig: () => LobbyConfig;
}

let online: Online | null = null;
let games: PublicGame[] = [];
let countdown = 0;
let retryIn = 2000;

/** Seconds until a server timestamp, on the server's clock. */
const seconds = (at: number) => Math.max(0, Math.ceil((at - (Date.now() + (online?.clockOffset ?? 0))) / 1000));
const countdown_text = (at: number) => {
  const s = seconds(at);
  return s > 0 ? `Starts in ${s}s` : "Starting…";
};

export function initOnline(hooks: OnlineHooks): { hostLobby: () => void } {
  if (!GAME_SERVER) {
    el("public-games").hidden = true;
    el("hall-host").hidden = true;
    (document.querySelector(".hall-join") as HTMLElement).hidden = true;
    return { hostLobby: () => {} };
  }

  const status = (text: string, bad = false) => {
    const s = el("online-status");
    s.textContent = text;
    s.hidden = text === "";
    s.classList.toggle("bad", bad);
  };

  /** Connect (once) and keep the hall's list fresh. Reconnects while in the hall. */
  async function connect(): Promise<Online | null> {
    if (online) return online;
    const o = new Online(hooks.name());
    try {
      await o.connect(GAME_SERVER!);
    } catch (e) {
      const why = e instanceof Error && e.message.includes("older version") ? e.message : "The game server is not reachable.";
      el("public-list").innerHTML = `<p class="dim small">${why} Solo play still works.</p>`;
      scheduleRetry();
      return null;
    }
    online = o;
    retryIn = 2000;
    o.onError = (m) => status(m, true);
    o.onHall = (list, running, count) => {
      games = list;
      el("hall-online").textContent =
        `${count} online${running > 0 ? ` · ${running} game${running === 1 ? "" : "s"} running` : ""}`;
      drawPublic();
    };
    o.onLobby = (lobby) => showLobby(lobby);
    o.onClose = () => {
      online = null;
      games = [];
      el("lobby").hidden = true;
      if (!el("hud").hidden) status("Lost the game server.", true);
      el("public-list").innerHTML = `<p class="dim small">Lost the game server. Trying again…</p>`;
      scheduleRetry();
    };
    o.onNotice = (m) => {
      const game = (window as unknown as { crusades?: { hud?: { toast(t: string, k: string): void } } }).crusades;
      if (game?.hud && el("hud").hidden === false) game.hud.toast(`Herald: ${m}`, "warn");
      else status(`Herald: ${m}`);
    };
    o.onEnded = () => {
      el("lobby").hidden = true;
      status("The game has ended.");
    };
    o.onStart = (g) => {
      el("lobby-countdown").textContent = "Raising the realm…";
      const session = new Session({
        realm: g.realm,
        info: g.info,
        clientID: g.clientID,
        transport: g.transport,
        catchup: g.catchup,
      });
      session.onHash = (tick, hash) => o.reportHash(tick, hash);
      hooks.begin(session);
    };
    o.onDesync = () => {
      const game = (window as unknown as { crusades?: { hud?: { toast(t: string, k: string): void } } }).crusades;
      game?.hud?.toast("Your game has diverged from the others. Leave and rejoin to resync.", "bad");
    };
    status("");
    return o;
  }

  function scheduleRetry() {
    window.setTimeout(() => {
      if (!online && el("hud").hidden) void connect();
    }, retryIn);
    retryIn = Math.min(30_000, retryIn * 1.6);
  }

  function drawPublic() {
    const list = el("public-list");
    if (games.length === 0) {
      list.innerHTML = `<p class="dim small">No public game is open right now.</p>`;
      return;
    }
    const mine = online?.lobby?.code;
    list.innerHTML = games
      .map((g) => {
        const s = seconds(g.startsAt);
        const c = g.config;
        const inIt = g.code === mine;
        return (
          `<div class="pub${inIt ? " in" : ""}" data-code="${g.code}">` +
          `<div class="pub-map">${esc(c.map)}</div>` +
          `<div class="pub-meta">${g.players} of ${c.maxPlayers} lords · ${c.kingdoms} kingdoms · ${c.clans} clans</div>` +
          `<div class="pub-time"><b>${g.players === 0 ? "—" : s > 0 ? `${s}s` : "…"}</b><span>${g.players === 0 ? "waiting for lords" : s > 0 ? "until it starts" : "starting"}</span></div>` +
          `<button>${inIt ? "You're in — waiting" : "Join this game"}</button></div>`
        );
      })
      .join("");
    for (const b of Array.from(list.querySelectorAll<HTMLButtonElement>(".pub button"))) {
      b.onclick = () => void joinCode((b.parentElement as HTMLElement).dataset.code!);
    }
  }

  // Countdowns tick locally between server updates.
  window.clearInterval(countdown);
  countdown = window.setInterval(() => {
    if (games.length > 0 && el("hud").hidden) drawPublic();
    const lobby = online?.lobby;
    if (lobby?.kind === "public" && lobby.startsAt && !el("lobby").hidden) {
      el("lobby-countdown").textContent =
        lobby.members.length === 0 ? "Waiting for lords" : countdown_text(lobby.startsAt);
    }
  }, 500);

  /** Make sure the server knows our name; false if there isn't one. */
  function named(o: Online): boolean {
    const name = hooks.name();
    if (name.length < 3) {
      status("Choose a house name first.", true);
      el("opt-name").focus();
      return false;
    }
    o.setName(name);
    return true;
  }

  async function joinCode(code: string) {
    const o = await connect();
    if (!o || !named(o)) return;
    if (o.lobby?.code === code) return;
    if (o.lobby) o.leave();
    o.join(code);
  }

  function hostLobby() {
    void (async () => {
      const o = await connect();
      if (!o) {
        el("opt-error").textContent = "The game server is not reachable.";
        el("opt-error").hidden = false;
        return;
      }
      if (!named(o)) {
        el("menu").hidden = true;
        return;
      }
      if (o.lobby) o.leave();
      o.create(hooks.lobbyConfig());
      el("menu").hidden = true;
    })();
  }

  function showLobby(lobby: LobbyView | null) {
    const box = el("lobby");
    drawPublic();
    if (!lobby) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    el("menu").hidden = true;
    const me = online!.clientID;
    const pub = lobby.kind === "public";
    const host = !pub && lobby.owner === me;
    el("lobby-title").textContent = pub ? `Public game: ${lobby.config.map}` : "Gathering the lords";
    el("lobby-code").textContent = lobby.code;
    el("lobby-countdown").hidden = !pub;
    el("lobby-invite").hidden = pub;
    el<HTMLInputElement>("lobby-link").value = `${location.origin}${location.pathname}?join=${lobby.code}`;
    el("lobby-members").innerHTML = lobby.members
      .map(
        (m) =>
          `<li class="${m.connected ? "" : "away"}">${esc(m.name)}${m.clientID === lobby.owner ? " <i>host</i>" : ""}${m.clientID === me ? " <i>you</i>" : ""}</li>`,
      )
      .join("");
    const c = lobby.config;
    el("lobby-config").textContent =
      `${c.map} · seed ${c.seed} · ${c.kingdoms} kingdoms · ${c.clans} clans · ${c.difficulty} · up to ${c.maxPlayers} lords`;
    el("lobby-start").hidden = !host;
    el("lobby-wait").hidden = host || pub;
    el<HTMLButtonElement>("lobby-start").disabled = lobby.status !== "open";
  }

  el("online-join").onclick = () => {
    const code = el<HTMLInputElement>("online-code").value.trim().toUpperCase();
    if (code.length !== 6) return status("A game code has six letters.", true);
    void joinCode(code);
  };
  el("lobby-start").onclick = () => online?.start();
  el("lobby-leave").onclick = () => {
    online?.leave();
    el("lobby").hidden = true;
  };
  el("lobby-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(el<HTMLInputElement>("lobby-link").value);
      el("lobby-copy").textContent = "Copied";
      setTimeout(() => (el("lobby-copy").textContent = "Copy link"), 1500);
    } catch {
      el<HTMLInputElement>("lobby-link").select();
    }
  };
  el("opt-name").addEventListener("change", () => {
    if (online && hooks.name().length >= 3) online.setName(hooks.name());
  });

  // Arrived by invitation link.
  const code = new URLSearchParams(location.search).get("join");
  if (code && /^[A-Z2-9]{6}$/i.test(code)) {
    history.replaceState(null, "", location.pathname);
    el<HTMLInputElement>("online-code").value = code.toUpperCase();
    status(`Invited to game ${code.toUpperCase()}. Check your house name, then Join.`);
  }

  void connect();
  return { hostLobby };
}

/** When a game ends or is quit: tell the server and drop the lobby. */
export function leaveOnline() {
  online?.leave();
  online?.list();
}
