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

    // Managed Payments: Stripe (as "Link") is the seller of record and
    // handles sales tax and VAT. Each pack's product needs an eligible tax
    // code in Stripe. STRIPE_MANAGED_PAYMENTS=off sells as ourselves instead.
    const managed = {
      managed_payments: { enabled: process.env.STRIPE_MANAGED_PAYMENTS?.toLowerCase() !== "off" },
    } as Record<string, unknown>;
    const session = await stripe().checkout.sessions.create({
      ...managed,
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      // How the webhook knows which account paid and what to grant.
      client_reference_id: user.id,
      metadata: { pack: pack.id, crowns: String(pack.crowns + pack.bonus), user: user.id },
      // The same tags on the payment itself, so a later refund can be traced
      // back to the account and the pack without the session.
      payment_intent_data: { metadata: { pack: pack.id, user: user.id } },
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
