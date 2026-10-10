// Advertising, kept out of the way: a banner on the landing page, one in the
// lobby while the lords gather, one on the screen that ends a game. Never
// over the map, never while a game is being played.
//
// Each place is a <div data-ad="name"> in index.html. It is filled the first
// time it comes into view.

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
};

/** Anyone who has bought something plays without ads. */
function adFree(): boolean {
  const s = account.state;
  return Boolean(s && (s.owned.size > 0 || s.username));
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
  // Nothing to show on a developer's own machine.
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
  const boxes = Array.from(document.querySelectorAll<HTMLElement>("[data-ad]"));
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
