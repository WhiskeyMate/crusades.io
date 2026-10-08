// Called by Stripe, not by players. The only thing that ever grants Crowns
// or premium: the browser is never trusted to say it has paid.

import type Stripe from "stripe";
import { PACKS } from "../../src/store/Catalog";
import { admin, json, stripe, webhookSecret } from "./_shared.mts";

const LIVE = new Set(["active", "trialing", "past_due"]);

export default async (req: Request) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "Unsigned" }, 400);
  let event: Stripe.Event;
  try {
    // The signature covers the exact bytes Stripe sent: read the raw body.
    event = await stripe().webhooks.constructEventAsync(await req.text(), signature, webhookSecret());
  } catch {
    return json({ error: "Bad signature" }, 400);
  }

  const db = admin();
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") break;
        const uid = s.client_reference_id ?? s.metadata?.user;
        if (!uid) break;
        const customer = typeof s.customer === "string" ? s.customer : s.customer?.id;
        if (customer) {
          await db.from("profiles").update({ stripe_customer_id: customer }).eq("id", uid);
        }
        if (s.mode === "payment") {
          // A Crown pack. The amount comes from the catalogue, not the
          // session, so a tampered metadata field could not inflate it.
          const pack = PACKS.find((p) => p.id === s.metadata?.pack);
          if (!pack) throw new Error(`unknown pack in session ${s.id}: ${s.metadata?.pack}`);
          const { error } = await db.rpc("add_crowns", {
            uid,
            amount: pack.crowns + pack.bonus,
            session: s.id,
          });
          if (error) throw error;
        } else {
          const { error } = await db
            .from("profiles")
            .upsert({ id: uid, premium: true, stripe_customer_id: customer ?? null, updated_at: new Date().toISOString() });
          if (error) throw error;
        }
        break;
      }
      case "charge.refunded": {
        // Money went back (by us, or by Stripe on the customer's request):
        // take back the same share of the pack's Crowns. Stripe sends this
        // again for each further partial refund; the database function only
        // ever removes the difference.
        const charge = event.data.object;
        let meta = charge.metadata ?? {};
        if ((!meta.user || !meta.pack) && typeof charge.payment_intent === "string") {
          meta = (await stripe().paymentIntents.retrieve(charge.payment_intent)).metadata ?? {};
        }
        const pack = PACKS.find((p) => p.id === meta.pack);
        if (!meta.user || !pack) {
          console.warn("charge.refunded without pack metadata", charge.id);
          break;
        }
        const share = charge.amount > 0 ? charge.amount_refunded / charge.amount : 1;
        const { error } = await db.rpc("refund_crowns", {
          uid: meta.user,
          should_total: Math.round((pack.crowns + pack.bonus) * share),
          charge: charge.id,
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
