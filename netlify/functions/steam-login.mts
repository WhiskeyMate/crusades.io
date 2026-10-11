// Sign in through Steam, first half: sends the player to Steam, which sends
// them back to steam-callback with a signed statement of who they are.
//
// Steam speaks OpenID 2.0, which Supabase does not, so these two functions
// stand between them. Off unless STEAM_LOGIN=on.

import { siteUrl } from "./_shared.mts";

export default async () => {
  if (process.env.STEAM_LOGIN?.toLowerCase() !== "on") {
    return new Response("Signing in through Steam is not switched on.", { status: 503 });
  }
  const site = siteUrl();
  const to = new URL("https://steamcommunity.com/openid/login");
  to.search = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${site}/.netlify/functions/steam-callback`,
    "openid.realm": site,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  }).toString();
  return Response.redirect(to.toString(), 302);
};
