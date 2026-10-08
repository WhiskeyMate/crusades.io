// Accounts, premium and chosen arms. All of it is optional: with no
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time the game ships
// without any account UI and nothing here loads.
//
// Sign-in is Supabase Auth (an emailed link, no passwords). Payment is Stripe
// Checkout, started by a Netlify function; a webhook flips `profiles.premium`.
// See docs/DEPLOY.md.

import type { SupabaseClient } from "@supabase/supabase-js";
import { Skin, validSkin } from "../client/Heraldry";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * `?premium` on a dev server pretends to be a signed-in premium player, with
 * the skin kept in localStorage, so the editor can be worked on offline.
 */
const DEV_PREVIEW = import.meta.env.DEV && new URLSearchParams(location.search).has("premium");
const DEV_SKIN_KEY = "crusades.dev.skin";

export const accountsEnabled = Boolean(URL && KEY) || DEV_PREVIEW;

export interface AccountState {
  email: string;
  premium: boolean;
  skin: Skin | null;
}

class AccountService {
  state: AccountState | null = null;
  ready = false;
  onChange: () => void = () => {};
  private db: SupabaseClient | null = null;

  /** The arms to wear in game: only premium players have any. */
  get skin(): Skin | null {
    return this.state?.premium ? this.state.skin : null;
  }

  async init() {
    if (!accountsEnabled) return;
    if (DEV_PREVIEW) {
      let skin: Skin | null = null;
      try {
        const saved = JSON.parse(localStorage.getItem(DEV_SKIN_KEY) ?? "null");
        if (validSkin(saved)) skin = saved;
      } catch {
        // No saved skin.
      }
      this.state = { email: "preview@localhost", premium: true, skin };
      this.ready = true;
      this.onChange();
      return;
    }
    const { createClient } = await import("@supabase/supabase-js");
    this.db = createClient(URL!, KEY!);
    this.db.auth.onAuthStateChange(() => void this.refresh());
    await this.refresh();
  }

  /** Re-read who is signed in and what they own. */
  async refresh() {
    if (!this.db) return;
    const { data } = await this.db.auth.getUser();
    const user = data.user;
    if (!user) {
      this.state = null;
    } else {
      const [profile, skin] = await Promise.all([
        this.db.from("profiles").select("premium").eq("id", user.id).maybeSingle(),
        this.db.from("skins").select("skin").eq("user_id", user.id).maybeSingle(),
      ]);
      this.state = {
        email: user.email ?? "",
        premium: profile.data?.premium === true,
        skin: validSkin(skin.data?.skin) ? skin.data!.skin : null,
      };
    }
    this.ready = true;
    this.onChange();
  }

  /** Emails a sign-in link. Resolves to an error message, or null if sent. */
  async signIn(email: string): Promise<string | null> {
    if (!this.db) return "Accounts are not set up on this site.";
    const { error } = await this.db.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin },
    });
    return error ? error.message : null;
  }

  async signOut() {
    await this.db?.auth.signOut();
    await this.refresh();
  }

  async saveSkin(skin: Skin): Promise<string | null> {
    if (!this.state) return "Sign in first.";
    if (!this.state.premium) return "Custom arms are for premium accounts.";
    if (DEV_PREVIEW) {
      localStorage.setItem(DEV_SKIN_KEY, JSON.stringify(skin));
    } else {
      const { data } = await this.db!.auth.getUser();
      if (!data.user) return "Sign in first.";
      const { error } = await this.db!.from("skins").upsert({ user_id: data.user.id, skin });
      if (error) return error.message;
    }
    this.state = { ...this.state, skin };
    this.onChange();
    return null;
  }

  /** Calls one of our Netlify functions as the signed-in user and follows the link it returns. */
  private async follow(fn: string): Promise<string | null> {
    if (!this.db) return "Accounts are not set up on this site.";
    const { data } = await this.db.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return "Sign in first.";
    try {
      const res = await fetch(`/.netlify/functions/${fn}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) return body.error ?? "Something went wrong.";
      location.href = body.url;
      return null;
    } catch {
      return "Could not reach the server.";
    }
  }

  /** Off to Stripe to pay. */
  checkout = () => this.follow("create-checkout");
  /** Off to Stripe to manage or cancel. */
  billing = () => this.follow("billing-portal");
}

export const account = new AccountService();
