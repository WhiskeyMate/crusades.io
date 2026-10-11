// Looking after the clans from the server's dashboard: which have been
// reported and why, every clan there is, and the words clans may not use.
// Talks to Supabase directly with the service key, as identity.ts does.
//
// All optional: without SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY the
// dashboard says so and shows nothing.

const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(URL_ && KEY);

async function rest(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY!}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export interface ClanBoard {
  enabled: boolean;
  /** Why nothing could be read, if nothing could. */
  error?: string;
  reported: { clan_id: string; name: string; tag: string; blurb: string; members: number; reports: number; latest: string; reasons: string; notes: string | null }[];
  clans: { id: string; name: string; tag: string; blurb: string; members: number; open: boolean; created_at: string }[];
  words: { word: string; kind: string }[];
}

let cached: { at: number; board: ClanBoard } | null = null;

/** What the dashboard shows. Read afresh at most every ten seconds, or at once after a change. */
export async function clanBoard(fresh = false): Promise<ClanBoard> {
  if (!enabled) return { enabled: false, reported: [], clans: [], words: [] };
  if (!fresh && cached && Date.now() - cached.at < 10_000) return cached.board;
  let board: ClanBoard;
  try {
    const [reported, clans, words] = await Promise.all([
      rest("clan_reports_open?select=*&limit=200"),
      rest("clans?select=id,name,tag,blurb,members,open,created_at&order=created_at.desc&limit=500"),
      rest("banned_words?select=word,kind&order=kind,word&limit=2000"),
    ]);
    board = { enabled: true, reported: reported as ClanBoard["reported"], clans: clans as ClanBoard["clans"], words: words as ClanBoard["words"] };
  } catch (e) {
    // Most often: supabase/schema.sql has not been run since clans were added.
    board = { enabled: true, error: e instanceof Error ? e.message : String(e), reported: [], clans: [], words: [] };
  }
  cached = { at: Date.now(), board };
  return board;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["any", "part", "whole", "tag"];

/** Does one thing to the clans or the word list. Resolves to a line for the log. */
export async function clanAct(action: string, arg: string): Promise<string> {
  if (!enabled) return "clans: Supabase is not set up on this server";
  try {
    switch (action) {
      case "delete": {
        if (!UUID.test(arg)) return "clans: not a clan id";
        const gone = (await rest(`clans?id=eq.${arg}&select=name,tag`, { method: "DELETE", headers: { Prefer: "return=representation" } })) as { name: string; tag: string }[] | null;
        return gone?.[0] ? `clan [${gone[0].tag}] ${gone[0].name} deleted` : "clans: no such clan";
      }
      case "dismiss": {
        if (!UUID.test(arg)) return "clans: not a clan id";
        await rest(`clan_reports?clan_id=eq.${arg}`, { method: "DELETE" });
        return `reports against clan ${arg.slice(0, 8)} dismissed`;
      }
      case "ban": {
        // "kind:word"
        const [kind, raw] = arg.split(":");
        const word = kind === "tag" ? (raw ?? "").trim().toUpperCase() : (raw ?? "").trim().toLowerCase();
        if (!KINDS.includes(kind)) return "clans: no such kind of match";
        if (!(kind === "tag" ? /^[A-Z0-9]{2,5}$/ : /^[a-z]{2,24}$/).test(word)) {
          return kind === "tag" ? "clans: a tag is 2 to 5 letters or digits" : "clans: a word is 2 to 24 letters, no spaces";
        }
        await rest("banned_words", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ word, kind }) });
        return `"${word}" banned from clans (${kind})`;
      }
      case "unban": {
        const [kind, word] = arg.split(":");
        if (!KINDS.includes(kind) || !/^[A-Za-z0-9]{2,24}$/.test(word ?? "")) return "clans: no such word";
        await rest(`banned_words?kind=eq.${kind}&word=eq.${encodeURIComponent(word)}`, { method: "DELETE" });
        return `"${word}" allowed in clans again`;
      }
      default:
        return "clans: unknown action";
    }
  } catch (e) {
    return `clans: failed, ${e instanceof Error ? e.message : e}`;
  } finally {
    cached = null;
  }
}
