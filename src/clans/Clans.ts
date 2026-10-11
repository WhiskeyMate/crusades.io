// Clans of players: a name, a tag of two to five letters carried in front of
// its members' house names, a few words about itself, and a pin on the world
// map saying where it calls home. (The small AI realms in a game are
// "tribes".) Anyone may look; founding or joining one needs an account.
//
// Kept in Supabase, where the rules live: this file only asks. On a dev
// server with ?premium there is no Supabase, so a pretend set is kept in the
// browser instead, with a handful of clans already on the map.

import { account } from "../account/Account";

export interface Clan {
  id: string;
  name: string;
  tag: string;
  blurb: string;
  /** Anyone may join at once; otherwise the founder approves each ask. */
  open: boolean;
  /** Where on the world map it calls home, each 0 to 1 across and down. */
  x: number;
  y: number;
  members: number;
  founder: string;
}

export type ReportReason = "name" | "about" | "pretending" | "other";
export const REPORT_REASONS: [ReportReason, string][] = [
  ["name", "Offensive name or tag"],
  ["about", "Offensive description"],
  ["pretending", "Pretending to be someone else"],
  ["other", "Something else"],
];

export interface ClanMember {
  /** The account. A member is the account, whatever it is called. */
  id: string;
  /** The account name its owner chose. */
  handle: string;
  /** The house name they last played under. */
  name: string;
  /** The house name they had when they joined, if it was another. */
  joinedAs: string | null;
  /** When they last connected to the game server, if they have since joining. */
  seen: string | null;
  founder: boolean;
}

export interface Mine {
  clan: Clan;
  founder: boolean;
  roll: ClanMember[];
  /** Asks to join, for the founder to answer. */
  asks: { id: string; handle: string; name: string }[];
}

type Row = { id: string; name: string; tag: string; blurb: string; open: boolean; pin_x: number; pin_y: number; members: number; founder: string };
const fromRow = (r: Row): Clan => ({ id: r.id, name: r.name, tag: r.tag, blurb: r.blurb, open: r.open, x: r.pin_x, y: r.pin_y, members: r.members, founder: r.founder });
const COLUMNS = "id, name, tag, blurb, open, pin_x, pin_y, members, founder";

/** What the database said was wrong, without its own preamble. */
const why = (e: { message: string }) => e.message.replace(/^.*?: /, "");

// ------------------------------------------------------------ pretend set
const DEV_KEY = "crusades.dev.clans";
interface DevStore {
  clans: Clan[];
  /** Who is in which clan: user id to clan id. */
  rolls: Record<string, { clan: string; name: string; handle?: string }>;
  asks: { clan: string; user: string; name: string; handle?: string }[];
}

function devLoad(): DevStore {
  try {
    const s = JSON.parse(localStorage.getItem(DEV_KEY) ?? "null") as DevStore | null;
    if (s) return s;
  } catch {
    // Start afresh.
  }
  const seed: [string, string, string, number, number, number, boolean][] = [
    ["Southern Cross", "STHX", "Perth and the west. Evenings, Australian time.", 0.82, 0.74, 14, true],
    ["Black Swans", "SWAN", "Sandgropers who like a long game.", 0.815, 0.745, 6, false],
    ["Harbour Watch", "HRBR", "Sydney side. Naval players welcome.", 0.92, 0.75, 9, true],
    ["Iron Wolves", "WOLF", "Central Europe, competitive.", 0.53, 0.23, 31, false],
    ["Hanse", "HNSE", "Trade first, war second.", 0.52, 0.2, 12, true],
    ["Les Lys", "LYS", "On parle français.", 0.505, 0.245, 8, true],
    ["Albion", "ALBN", "British Isles, casual.", 0.49, 0.205, 17, true],
    ["Northmen", "NRTH", "Scandinavia. Longships.", 0.53, 0.15, 11, true],
    ["Lone Star", "TEX", "Texas and around.", 0.22, 0.33, 7, true],
    ["Great Lakes", "LAKE", "Midwest evenings.", 0.26, 0.26, 5, true],
    ["Bandeirantes", "BR", "Brasil!", 0.36, 0.63, 22, true],
    ["Rising Sun", "NIPN", "Japan and East Asia.", 0.885, 0.3, 10, false],
  ];
  const store: DevStore = {
    clans: seed.map(([name, tag, blurb, x, y, members, open], i) => ({ id: `seed-${i}`, name, tag, blurb, x, y, members, open, founder: `seed-founder-${i}` })),
    rolls: {},
    asks: [],
  };
  return store;
}
const devSave = (s: DevStore) => localStorage.setItem(DEV_KEY, JSON.stringify(s));

// ------------------------------------------------------------------ service
class ClanService {
  /** The player's own tag, once known: carried in front of their name in a solo game. */
  myTag: string | null = null;

  private get db() {
    return account.database();
  }

  /** True when there is nowhere to keep clans (no Supabase, and not the dev preview). */
  get unavailable(): boolean {
    return !this.db && !account.preview;
  }

