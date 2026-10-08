// A fingerprint of the parts of a realm the simulation depends on. The
// server and every client generate the realm from the same seed; if any of
// them gets a different answer (floating-point maths can differ between
// browsers) their games would silently diverge, so they compare this first.

import { Realm } from "./RealmGen";

function fnv(h: number, bytes: Uint8Array): number {
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function realmHash(realm: Realm): string {
  const f = realm.files;
  let h = 2166136261;
  h = fnv(h, f.mapBin!);
  h = fnv(h, f.map4xBin!);
  h = fnv(h, new TextEncoder().encode(JSON.stringify(f.manifest.nations)));
  return h.toString(16).padStart(8, "0");
}
