// Called by Stripe, not by players. The only thing that ever grants or
// removes premium: the browser is never trusted to say it has paid.

import type Stripe from "stripe";
import { admin, json, stripe, webhookSecret } from "./_shared.mts";

const LIVE = new Set(["active", "trialing", "past_due"]);

export default async (req: Request) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Unsigned" }, 400);
  let event: Stripe.Event;
  try {
    // The signature covers the exact bytes Stripe sent: read the raw body.
    event = await stripe().webhooks.constructEventAsync(
      await req.text(),
      signature,
      webhookSecret(),
    );
  } catch {
    return json({ error: "Bad signature" }, 400);
  }

  const db = admin();
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") break;
        if (!s.client_reference_id) break;
        const customer = typeof s.customer === "string" ? s.customer : s.customer?.id;
        const { error } = await db.from("profiles").upsert({
          id: s.client_reference_id,
          premium: true,
          stripe_customer_id: customer ?? null,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const premium = event.type !== "customer.subscription.deleted" && LIVE.has(sub.status);
        const { error } = await db
          .from("profiles")
          .update({ premium, updated_at: new Date().toISOString() })
          .eq("stripe_customer_id", customer);
        if (error) throw error;
        break;
      }
    }
  } catch (e) {
    // A 500 makes Stripe retry, which is what we want if the database blinked.
    console.error("stripe-webhook", event.type, e);
    return json({ error: "Failed" }, 500);
  }
  return json({ received: true });
};