  /** Every clan, largest first. */
  async all(): Promise<Clan[]> {
    if (account.preview) return devLoad().clans.sort((a, b) => b.members - a.members);
    if (!this.db) return [];
    const { data, error } = await this.db.from("clans").select(COLUMNS).order("members", { ascending: false }).limit(3000);
    if (error) throw new Error(why(error));
    return (data as Row[]).map(fromRow);
  }

  /** The signed-in player's clan, its roll and (for a founder) the asks to join. Null if they have none. */
  async mine(): Promise<Mine | null> {
    const me = account.state?.uid;
    if (!me) {
      this.myTag = null;
      return null;
    }
    if (account.preview) {
      const s = devLoad();
      const at = s.rolls[me];
      const clan = at && s.clans.find((c) => c.id === at.clan);
      this.myTag = clan ? clan.tag : null;
      if (!clan) return null;
      const roll = Object.entries(s.rolls).filter(([, r]) => r.clan === clan.id).map(([id, r]) => ({ id, handle: r.handle ?? r.name, name: r.name, joinedAs: null, seen: null, founder: id === clan.founder }));
      return { clan, founder: clan.founder === me, roll, asks: clan.founder === me ? s.asks.filter((a) => a.clan === clan.id).map((a) => ({ id: a.user, handle: a.handle ?? a.name, name: a.name })) : [] };
    }
    if (!this.db) return null;
    const at = await this.db.from("clan_members").select("clan_id").eq("user_id", me).maybeSingle();
    if (at.error) throw new Error(why(at.error));
    if (!at.data) {
      this.myTag = null;
      return null;
    }
    const id = at.data.clan_id as string;
    const [clan, roll, asks] = await Promise.all([
      this.db.from("clans").select(COLUMNS).eq("id", id).single(),
      this.db.from("clan_members").select("user_id, handle, name, role, joined_as, last_seen").eq("clan_id", id).order("joined_at"),
      this.db.from("clan_requests").select("user_id, handle, name").eq("clan_id", id).order("created_at"),
    ]);
    if (clan.error) throw new Error(why(clan.error));
    const c = fromRow(clan.data as Row);
    this.myTag = c.tag;
    return {
      clan: c,
      founder: c.founder === me,
      roll: (roll.data ?? []).map((r) => ({
        id: r.user_id as string,
        handle: ((r.handle as string | null) ?? (r.name as string)),
        name: r.name as string,
        joinedAs: r.joined_as && r.joined_as !== r.name ? (r.joined_as as string) : null,
        seen: (r.last_seen as string | null) ?? null,
        founder: r.role === "founder",
      })),
      // The database only shows asks to the founder.
      asks: (asks.data ?? []).filter((r) => r.user_id !== me).map((r) => ({ id: r.user_id as string, handle: (r.handle as string | null) ?? (r.name as string), name: r.name as string })),
    };
  }

  /** The clans the signed-in player has asked to join and not yet heard from. */
  async asked(): Promise<Set<string>> {
    const me = account.state?.uid;
    if (!me) return new Set();
    if (account.preview) return new Set(devLoad().asks.filter((a) => a.user === me).map((a) => a.clan));
    if (!this.db) return new Set();
    const { data } = await this.db.from("clan_requests").select("clan_id").eq("user_id", me);
    return new Set((data ?? []).map((r) => r.clan_id as string));
  }

  /** Each resolves to an error message, or null if it was done. */
  async found(c: { name: string; tag: string; blurb: string; open: boolean; x: number; y: number }, display: string): Promise<string | null> {
    const me = account.state?.uid;
    if (!me) return "Sign in first.";
    if (account.preview) {
      if (!account.state?.handle) return "Choose an account name first.";
      const s = devLoad();
      const name = c.name.trim().replace(/\s+/g, " ");
      const tag = c.tag.trim().toUpperCase();
      if (s.rolls[me]) return "You are already in a clan. Leave it first.";
      if (name.length < 3 || name.length > 24) return "A clan name is 3 to 24 letters, digits and spaces.";
      if (!/^[A-Z0-9]{2,5}$/.test(tag)) return "A tag is 2 to 5 letters or digits.";
      if (s.clans.some((k) => k.tag === tag || k.name.toLowerCase() === name.toLowerCase())) return "That name or tag is already taken.";
      const id = `dev-${Date.now()}`;
      s.clans.push({ id, name, tag, blurb: c.blurb.slice(0, 200), open: c.open, x: c.x, y: c.y, members: 1, founder: me });
      s.rolls[me] = { clan: id, name: display, handle: account.state.handle };
      devSave(s);
      return null;
    }
    if (!this.db) return "Clans are not set up on this site.";
    const { error } = await this.db.rpc("create_clan", { name: c.name, tag: c.tag, blurb: c.blurb, open: c.open, x: c.x, y: c.y, display });
    return error ? why(error) : null;
  }

