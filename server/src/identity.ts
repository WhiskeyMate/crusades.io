// Who a connected player is, and what they wear. The game server asks
// Supabase directly (plain HTTPS, no client library): it verifies the
// access token the browser sent, then reads that account's reserved name,
// equipped items and custom arms with the service key.
//
// All optional: without SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// server's environment everyone is a guest and no name is reserved.

import { freeSkin } from "../../src/client/Heraldry";

const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Whether the store is open. Signing in does not depend on it: accounts are
 * checked whenever Supabase is set up.
 */
export const storeOpen = process.env.STORE_OPEN?.toLowerCase() === "on";
export const identityEnabled = Boolean(URL_ && KEY);

export interface Cosmetic {
  equipped?: Record<string, string>;
  skin?: { color: string; division: number; charge: number; second?: string; ink?: string | null } | null;
}

export interface Identity {
  uid: string;
  username: string | null;
  /** The tag of the clan they belong to, if any. */
  clanTag: string | null;
  cosmetic: Cosmetic;
}

async function call(path: string, init: RequestInit & { bearer?: string } = {}): Promise<unknown> {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${init.bearer ?? KEY!}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/** The account behind an access token, or null for a guest or a bad token. */
export async function identify(token: string | undefined): Promise<Identity | null> {
  if (!identityEnabled || !token) return null;
  try {
    const user = (await call("/auth/v1/user", { bearer: token })) as { id?: string };
    if (!user.id) return null;
    const rows = (await call("/rest/v1/rpc/cosmetics_for", {
      method: "POST",
      body: JSON.stringify({ uid: user.id }),
    })) as { username: string | null; equipped: Record<string, string> | null; skin: Cosmetic["skin"] }[];
    const row = rows[0];
    // Custom arms only travel with the item that unlocks them; the plain
    // banner anyone signed in may fly travels on its own.
    const inv = (await call(
      `/rest/v1/inventory?select=item_id&user_id=eq.${user.id}&item_id=eq.banner-custom`,
    )) as unknown[];
    // The clan tables may not exist yet on an older database: then nobody has a tag.
    let clanTag: string | null = null;
    try {
      const tag = await call("/rest/v1/rpc/clan_tag_for", { method: "POST", body: JSON.stringify({ uid: user.id }) });
      if (typeof tag === "string" && /^[A-Z0-9]{2,5}$/.test(tag)) clanTag = tag;
    } catch {
      clanTag = null;
    }
    return {
      uid: user.id,
      clanTag,
      username: row?.username ?? null,
      cosmetic: { equipped: row?.equipped ?? {}, skin: inv.length > 0 || freeSkin(row?.skin) ? (row?.skin ?? null) : null },
    };
  } catch (e) {
    console.error("identify failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * A clan member has connected under this house name: the clan's roll shows it
 * from now on, so a member cannot slip out of sight by changing their name.
 */
export async function clanSeen(uid: string, name: string): Promise<void> {
  if (!identityEnabled) return;
  try {
    await fetch(`${URL_}/rest/v1/rpc/clan_seen`, {
      method: "POST",
      headers: { apikey: KEY!, Authorization: `Bearer ${KEY!}`, "content-type": "application/json" },
      body: JSON.stringify({ uid, display: name }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.error("clanSeen failed:", e instanceof Error ? e.message : e);
  }
}

/** The account that has reserved this house name, if any. */
export async function nameOwner(name: string): Promise<string | null> {
  if (!identityEnabled) return null;
  try {
    // ilike with no wildcards is a case-insensitive exact match.
    const safe = encodeURIComponent(name.replace(/[%_*\\]/g, ""));
    const rows = (await call(`/rest/v1/profiles?select=id&username=ilike.${safe}`)) as { id: string }[];
    return rows[0]?.id ?? null;
  } catch (e) {
    console.error("nameOwner failed:", e instanceof Error ? e.message : e);
    // If the lookup is down, don't lock everyone out of playing.
    return null;
  }
}
