// POST, signed in: starts a Stripe Checkout for a Crown pack and returns
// its URL. Body: {"pack": "<pack id from src/store/Catalog.ts>"}. Google
// Pay and Apple Pay appear on the Checkout page when they are enabled in
// the Stripe dashboard (Settings > Payment methods).

import { PACKS } from "../../src/store/Catalog";
import { admin, caller, explain, json, siteUrl, stripe } from "./_shared.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const db = admin();
    const user = await caller(req, db);
    if (!user) return json({ error: "Sign in first." }, 401);

    const body = (await req.json().catch(() => ({}))) as { pack?: string };
    const pack = PACKS.find((p) => p.id === body.pack);
    if (!pack) return json({ error: "No such pack." }, 400);
    const priceId = process.env[pack.priceEnv];
    if (!priceId) return json({ error: `This pack is not on sale yet (${pack.priceEnv} unset).` }, 503);

    const { data: profile } = await db
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      // How the webhook knows which account paid and what to grant.
      client_reference_id: user.id,
      metadata: { pack: pack.id, crowns: String(pack.crowns + pack.bonus), user: user.id },
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: user.email, customer_creation: "always" }),
      allow_promotion_codes: true,
      success_url: `${siteUrl()}/?checkout=success&pack=${pack.id}`,
      cancel_url: `${siteUrl()}/?checkout=cancelled`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("create-checkout", e);
    return json({ error: explain(e, "Could not start checkout.") }, 500);
  }
};
