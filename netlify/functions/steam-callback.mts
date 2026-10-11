// Sign in through Steam, second half. Steam has sent the player back with a
// statement of who they are. Nothing in it is believed until Steam itself
// has confirmed it; then the player is signed in to their account here,
// which is made on their first visit.
//
// Steam gives no email address, so the account is filed under one made from
// the Steam id, at a domain that receives no mail. Nobody can sign in to it
// by email link: only this function, having checked with Steam, can.

import { admin, siteUrl } from "./_shared.mts";

const STEAM = "https://steamcommunity.com/openid/login";
const CLAIMED = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

const back = (site: string, problem: string) =>
  Response.redirect(`${site}/?signin=${encodeURIComponent(problem)}`, 302);

export default async (req: Request) => {
  const site = siteUrl();
  if (process.env.STEAM_LOGIN?.toLowerCase() !== "on") return back(site, "steam-off");
  const got = new URL(req.url).searchParams;

  // The statement must be an answer to our own question, from Steam's own door.
  if (got.get("openid.mode") !== "id_res") return back(site, "steam-cancelled");
  if (got.get("openid.op_endpoint") !== STEAM) return back(site, "steam-failed");
  if (got.get("openid.return_to") !== `${site}/.netlify/functions/steam-callback`) return back(site, "steam-failed");
  const id = CLAIMED.exec(got.get("openid.claimed_id") ?? "")?.[1];
  if (!id || got.get("openid.identity") !== got.get("openid.claimed_id")) return back(site, "steam-failed");

  // Ask Steam whether it really said this. It answers yes once only, so a
  // copied link cannot be used again.
  const check = new URLSearchParams();
  for (const [k, v] of got) if (k.startsWith("openid.")) check.set(k, v);
  check.set("openid.mode", "check_authentication");
  let valid = false;
  try {
    const res = await fetch(STEAM, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: check.toString(),
      signal: AbortSignal.timeout(8000),
    });
    valid = res.ok && /(^|\n)is_valid\s*:\s*true(\n|$)/.test(await res.text());
  } catch {
    valid = false;
  }
  if (!valid) return back(site, "steam-failed");

  // The name they go by on Steam, if a key for Steam's web API is set. Optional.
  let name = "Steam player";
  const key = process.env.STEAM_API_KEY;
  if (key) {
    try {
      const res = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(key)}&steamids=${id}`,
        { signal: AbortSignal.timeout(5000) },
      );
      const body = (await res.json()) as { response?: { players?: { personaname?: string }[] } };
      name = body.response?.players?.[0]?.personaname?.slice(0, 40) || name;
    } catch {
      // Keep the plain name.
    }
  }

  try {
    const db = admin();
    const email = `steam-${id}@steam.invalid`;
    // Made on the first visit; "already registered" on every later one, which is fine.
    const made = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { provider: "steam", steam_id: id, full_name: name },
    });
    if (made.error && !/already|registered|exists/i.test(made.error.message)) throw made.error;
    // A one-time sign-in link for that account, followed at once on the player's behalf.
    const link = await db.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: site } });
    const go = link.data?.properties?.action_link;
    if (link.error || !go) throw link.error ?? new Error("no sign-in link");
    return Response.redirect(go, 302);
  } catch (e) {
    console.error("steam sign-in failed:", e instanceof Error ? e.message : e);
    return back(site, "steam-failed");
  }
};
