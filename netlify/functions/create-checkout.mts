// POST, signed in: starts a Stripe Checkout for premium and returns its URL.

import { admin, caller, json, priceId, siteUrl, stripe } from "./_shared.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const db = admin();
    const user = await caller(req, db);
    if (!user) return json({ error: "Sign in first." }, 401);

    const { data: profile } = await db
      .from("profiles")
      .select("premium, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.premium) return json({ error: "You are already premium." }, 409);

    const s = stripe();
    const price = await s.prices.retrieve(priceId());
    const session = await s.checkout.sessions.create({
      mode: price.type === "recurring" ? "subscription" : "payment",
      line_items: [{ price: price.id, quantity: 1 }],
      // How the webhook knows which account paid.
      client_reference_id: user.id,
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: user.email }),
      allow_promotion_codes: true,
      success_url: `${siteUrl()}/?checkout=success`,
      cancel_url: `${siteUrl()}/?checkout=cancelled`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("create-checkout", e);
    return json({ error: "Could not start checkout." }, 500);
  }
};
