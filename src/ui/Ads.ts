// Advertising: on the landing page a tall banner either side of the middle
// column and one further down the page; one in the lobby while the lords
// gather; one on the screen that ends a game; and in a game a stack of them
// in the bottom left corner.
// Buying anything from the store takes them all away.
//
// Each place is a <div data-ad="name"> in index.html. It is filled the first
// time it comes into view; the corner is filled once, soon after the page
// opens.

import { account } from "../account/Account";

/** The AdSense publisher id. Public: it is in the page source of every site that shows ads. */
export const AD_CLIENT = "ca-pub-1153759936707012";

// The ad units, as created in AdSense (Ads > By ad unit). Like the publisher
// id these are public. A build can override one through its environment, or
// switch a place off by setting its variable to "off".
const unit = (fromEnv: string | undefined, id: string) => (fromEnv === "off" ? undefined : fromEnv || id);
const SLOTS: Record<string, string | undefined> = {
  landing: unit(import.meta.env.VITE_AD_SLOT_LANDING, "6933794104"),
  lobby: unit(import.meta.env.VITE_AD_SLOT_LOBBY, "8692674897"),
  end: unit(import.meta.env.VITE_AD_SLOT_END, "9368385756"),
  // Until the corner and the rails have ad units of their own they borrow the landing page's.
  corner: unit(import.meta.env.VITE_AD_SLOT_CORNER, "6933794104"),
  rail: unit(import.meta.env.VITE_AD_SLOT_RAIL, "6933794104"),
};

/** Every slot Google has been asked to fill, to tell afterwards whether it really answered. */
const asked: HTMLElement[] = [];

/**
 * Asks Google to fill the slot just put on the page, and keeps its holder
 * out of sight until an advertisement has really arrived. A slot Google has
 * nothing for, or one a blocker has quietly swallowed, never shows as an
 * empty box.
 *
 * (A blocker may put a stand-in for Google's script on the page, one that
 * says it has loaded and accepts every request but does nothing. The only
 * sure sign of the real script is the answer it writes on the slot:
 * data-ad-status, "filled" or "unfilled".)
 */
function request(holder: HTMLElement) {
  const ins = holder.querySelector<HTMLElement>("ins.adsbygoogle");
  if (!ins) return;
  holder.classList.add("awaiting");
  asked.push(ins);
  try {
    const win = window as unknown as { adsbygoogle?: unknown[] };
    (win.adsbygoogle = win.adsbygoogle || []).push({});
  } catch (e) {
    console.warn("ad not shown", e);
  }
  let checks = 0;
  const watch = window.setInterval(() => {
    const status = ins.dataset.adStatus;
    if (status === "filled") holder.classList.remove("awaiting");
    // Nothing to show, or no answer in twenty seconds: the holder goes.
    else if (status === "unfilled" || ++checks > 40) holder.hidden = true;
    else return;
    window.clearInterval(watch);
  }, 500);
}

/** Anyone who has bought anything at all plays without ads. */
export function adFree(): boolean {
  const s = account.state;
  return Boolean(s && (s.owned.size > 0 || s.username));
}

/**
 * The corner: banners in a column 250 wide, clear of the build bar in the
 * middle of the bottom edge. On the landing page there is one box; in a game
 * it becomes a stack, as tall as the window has room for: two squares with a
 * strip between them on a tall window, less on a shorter one. A phone, which
 * has no corner to spare, gets none.
 */
function corner(local: boolean, tries = 0) {
  const box = document.querySelector<HTMLElement>('[data-ad="corner"]');
  const slot = SLOTS.corner;
  if (!box || !slot || adFree() || box.dataset.filled) return;
  if (document.body.classList.contains("phone")) return;
  // An ad blocker stops Google's script from loading. Then there is nothing
  // to show: no empty boxes, and the page is not moved over for them.
  const google = (window as unknown as { adsbygoogle?: { loaded?: boolean } }).adsbygoogle;
  if (!local && !google?.loaded) {
    if (tries < 12) window.setTimeout(() => corner(local, tries + 1), 1000);
    return;
  }
  const SQUARE = [250, 250], STRIP = [234, 60];
  const tall = window.innerHeight, wide = window.innerWidth >= 1100;
  const stack = !wide ? [STRIP] : tall >= 880 ? [SQUARE, STRIP, SQUARE] : tall >= 700 ? [SQUARE, STRIP, STRIP] : [STRIP, STRIP, STRIP];
  const landing = document.getElementById("landing");
  // The landing page has banners of its own (see rails), so the corner waits
  // for a game: nothing is fetched only to sit hidden.
  if (landing && !landing.hidden) return void window.setTimeout(() => corner(local, tries), 1000);
  box.dataset.filled = "1";
  box.hidden = false;
  const add = ([w, h]: number[]) => {
    const one = document.createElement("div");
    one.style.width = `${w}px`;
    one.style.height = `${h}px`;
    if (local) {
      // On a developer's machine, an outline where each banner will be.
      one.className = "mock";
      one.textContent = `Advertisement ${w}×${h}`;
    } else {
      one.innerHTML = `<ins class="adsbygoogle" style="display:inline-block;width:${w}px;height:${h}px" data-ad-client="${AD_CLIENT}" data-ad-slot="${slot}"></ins>`;
    }
    box.appendChild(one);
    if (!local) request(one);
  };
  // The first box now; the rest of the stack the first time a game is on
  // screen, so that no advertisement is fetched only to sit hidden.
  add(stack[0]);
  const watch = window.setInterval(() => {
    // Bought something while they were showing: they go.
    if (adFree()) {
      box.remove();
      return window.clearInterval(watch);
    }
    if (box.children.length < stack.length && landing?.hidden) for (const size of stack.slice(1)) add(size);
  }, 1000);
}

