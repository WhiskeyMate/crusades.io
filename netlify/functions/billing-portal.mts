// POST, signed in: returns a link to the Stripe billing portal, where a
// subscriber can update their card or cancel.

import { admin, caller, json, siteUrl, stripe } from "./_shared.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const db = admin();
    const user = await caller(req, db);
    if (!user) return json({ error: "Sign in first." }, 401);
    const { data: profile } = await db
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.stripe_customer_id) return json({ error: "No billing on this account." }, 404);
    const portal = await stripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: siteUrl(),
    });
    return json({ url: portal.url });
  } catch (e) {
    console.error("billing-portal", e);
    return json({ error: "Could not open billing." }, 500);
  }
};
