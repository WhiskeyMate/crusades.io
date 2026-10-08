// Shared by the account functions. Runs on Netlify, never in the browser:
// this is the only place the Stripe secret and Supabase service key are used.

import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import Stripe from "stripe";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const stripe = () => new Stripe(need("STRIPE_SECRET_KEY"));

/** Full-access database client. Bypasses row-level security. */
export const admin = (): SupabaseClient =>
  createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Netlify sets URL to the address of the site. */
export const siteUrl = () => (process.env.URL ?? "http://localhost:8888").replace(/\/$/, "");

export const priceId = () => need("STRIPE_PRICE_ID");
export const webhookSecret = () => need("STRIPE_WEBHOOK_SECRET");

/**
 * A message safe to show the player for a failed payment call: names the
 * missing setting or repeats Stripe's own explanation (which never contains
 * a full key), so a misconfiguration can be fixed without digging in logs.
 */
export function explain(e: unknown, fallback: string): string {
  const err = e as { message?: string; type?: string; code?: string };
  const msg = err?.message ?? "";
  if (msg.startsWith("Missing environment variable")) return `${fallback} The site is missing a setting: ${msg.replace("Missing environment variable ", "")}.`;
  if (typeof err?.type === "string" && err.type.startsWith("Stripe")) return `${fallback} Stripe says: ${msg}`;
  return fallback;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Who is calling, from the Supabase access token in the Authorization header. */
export async function caller(req: Request, db: SupabaseClient): Promise<User | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
}
