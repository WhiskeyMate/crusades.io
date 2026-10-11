// Accounts, Crowns, the store and what you wear. All optional: with no
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time the game ships
// without any of it and nothing here loads.
//
// Sign-in is Supabase Auth: Discord, Google or an emailed link (no
// passwords), and Steam by way of two Netlify functions. Which of them are
// offered is set by VITE_SIGNIN. Signing in is open whenever Supabase is set
// up; the store is a separate switch. Real money goes
// through Stripe Checkout, started by a Netlify function; the webhook adds
// Crowns. Spending Crowns, reserving a name and equipping items are
// Postgres functions that check prices and ownership themselves, so the
// browser is never trusted with a balance. See docs/DEPLOY.md.

import type { SupabaseClient } from "@supabase/supabase-js";
import { freeSkin, Skin, validSkin } from "../client/Heraldry";
import { BUNDLES, Equipped, ITEMS, itemById, PACKS, Slot } from "../store/Catalog";
import { addModes, type Mode, MODES, noMode, noRecord, plain, type PlayerRecord, type Totals } from "./Record";

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
 * STORE_OPEN=on for the checkout function): no store, no purchases.
 * Everything behind it is kept, so opening it again is two environment
 * variables and a redeploy. On a dev server, ?premium opens it and ?account
 * keeps it closed, to look at either.
 */
export const STORE_OPEN =
  import.meta.env.VITE_STORE_OPEN === "on" || (DEV_PREVIEW && !new URLSearchParams(location.search).has("account"));
/**
 * Accounts (signing in, and the record kept for those who do) are open
 * whenever the site has Supabase set up, store or no store. VITE_ACCOUNTS=off
 * shuts them.
 */
export const accountsEnabled = (Boolean(URL && KEY) && import.meta.env.VITE_ACCOUNTS !== "off") || DEV_PREVIEW;

export type Provider = "discord" | "google" | "steam" | "email";
const KNOWN: Provider[] = ["discord", "google", "steam", "email"];
/**
 * The ways of signing in that are offered, in order. Each but the emailed
 * link needs setting up first (see docs/ACCOUNTS.md), so only the link is
 * offered until VITE_SIGNIN names the others, e.g. "discord,google,steam,email".
 */
export const SIGN_IN: Provider[] = (() => {
  const asked = String(import.meta.env.VITE_SIGNIN ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is Provider => (KNOWN as string[]).includes(p));
  return asked.length > 0 ? asked : DEV_PREVIEW ? KNOWN : ["email"];
})();

export interface AccountState {
  /** The account's id. */
  uid: string;
  /** What to call them: the name they go by where they signed in, or their email's first part. */
  name: string;
  /** How they signed in. */
  provider: string;
  /** Their record (see Record.ts). */
  record: PlayerRecord;
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
  record?: PlayerRecord;
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

  /** True on a dev server pretending to be signed in: there is no database behind it. */
  readonly preview = DEV_PREVIEW;

  /** The database, for the parts of the site that keep their own tables (clans). Null until set up. */
  database(): SupabaseClient | null {
    return this.db;
  }

  /** The arms to wear in game: for players allowed custom arms who chose some. */
  get skin(): Skin | null {
    const s = this.state;
    if (!s || !s.skin) return null;
    // The full workshop for those who own it; the plain banner for anyone signed in.
    return this.mayCustomiseArms() || freeSkin(s.skin) ? s.skin : null;
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
        uid: "preview",
        name: "Preview Player",
        provider: "preview",
        record: { ...noRecord(), ...(w.record ?? {}) },
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
    const w: DevWallet = { record: s.record, crowns: s.crowns, username: s.username, owned: [...s.owned], equipped: s.equipped, skin: s.skin };
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
      const [profile, inv, skin, rec] = await Promise.all([
        this.db.from("profiles").select("premium, crowns, username, equipped").eq("id", user.id).maybeSingle(),
        this.db.from("inventory").select("item_id").eq("user_id", user.id),
        this.db.from("skins").select("skin").eq("user_id", user.id).maybeSingle(),
        this.db.from("records").select("mode, played, wins, seconds, best_land, totals").eq("user_id", user.id),
      ]);
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const custom = (meta.custom_claims ?? {}) as Record<string, unknown>;
      const called = [custom.global_name, meta.full_name, meta.name, meta.user_name, meta.preferred_username].find(
        (n): n is string => typeof n === "string" && n.trim() !== "",
      );
      const steam = meta.provider === "steam";
      const record = noRecord();
      for (const r of rec.data ?? []) {
        if (!(MODES as string[]).includes(r.mode)) continue;
        record[r.mode as Mode] = {
          played: r.played ?? 0, wins: r.wins ?? 0, seconds: Number(r.seconds ?? 0), bestLand: r.best_land ?? 0,
          totals: plain(r.totals as Totals),
        };
      }
      this.state = {
        uid: user.id,
        name: (called ?? (user.email ?? "").split("@")[0] ?? "").slice(0, 40) || "Player",
        provider: steam ? "steam" : String(user.app_metadata?.provider ?? "email"),
        record,
        // The address made up for a Steam account means nothing to the player.
        email: steam ? "" : (user.email ?? ""),
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

  /**
   * Leaves for Discord or Google (or Steam, through our own functions) to
   * sign in there; the player comes back signed in. Resolves to an error
   * message only if it could not even set off.
   */
  async signInWith(provider: Exclude<Provider, "email">): Promise<string | null> {
    if (!this.db) return DEV_PREVIEW ? "Preview mode: you are already signed in." : "Accounts are not set up on this site.";
    if (provider === "steam") {
      location.href = "/.netlify/functions/steam-login";
      return null;
    }
    const { error } = await this.db.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin } });
    return error ? error.message : null;
  }

  /**
   * Files a finished game with the account. The database does the adding up
   * and refuses nonsense; nothing is said to the player if it fails.
   */
  async recordGame(g: { mode: Mode; won: boolean; land: number; seconds: number; map: string; totals: Totals }) {
    const s = this.state;
    if (!s || g.seconds < 60) return;
    if (DEV_PREVIEW) {
      s.record[g.mode] = addModes(s.record[g.mode], {
        ...noMode(), played: 1, wins: g.won ? 1 : 0, seconds: g.seconds, bestLand: g.land, totals: g.totals,
      });
      this.saveDev();
      return this.onChange();
    }
    if (!this.db) return;
    const { error } = await this.db.rpc("record_game", {
      mode: g.mode, won: g.won, land: g.land, secs: g.seconds, map: g.map, totals: g.totals,
    });
    if (error) return console.warn("game not recorded:", error.message);
    await this.refresh();
  }

  async signOut() {
    await this.db?.auth.signOut();
    await this.refresh();
  }

  async saveSkin(skin: Skin): Promise<string | null> {
    if (!this.state) return "Sign in first.";
    if (!this.mayCustomiseArms() && !freeSkin(skin)) return "Those arms need the “Your own arms” item. The plain banner is free.";
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