/**
 * The landing page's rails: a tall banner (160 by 600) against each edge of
 * the window, either side of the middle column. Only where there is room for them: a
 * window at least 1200 wide and 700 tall. They belong to the first screen and
 * scroll away with it.
 */
function rails(local: boolean, tries = 0) {
  const boxes = Array.from(document.querySelectorAll<HTMLElement>('[data-ad="rail"]'));
  const slot = SLOTS.rail;
  if (boxes.length === 0 || !slot || adFree() || boxes[0].dataset.filled) return;
  if (document.body.classList.contains("phone") || window.innerWidth < 1200 || window.innerHeight < 700) return;
  const google = (window as unknown as { adsbygoogle?: unknown[] & { loaded?: boolean } }).adsbygoogle;
  if (!local && !google?.loaded) {
    // Blocked, or slow to arrive: try a few times, then leave the page as it is.
    if (tries < 12) window.setTimeout(() => rails(local, tries + 1), 1000);
    return;
  }
  for (const box of boxes) {
    box.dataset.filled = "1";
    box.hidden = false;
    if (local) {
      // On a developer's machine, an outline where each banner will be.
      box.classList.add("mock");
      box.textContent = "Advertisement 160×600";
      continue;
    }
    box.innerHTML = `<ins class="adsbygoogle" style="display:inline-block;width:160px;height:600px" data-ad-client="${AD_CLIENT}" data-ad-slot="${slot}"></ins>`;
    request(box);
  }
  // Bought something while they were showing: they go.
  const watch = window.setInterval(() => {
    if (!adFree()) return;
    for (const box of boxes) box.remove();
    window.clearInterval(watch);
  }, 5000);
}

function fill(box: HTMLElement) {
  const slot = SLOTS[box.dataset.ad ?? ""];
  if (!slot || adFree() || box.dataset.filled) return;
  box.dataset.filled = "1";
  box.hidden = false;
  box.innerHTML =
    `<span class="ad-label">Advertisement</span>` +
    `<ins class="adsbygoogle" style="display:block" data-ad-client="${AD_CLIENT}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
  request(box);
}

// The names here keep clear of "ad": a blocker would hide the note itself.
const NOTE_PUT_OFF = "crusades.support.later";

/**
 * A small note asking for the blocker to be turned off. Shown when, some
 * seconds after the page has loaded, Google's script is missing, or is there
 * but has answered none of the slots it was asked to fill (a blocker's
 * stand-in). Dismissing it puts it off for a week.
 */
function askForSupport(force = false) {
  const google = (window as unknown as { adsbygoogle?: { loaded?: boolean } }).adsbygoogle;
  const silent = asked.length > 0 && !asked.some((ins) => ins.dataset.adStatus);
  const blocked = !google?.loaded || silent;
  if (!force && (!blocked || adFree())) return;
  try {
    if (!force && Date.now() < Number(localStorage.getItem(NOTE_PUT_OFF) ?? 0)) return;
  } catch {
    // No storage: it will ask each visit.
  }
  const box = document.getElementById("support-note");
  if (!box) return;
  box.hidden = false;
  document.getElementById("support-close")!.onclick = () => {
    box.hidden = true;
    try {
      localStorage.setItem(NOTE_PUT_OFF, String(Date.now() + 7 * 24 * 3600 * 1000));
    } catch {
      // Then it asks again next visit.
    }
  };
}

export function initAds() {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  // A moment's grace, so that someone signed in who has paid never sees it.
  window.setTimeout(() => {
    corner(local);
    rails(local);
  }, 2500);
  // Nothing else to show on a developer's own machine (?blocked shows the note, to look at it).
  if (local) {
    if (new URLSearchParams(location.search).has("blocked")) askForSupport(true);
    return;
  }
  window.setTimeout(() => askForSupport(), 12000);
  const boxes = Array.from(document.querySelectorAll<HTMLElement>("[data-ad]")).filter((b) => b.dataset.ad !== "corner" && b.dataset.ad !== "rail");
  if (boxes.length === 0 || !("IntersectionObserver" in window)) return;
  // A place is filled when it is first really on screen, which for the lobby
  // and the end screen is the moment their dialog opens.
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      fill(e.target as HTMLElement);
      if ((e.target as HTMLElement).dataset.filled) seen.unobserve(e.target);
    }
  });
  for (const b of boxes) {
    if (!SLOTS[b.dataset.ad ?? ""]) continue;
    // Give it a little height so there is something to come into view.
    b.hidden = false;
    b.classList.add("pending");
    seen.observe(b);
  }
}
