// Writes src/generated/changelog.json from the git history, so the site
// can show what changed and which build it is. Runs at the start of
// `npm run build`, on Netlify as well as locally.
//
// Netlify clones shallowly, so this first tries to fetch the full history.
// If git is unavailable or the history is shorter than what is already
// committed in the JSON, the committed file is kept.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export interface ChangelogEntry {
  hash: string;
  date: string; // YYYY-MM-DD
  subject: string;
}

export interface Changelog {
  version: string;
  builtAt: string;
  commits: number;
  entries: ChangelogEntry[];
}

const OUT = "src/generated/changelog.json";
const MAX_ENTRIES = 300;

function git(args: string): string {
  return execSync(`git ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function current(): Changelog | null {
  try {
    return existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as Changelog) : null;
  } catch {
    return null;
  }
}

/** Commits that are noise to a player: merges, formatting, typos in docs. */
function worthShowing(subject: string): boolean {
  const s = subject.toLowerCase();
  if (s.startsWith("merge ")) return false;
  if (/^(docs?|chore|ci|typo|lint|format)(\(.*\))?:/.test(s)) return false;
  if (s.includes("[skip changelog]")) return false;
  return true;
}

function fromGit(): Changelog | null {
  try {
    git("rev-parse --is-inside-work-tree");
  } catch {
    return null;
  }
  try {
    if (git("rev-parse --is-shallow-repository") === "true") git("fetch --unshallow --quiet");
  } catch {
    // Can't deepen; work with what is here.
  }
  const sep = "\u001f";
  const raw = git(`log --date=short --format=%h${sep}%ad${sep}%s`);
  if (!raw) return null;
  const all = raw.split("\n").map((line) => {
    const [hash, date, subject] = line.split(sep);
    return { hash, date, subject: subject.trim() };
  });
  const entries = all.filter((e) => worthShowing(e.subject)).slice(0, MAX_ENTRIES);
  const head = all[0];
  return {
    version: `0.1.${all.length}`,
    builtAt: head.date,
    commits: all.length,
    entries,
  };
}

const have = current();
const fresh = fromGit();
let out: Changelog;
if (fresh && (!have || fresh.commits >= have.commits)) {
  out = fresh;
} else if (have) {
  console.log(`changelog: keeping the committed file (${have.commits} commits); git gave ${fresh?.commits ?? "nothing"}`);
  out = have;
} else {
  out = { version: "0.1.0", builtAt: new Date().toISOString().slice(0, 10), commits: 0, entries: [] };
}
mkdirSync("src/generated", { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`changelog: v${out.version}, ${out.entries.length} entries shown of ${out.commits} commits`);
