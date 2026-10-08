// Who a connected player is, and what they wear. The game server asks
// Supabase directly (plain HTTPS, no client library): it verifies the
// access token the browser sent, then reads that account's reserved name,
// equipped items and custom arms with the service key.
//
// All optional: without SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// server's environment everyone is a guest and no name is reserved.

const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const identityEnabled = Boolean(URL_ && KEY);

export interface Cosmetic {
  equipped?: Record<string, string>;
  skin?: { color: string; division: number; charge: number; second?: string } | null;
}

export interface Identity {
  uid: string;
  username: string | null;
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
    // Custom arms only travel with the item that unlocks them.
    const inv = (await call(
      `/rest/v1/inventory?select=item_id&user_id=eq.${user.id}&item_id=eq.banner-custom`,
    )) as unknown[];
    return {
      uid: user.id,
      username: row?.username ?? null,
      cosmetic: { equipped: row?.equipped ?? {}, skin: inv.length > 0 ? (row?.skin ?? null) : null },
    };
  } catch (e) {
    console.error("identify failed:", e instanceof Error ? e.message : e);
    return null;
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
