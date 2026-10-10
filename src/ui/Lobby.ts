// Online play from the hall: the list of public games starting soon,
// hosting a private lobby, joining by code, and the waiting room.

import { describeRules } from "../client/Rules";
import { mapStillHTML } from "./MapPreview";
import { Session } from "../client/Session";
import { account } from "../account/Account";
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

  // Tell the server's log when this page breaks or locks up, so a freeze a
  // player reports can be matched to what their browser was doing.
  window.addEventListener("error", (e) => online?.report("PAGE ERROR", `${e.message} at ${e.filename?.split("/").pop()}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => online?.report("PAGE ERROR", `unhandled: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`));
  document.addEventListener(
    "webglcontextlost",
    (e) => {
      // Only a canvas still on the page counts: the landing page's backdrop gives its context up on purpose.
      if ((e.target as HTMLElement | null)?.isConnected && !el("hud").hidden) online?.report("GRAPHICS LOST", "the WebGL context was lost");
    },
    true,
  );
  let beat = performance.now();
  setInterval(() => {
    const now = performance.now();
    const gap = now - beat;
    beat = now;
    // The timer runs every second; a long gap in a visible tab is a locked-up page.
    if (gap > 4000 && !document.hidden) {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      online?.report("PAGE STALLED", `${Math.round(gap)}ms${mem ? `, heap ${Math.round(mem.usedJSHeapSize / 1048576)}MB` : ""}`);
    }
  }, 1000);

  /** Connect (once) and keep the hall's list fresh. Reconnects while in the hall. */
  async function connect(): Promise<Online | null> {
    if (online) return online;
    const o = new Online(hooks.name(), await account.token().catch(() => null));
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
    o.onLink = (state) => {
      const game = (window as unknown as { crusades?: { hud?: { toast(t: string, k: string): void } } }).crusades;
      const banner = el("link-lost");
      banner.hidden = state !== "lost";
      if (state === "lost") game?.hud?.toast("Connection to the server lost. Reconnecting…", "bad");
      else if (state === "back") game?.hud?.toast("Reconnected. Carrying on.", "good");
      else if (state === "replay") resync("Reconnected, but the game must be replayed");
      else game?.hud?.toast("Could not get back into the game: it has ended, or your seat is gone. Return to the hall.", "bad");
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
      window.clearTimeout(stallWatch);
      el("lobby-countdown").textContent = "Raising the realm…";
      const session = new Session({
        realm: g.realm,
        info: g.info,
        clientID: g.clientID,
        transport: g.transport,
        catchup: g.catchup,
        cosmetics: g.cosmetics,
      });
      session.onHash = (tick, hash) => o.reportHash(tick, hash);
      session.onGap = (expected, got) => {
        o.report("TURN GAP", `expected ${expected}, got ${got}`);
        resync("A turn went missing");
      };
      session.onError = (m) => o.report("ENGINE ERROR", m);
      hooks.begin(session);
      // Confirm the game is actually ticking on this side.
      const started = performance.now();
      const check = window.setInterval(() => {
        const tick = session.state.tick;
        if (tick > 0) {
          window.clearInterval(check);
          o.report("game running", `tick ${tick} after ${Math.round(performance.now() - started)}ms`);
        } else if (performance.now() - started > 20000) {
          window.clearInterval(check);
          o.report("GAME NOT TICKING", `still at tick 0 after 20s; hud ${el("hud").hidden ? "hidden" : "shown"}`);
        }
      }, 500);
    };
    o.onDesync = () => resync("Your game drifted from the others");
    status("");
    return o;
  }

  /**
   * Reload and let the saved seat replay the game from the first turn. At
   * most twice in five minutes, so a persistent fault can't loop forever.
   */
  function resync(why: string) {
    const game = (window as unknown as { crusades?: { hud?: { toast(t: string, k: string): void } } }).crusades;
    let tries: number[] = [];
    try {
      tries = (JSON.parse(sessionStorage.getItem("crusades.resync") ?? "[]") as number[]).filter(
        (t) => Date.now() - t < 300_000,
      );
    } catch {
      // Fresh.
    }
    if (tries.length >= 2) {
      game?.hud?.toast(`${why}, and resyncing didn't help. Leave and rejoin the game.`, "bad");
      return;
    }
    tries.push(Date.now());
    sessionStorage.setItem("crusades.resync", JSON.stringify(tries));
    game?.hud?.toast(`${why}; resyncing with the server…`, "warn");
    window.setTimeout(() => location.reload(), 1500);
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
          mapStillHTML(c.map, "pub-thumb") +
          `<div class="pub-map">${esc(c.map)}</div>` +
          `<div class="pub-meta">${g.players} of ${c.maxPlayers} lords · ${c.kingdoms} kingdoms · ${c.clans} clans</div>` +
          `<div class="pub-time"><b>${g.players === 0 ? "—" : s > 0 ? `${s}s` : "…"}</b><span>${g.players === 0 ? "waiting for lords" : s > 0 ? "until it starts" : "starting"}</span></div>` +
          `<button>${inIt ? "You're in" : "Join"}</button></div>`
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

  // The sign-in is often known only after the hall has connected, and
  // tokens are renewed hourly: keep the connection's copy current.
  const refreshToken = () =>
    void account.token().then((t) => online?.setToken(t)).catch(() => undefined);
  setInterval(refreshToken, 2000);

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

  let stallWatch = 0;
  function showLobby(lobby: LobbyView | null) {
    const box = el("lobby");
    drawPublic();
    if (!lobby) {
      box.hidden = true;
      window.clearTimeout(stallWatch);
      return;
    }
    // Once the game is up on this side (or being raised), lobby changes such
    // as a member dropping are none of the dialog's business: a running
    // game must never get the waiting room drawn over it.
    if (lobby.status !== "open" && (!el("hud").hidden || !el("loading").hidden)) {
      box.hidden = true;
      window.clearTimeout(stallWatch);
      return;
    }
    // The server says the game is running: we must be in it within 20 s,
    // or something on this side swallowed the start. Resync rather than sit.
    window.clearTimeout(stallWatch);
    if (lobby.status === "running" && el("hud").hidden) {
      stallWatch = window.setTimeout(() => {
        if (!el("hud").hidden || el("lobby").hidden) return;
        online?.report("STUCK STARTING", "lobby running for 20s, no game on this side");
        resync("The game started without you");
      }, 20000);
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
    const rules = describeRules(c.rules);
    el("lobby-rules").hidden = rules.length === 0;
    el("lobby-rules").innerHTML = rules.length ? `<b>House rules:</b> ${esc(rules.join(" · "))}` : "";
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

/** Something worth a line in the server log, from outside the lobby code. */
export function reportOnline(event: string, detail?: string) {
  online?.report(event, detail);
}

/** When a game ends or is quit: tell the server and drop the lobby. */
export function leaveOnline() {
  online?.leave();
  online?.list();
}
