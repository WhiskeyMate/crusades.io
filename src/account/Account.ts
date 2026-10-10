// Accounts, Crowns, the store and what you wear. All optional: with no
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time the game ships
// without any of it and nothing here loads.
//
// Sign-in is Supabase Auth (an emailed link, no passwords). Real money goes
// through Stripe Checkout, started by a Netlify function; the webhook adds
// Crowns. Spending Crowns, reserving a name and equipping items are
// Postgres functions that check prices and ownership themselves, so the
// browser is never trusted with a balance. See docs/DEPLOY.md.

import type { SupabaseClient } from "@supabase/supabase-js";
import { Skin, validSkin } from "../client/Heraldry";
import { BUNDLES, Equipped, ITEMS, itemById, PACKS, Slot } from "../store/Catalog";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * `?premium` on a dev server pretends to be a signed-in player with a
 * purse of Crowns, everything kept in localStorage, so the store and the
 * cosmetics can be worked on offline.
 */
const DEV_PREVIEW = import.meta.env.DEV && new URLSearchParams(location.search).has("premium");
const DEV_KEY = "crusades.dev.account";

/**
 * The store is closed until VITE_STORE_OPEN=on is set for the build (and
 * STORE_OPEN=on for the checkout function): no sign-in, no store button, no
 * purchases. Everything behind it is kept, so opening it again is two
 * environment variables and a redeploy.
 */
export const STORE_OPEN = import.meta.env.VITE_STORE_OPEN === "on";
export const accountsEnabled = (STORE_OPEN && Boolean(URL && KEY)) || DEV_PREVIEW;

export interface AccountState {
  email: string;
  premium: boolean;
  crowns: number;
  /** The reserved house name, if one was bought. */
  username: string | null;
  owned: Set<string>;
  equipped: Equipped;
  skin: Skin | null;
}

interface DevWallet {
  crowns: number;
  username: string | null;
  owned: string[];
  equipped: Equipped;
  skin: Skin | null;
}

class AccountService {
  state: AccountState | null = null;
  ready = false;
  onChange: () => void = () => {};
  private db: SupabaseClient | null = null;

  /** The arms to wear in game: for players allowed custom arms who chose some. */
  get skin(): Skin | null {
    return this.state && this.mayCustomiseArms() ? this.state.skin : null;
  }

  mayCustomiseArms(): boolean {
    return Boolean(this.state && (this.state.premium || this.state.owned.has("banner-custom")));
  }

  owns(itemId: string): boolean {
    return Boolean(this.state?.owned.has(itemId)) || (itemById(itemId)?.crowns ?? 1) === 0;
  }

  async init() {
    if (!accountsEnabled) return;
    if (DEV_PREVIEW) {
      const w = this.devWallet();
      this.state = {
        email: "preview@localhost",
        premium: false,
        crowns: w.crowns,
        username: w.username,
        owned: new Set(w.owned),
        equipped: w.equipped,
        skin: w.skin,
      };
      this.ready = true;
      this.onChange();
      return;
    }
    const { createClient } = await import("@supabase/supabase-js");
    this.db = createClient(URL!, KEY!);
    this.db.auth.onAuthStateChange(() => void this.refresh());
    await this.refresh();
  }

  private devWallet(): DevWallet {
    try {
      const w = JSON.parse(localStorage.getItem(DEV_KEY) ?? "null") as DevWallet | null;
      if (w) return { ...w, skin: validSkin(w.skin) ? w.skin : null };
    } catch {
      // Fresh wallet.
    }
    return { crowns: 1000, username: null, owned: [], equipped: {}, skin: null };
  }

  private saveDev() {
    const s = this.state!;
    const w: DevWallet = { crowns: s.crowns, username: s.username, owned: [...s.owned], equipped: s.equipped, skin: s.skin };
    localStorage.setItem(DEV_KEY, JSON.stringify(w));
  }

  /** Re-read who is signed in and what they own. */
  async refresh() {
    if (!this.db) return;
    const { data } = await this.db.auth.getUser();
    const user = data.user;
    if (!user) {
      this.state = null;
    } else {
      const [profile, inv, skin] = await Promise.all([
        this.db.from("profiles").select("premium, crowns, username, equipped").eq("id", user.id).maybeSingle(),
        this.db.from("inventory").select("item_id").eq("user_id", user.id),
        this.db.from("skins").select("skin").eq("user_id", user.id).maybeSingle(),
      ]);
      this.state = {
        email: user.email ?? "",
        premium: profile.data?.premium === true,
        crowns: profile.data?.crowns ?? 0,
        username: profile.data?.username ?? null,
        owned: new Set((inv.data ?? []).map((r) => r.item_id as string)),
        equipped: (profile.data?.equipped ?? {}) as Equipped,
        skin: validSkin(skin.data?.skin) ? skin.data!.skin : null,
      };
    }
    this.ready = true;
    this.onChange();
  }

