// Advertising, kept out of the way: a banner on the landing page, one in the
// lobby while the lords gather, one on the screen that ends a game. Never
// over the map, never while a game is being played.
//
// Each place is a <div data-ad="name"> in index.html. It is filled the first
// time it comes into view, and only if its ad unit has been set up: the slot
// ids come from the build's environment (VITE_AD_SLOT_LANDING, _LOBBY, _END),
// so a place with no id simply stays empty and hidden.

import { account } from "../account/Account";

/** The AdSense publisher id. Public: it is in the page source of every site that shows ads. */
export const AD_CLIENT = "ca-pub-1153759936707012";

const SLOTS: Record<string, string | undefined> = {
  landing: import.meta.env.VITE_AD_SLOT_LANDING,
  lobby: import.meta.env.VITE_AD_SLOT_LOBBY,
  end: import.meta.env.VITE_AD_SLOT_END,
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
