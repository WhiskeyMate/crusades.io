// Advertising: a banner on the landing page, one in the lobby while the lords
// gather, one on the screen that ends a game, and a small one in the bottom
// left corner that stays on screen throughout, in a game or out of one.
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
  // Until the corner has an ad unit of its own it borrows the landing page's.
  corner: unit(import.meta.env.VITE_AD_SLOT_CORNER, "6933794104"),
};

/** Anyone who has bought anything at all plays without ads. */
export function adFree(): boolean {
  const s = account.state;
  return Boolean(s && (s.owned.size > 0 || s.username));
}

/**
 * The corner: a stack of banners in a column 250 wide, clear of the build bar
 * in the middle of the bottom edge. How much is stacked depends on the room:
 * two squares with a strip between them on a tall window, less on a shorter
 * one. A phone, which has no corner to spare, gets none.
 */
function corner(local: boolean) {
  const box = document.querySelector<HTMLElement>('[data-ad="corner"]');
  const slot = SLOTS.corner;
  if (!box || !slot || adFree() || box.dataset.filled) return;
  if (document.body.classList.contains("phone")) return;
  const SQUARE = [250, 250], STRIP = [234, 60];
  const tall = window.innerHeight, wide = window.innerWidth >= 1100;
  const stack = !wide ? [STRIP] : tall >= 880 ? [SQUARE, STRIP, SQUARE] : tall >= 700 ? [SQUARE, STRIP, STRIP] : [STRIP, STRIP, STRIP];
  box.dataset.filled = "1";
  box.hidden = false;
  box.innerHTML = stack
    .map(([w, h]) =>
      local
        ? // On a developer's machine, an outline where each banner will be.
          `<div class="mock" style="width:${w}px;height:${h}px">Advertisement ${w}×${h}</div>`
        : `<div style="width:${w}px;height:${h}px"><ins class="adsbygoogle" style="display:inline-block;width:${w}px;height:${h}px" data-ad-client="${AD_CLIENT}" data-ad-slot="${slot}"></ins></div>`,
    )
    .join("");
  // Bought something while they were showing: they go.
  const watch = window.setInterval(() => {
    if (!adFree()) return;
    box.remove();
    window.clearInterval(watch);
  }, 5000);
  if (local) return;
  const win = window as unknown as { adsbygoogle?: unknown[] };
  for (let n = 0; n < stack.length; n++) {
    try {
      (win.adsbygoogle = win.adsbygoogle || []).push({});
    } catch (e) {
      console.warn("ad not shown", e);
    }
  }
}

function fill(box: HTMLElement) {
  const slot = SLOTS[box.dataset.ad ?? ""];
  if (!slot || adFree() || box.dataset.filled) return;
  box.dataset.filled = "1";
  box.hidden = false;
  box.innerHTML =
    `<span class="ad-label">Advertisement</span>` +
    `<ins class="adsbygoogle" style="display:block" data-ad-client="${AD_CLIENT}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
  try {
    const w = window as unknown as { adsbygoogle?: unknown[] };
    (w.adsbygoogle = w.adsbygoogle || []).push({});
  } catch (e) {
    console.warn("ad not shown", e);
  }
}

export function initAds() {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  // A moment's grace, so that someone signed in who has paid never sees it.
  window.setTimeout(() => corner(local), 2500);
  // Nothing else to show on a developer's own machine.
  if (local) return;
  const boxes = Array.from(document.querySelectorAll<HTMLElement>("[data-ad]")).filter((b) => b.dataset.ad !== "corner");
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