  /** The signed-in session's token, for the game server to verify. */
  async token(): Promise<string | null> {
    if (!this.db) return null;
    const { data } = await this.db.auth.getSession();
    return data.session?.access_token ?? null;
  }

  /** Emails a sign-in link. Resolves to an error message, or null if sent. */
  async signIn(email: string): Promise<string | null> {
    if (!this.db) return "Accounts are not set up on this site.";
    const { error } = await this.db.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    return error ? error.message : null;
  }

  async signOut() {
    await this.db?.auth.signOut();
    await this.refresh();
  }

  async saveSkin(skin: Skin): Promise<string | null> {
    if (!this.state) return "Sign in first.";
    if (!this.mayCustomiseArms()) return "Custom arms need the “Your own arms” item.";
    if (DEV_PREVIEW) {
      this.state.skin = skin;
      this.saveDev();
    } else {
      const { data } = await this.db!.auth.getUser();
      if (!data.user) return "Sign in first.";
      const { error } = await this.db!.from("skins").upsert({ user_id: data.user.id, skin });
      if (error) return error.message;
      this.state = { ...this.state, skin };
    }
    this.onChange();
    return null;
  }

  /** Spend Crowns through a database function; it refuses if they are short. */
  private async rpc(fn: string, args: Record<string, unknown>): Promise<string | null> {
    if (!this.db) return "Accounts are not set up on this site.";
    const { error } = await this.db.rpc(fn, args);
    if (error) return error.message.replace(/^.*?: /, "");
    await this.refresh();
    return null;
  }

  async buyItem(itemId: string): Promise<string | null> {
    const item = itemById(itemId);
    if (!this.state || !item) return "No such item.";
    if (this.state.owned.has(itemId)) return "You already own that.";
    if (DEV_PREVIEW) {
      if (this.state.crowns < item.crowns) return "Not enough Crowns.";
      this.state.crowns -= item.crowns;
      this.state.owned.add(itemId);
      this.saveDev();
      this.onChange();
      return null;
    }
    return this.rpc("buy_item", { item: itemId });
  }

  async buyBundle(bundleId: string): Promise<string | null> {
    const b = BUNDLES.find((x) => x.id === bundleId);
    if (!this.state || !b) return "No such bundle.";
    if (b.items.every((i) => this.state!.owned.has(i))) return "You already own everything in that bundle.";
    if (DEV_PREVIEW) {
      if (this.state.crowns < b.crowns) return "Not enough Crowns.";
      this.state.crowns -= b.crowns;
      for (const i of b.items) this.state.owned.add(i);
      this.saveDev();
      this.onChange();
      return null;
    }
    return this.rpc("buy_bundle", { bundle: bundleId, items: b.items });
  }

  async reserveName(name: string): Promise<string | null> {
    if (!this.state) return "Sign in first.";
    if (this.state.username === name) return "That is already your house name.";
    if (DEV_PREVIEW) {
      if (this.state.crowns < 200) return "Not enough Crowns.";
      this.state.crowns -= 200;
      this.state.username = name;
      this.saveDev();
      this.onChange();
      return null;
    }
    return this.rpc("reserve_name", { wanted: name });
  }

  async equip(slot: Slot, itemId: string | null): Promise<string | null> {
    if (!this.state) return "Sign in first.";
    if (itemId !== null && !this.owns(itemId)) return "You don't own that.";
    // The default needs no record: clearing the slot is wearing it.
    const toStore = itemId !== null && (itemById(itemId)?.crowns ?? 0) > 0 ? itemId : null;
    if (DEV_PREVIEW) {
      if (toStore) this.state.equipped[slot] = toStore;
      else delete this.state.equipped[slot];
      this.saveDev();
      this.onChange();
      return null;
    }
    return this.rpc("equip_item", { slot, item: toStore });
  }

  /** Calls one of our Netlify functions as the signed-in user and follows the link it returns. */
  private async follow(fn: string, body?: unknown): Promise<string | null> {
    if (!this.db) return DEV_PREVIEW ? "Preview mode: Crowns are pretend here." : "Accounts are not set up on this site.";
    const { data } = await this.db.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return "Sign in first.";
    try {
      const res = await fetch(`/.netlify/functions/${fn}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const reply = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !reply.url) return reply.error ?? "Something went wrong.";
      location.href = reply.url;
      return null;
    } catch {
      return "Could not reach the server.";
    }
  }

  /** Off to Stripe to buy a Crown pack. */
  buyPack(packId: string) {
    if (!PACKS.some((p) => p.id === packId)) return Promise.resolve("No such pack.");
    return this.follow("create-checkout", { pack: packId });
  }
  /** Off to Stripe to manage a subscription. */
  billing = () => this.follow("billing-portal");
}

export const account = new AccountService();
export { ITEMS };
