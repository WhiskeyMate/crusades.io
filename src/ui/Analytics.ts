// Visitor statistics (Google Analytics): how many play, where they come from,
// which maps they choose. Nothing personal is sent: no house names, no email.
//
// Switched on by giving the build a measurement id (VITE_GA_ID, "G-…"), which
// like the advertising ids is public. Without one nothing here loads.

const GA_ID: string | undefined = import.meta.env.VITE_GA_ID || undefined;

// Where the law asks for consent before an analytics cookie is set. There the
// cookie waits for the visitor's answer to the consent message (the one Google
// shows for advertising, which speaks for analytics too); until then, and if
// the answer is no, visits are counted without cookies.
const CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
];

type Layer = { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
const w = window as unknown as Layer;

export function initAnalytics() {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!GA_ID || local) return;
  w.dataLayer = w.dataLayer || [];
  // gtag reads the arguments object itself, so this cannot be an arrow function.
  w.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag("consent", "default", { analytics_storage: "denied", region: CONSENT_REGIONS, wait_for_update: 500 });
  w.gtag("js", new Date());
  w.gtag("config", GA_ID);
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
}

/** Counts something that happened. Does nothing when analytics is off. */
export function track(event: string, params: Record<string, string | number | boolean> = {}) {
  w.gtag?.("event", event, params);
}