  /** Joins, or asks to. Resolves to what happened, or an error. */
  async join(clan: Clan, display: string): Promise<{ did?: "joined" | "asked"; error?: string }> {
    const me = account.state?.uid;
    if (!me) return { error: "Sign in first." };
    if (account.preview) {
      const handle = account.state?.handle;
      if (!handle) return { error: "Choose an account name first." };
      const s = devLoad();
      if (s.rolls[me]) return { error: "You are already in a clan. Leave it first." };
      const k = s.clans.find((x) => x.id === clan.id);
      if (!k) return { error: "No such clan." };
      if (k.open) {
        s.rolls[me] = { clan: k.id, name: display, handle };
        k.members++;
        s.asks = s.asks.filter((a) => a.user !== me);
        devSave(s);
        return { did: "joined" };
      }
      if (!s.asks.some((a) => a.clan === k.id && a.user === me)) s.asks.push({ clan: k.id, user: me, name: display, handle });
      devSave(s);
      return { did: "asked" };
    }
    if (!this.db) return { error: "Clans are not set up on this site." };
    const { data, error } = await this.db.rpc("join_clan", { clan: clan.id, display });
    return error ? { error: why(error) } : { did: data === "joined" ? "joined" : "asked" };
  }

  async withdraw(clan: Clan): Promise<string | null> {
    const me = account.state?.uid;
    if (!me) return "Sign in first.";
    if (account.preview) {
      const s = devLoad();
      s.asks = s.asks.filter((a) => !(a.clan === clan.id && a.user === me));
      devSave(s);
      return null;
    }
    if (!this.db) return "Clans are not set up on this site.";
    const { error } = await this.db.from("clan_requests").delete().eq("clan_id", clan.id).eq("user_id", me);
    return error ? why(error) : null;
  }

  async leave(): Promise<string | null> {
    const me = account.state?.uid;
    if (!me) return "Sign in first.";
    if (account.preview) {
      const s = devLoad();
      const at = s.rolls[me];
      if (!at) return null;
      const k = s.clans.find((x) => x.id === at.clan);
      delete s.rolls[me];
      if (k) {
        const heir = Object.entries(s.rolls).find(([, r]) => r.clan === k.id);
        if (k.founder === me && !heir) s.clans = s.clans.filter((x) => x.id !== k.id);
        else {
          k.members = Math.max(1, k.members - 1);
          if (k.founder === me && heir) k.founder = heir[0];
        }
      }
      devSave(s);
      return null;
    }
    if (!this.db) return "Clans are not set up on this site.";
    const { error } = await this.db.rpc("leave_clan");
    return error ? why(error) : null;
  }

  /** The founder answers an ask to join. */
  async answer(who: string, accept: boolean): Promise<string | null> {
    if (account.preview) {
      const s = devLoad();
      const ask = s.asks.find((a) => a.user === who);
      s.asks = s.asks.filter((a) => a !== ask);
      const k = ask && s.clans.find((x) => x.id === ask.clan);
      if (ask && k && accept) {
        s.rolls[who] = { clan: k.id, name: ask.name, handle: ask.handle };
        k.members++;
      }
      devSave(s);
      return null;
    }
    if (!this.db) return "Clans are not set up on this site.";
    const { error } = await this.db.rpc("answer_request", { who, accept });
    return error ? why(error) : null;
  }

  /** The founder removes a member. */
  async remove(who: string): Promise<string | null> {
    if (account.preview) {
      const s = devLoad();
      const at = s.rolls[who];
      const k = at && s.clans.find((x) => x.id === at.clan);
      delete s.rolls[who];
      if (k) k.members = Math.max(1, k.members - 1);
      devSave(s);
      return null;
    }
    if (!this.db) return "Clans are not set up on this site.";
    const { error } = await this.db.rpc("kick_member", { who });
    return error ? why(error) : null;
  }

  /** Tells whoever runs the site that a clan should be looked at. */
  async report(clan: Clan, reason: ReportReason, note: string): Promise<string | null> {
    if (!account.state) return "Sign in first.";
    if (account.preview) return null;
    if (!this.db) return "Clans are not set up on this site.";
    const { error } = await this.db.rpc("report_clan", { clan: clan.id, reason, note });
    return error ? why(error) : null;
  }

  /** The founder changes what the clan says of itself, how it takes members and where its pin is. */
  async change(c: { blurb: string; open: boolean; x: number; y: number }): Promise<string | null> {
    const me = account.state?.uid;
    if (account.preview) {
      const s = devLoad();
      const k = s.clans.find((x) => x.founder === me);
      if (!k) return "Only a clan's founder changes it.";
      Object.assign(k, { blurb: c.blurb.slice(0, 200), open: c.open, x: c.x, y: c.y });
      devSave(s);
      return null;
    }
    if (!this.db) return "Clans are not set up on this site.";
    const { error } = await this.db.rpc("update_clan", { blurb: c.blurb, open: c.open, x: c.x, y: c.y });
    return error ? why(error) : null;
  }
}

export const clans = new ClanService();
