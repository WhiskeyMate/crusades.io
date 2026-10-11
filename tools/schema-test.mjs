// Runs supabase/schema.sql against an in-process Postgres with stand-ins for
// the parts Supabase supplies (auth.users, auth.uid(), the roles), then
// exercises the functions the site calls. Run it with `npm run schema-test`
// after changing the schema: a function with a mistake in it is accepted when
// the schema is run and only fails when it is first called.
//
// Lines marked "(should FAIL)" are refusals working as meant; any other FAIL
// is a fault.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const schema = readFileSync(process.argv[2], "utf8");
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
`);

const step = async (label, fn) => {
  try {
    const out = await fn();
    console.log(`ok    ${label}${out !== undefined ? `: ${JSON.stringify(out)}` : ""}`);
    return out;
  } catch (e) {
    console.log(`FAIL  ${label}: ${e.message}`);
    return undefined;
  }
};
const as = async (uid) => db.exec(`select set_config('test.uid', '${uid ?? ""}', false)`);
const one = async (sql, params) => (await db.query(sql, params)).rows;

await step("schema.sql runs", async () => { await db.exec(schema); });
await step("schema.sql runs a second time", async () => { await db.exec(schema); });
await db.exec("grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;");

const [a] = await one("insert into auth.users (email) values ('a@x') returning id");
const [b] = await one("insert into auth.users (email) values ('b@x') returning id");
const [c] = await one("insert into auth.users (email) values ('c@x') returning id");
await step("profiles made by trigger", async () => (await one("select count(*)::int as n from public.profiles"))[0].n);

// ---- records
await as(a.id);
const totals = { units: { city: [3, 0, 1, 0] }, boats: { trade: [10, 8, 1, 0] }, bombs: {}, attacks: [5000, 200, 0], gold: [100, 200, 300, 0, 0, 0], conquests: [0, 1, 4], betrayals: 0 };
await step("record_game (first)", async () => { await one("select public.record_game($1,$2,$3,$4,$5,$6)", ["solo", true, 41.5, 900, "Europe", JSON.stringify(totals)]); });
await step("record row", async () => one("select mode, played, wins, seconds, best_land, totals from public.records where user_id = $1", [a.id]));
await step("record_game again inside a minute is ignored", async () => {
  await one("select public.record_game($1,$2,$3,$4,$5,$6)", ["solo", false, 10, 900, "Europe", JSON.stringify(totals)]);
  return (await one("select played from public.records where user_id = $1", [a.id]))[0].played;
});
await db.exec("update public.records set last_at = now() - interval '5 minutes'");
await step("record_game second game adds up", async () => {
  await one("select public.record_game($1,$2,$3,$4,$5,$6)", ["solo", false, 10, 600, "Greece", JSON.stringify(totals)]);
  return one("select played, wins, seconds, best_land, totals from public.records where user_id = $1 and mode = 'solo'", [a.id]);
});
await db.exec("update public.records set last_at = now() - interval '5 minutes'");
await step("record_game other mode", async () => {
  await one("select public.record_game($1,$2,$3,$4,$5,$6)", ["public", true, 22, 1200, "Earth", JSON.stringify(totals)]);
  return one("select mode, played, wins from public.records where user_id = $1 order by mode", [a.id]);
});

// ---- account names
await step("set_account_name", async () => { await one("select public.set_account_name('Whisk')"); return (await one("select handle from public.profiles where id = $1", [a.id]))[0].handle; });
await step("set_account_name: one correction allowed", async () => { await one("select public.set_account_name('Whisky')"); return (await one("select handle from public.profiles where id = $1", [a.id]))[0].handle; });
await step("set_account_name: then not for 30 days (should FAIL)", async () => { await one("select public.set_account_name('Whiskey')"); });
await step("set_account_name: foul (should FAIL)", async () => { await as(b.id); await one("select public.set_account_name('sh1t lord')"); });
await step("set_account_name: taken (should FAIL)", async () => { await one("select public.set_account_name('whisky')"); });
await step("set_account_name b", async () => { await one("select public.set_account_name('Bors')"); });

// ---- skins
await as(a.id);
await step("free banner saves", async () => { await db.exec(`set role authenticated`); try { await one("insert into public.skins (user_id, skin) values ($1, $2)", [a.id, JSON.stringify({ color: "#3f6475", division: 6, charge: 1 })]); } finally { await db.exec("reset role"); } });
await step("bright banner refused (should FAIL)", async () => { await db.exec(`set role authenticated`); try { await one("update public.skins set skin = $2 where user_id = $1", [a.id, JSON.stringify({ color: "#ff0000", division: 6, charge: 1 })]); } finally { await db.exec("reset role"); } });

// ---- clans
await as(c.id);
await step("create_clan without account name (should FAIL)", async () => { await one("select public.create_clan('No Name','NN','', true, 0.5, 0.5, 'House C')"); });
await as(a.id);
await step("create_clan foul name (should FAIL)", async () => { await one("select public.create_clan('F u c k ers','FKR','', true, 0.5, 0.5, 'House A')"); });
await step("create_clan banned tag (should FAIL)", async () => { await one("select public.create_clan('Fine Name','KKK','', true, 0.5, 0.5, 'House A')"); });
const clan = await step("create_clan", async () => (await one("select public.create_clan('Iron Wolves','wolfs','Central Europe', false, 0.53, 0.23, 'House A') as id"))[0].id);
await step("clan row", async () => one("select name, tag, open, members from public.clans"));
await step("create_clan when already in one (should FAIL)", async () => { await one("select public.create_clan('Second','SEC','', true, 0.5, 0.5, 'House A')"); });
await as(b.id);
await step("join by approval asks", async () => (await one("select public.join_clan($1, 'House B') as r", [clan]))[0].r);
await as(a.id);
await step("founder sees the ask", async () => one("select handle, name from public.clan_requests where clan_id = $1", [clan]));
await step("founder accepts", async () => { await one("select public.answer_request($1, true)", [b.id]); return one("select handle, name, role, joined_as from public.clan_members where clan_id = $1 order by joined_at", [clan]); });
await step("clan_tag_for", async () => (await one("select public.clan_tag_for($1) as t", [b.id]))[0].t);
await step("clan_seen renames on the roll", async () => { await one("select public.clan_seen($1, 'House Mischief')", [b.id]); return one("select handle, name, joined_as, last_seen is not null as seen from public.clan_members where user_id = $1", [b.id]); });
await step("update_clan", async () => { await one("select public.update_clan('New words', true, 0.6, 0.3)"); return one("select blurb, open, pin_x from public.clans"); });
await step("update_clan foul (should FAIL)", async () => { await one("select public.update_clan('total sh1t', true, 0.6, 0.3)"); });
await as(c.id);
await step("c sets name and joins the now open clan", async () => { await one("select public.set_account_name('Cedric')"); return (await one("select public.join_clan($1, 'House C') as r", [clan]))[0].r; });
await step("report_clan", async () => { await one("select public.report_clan($1, 'about', 'rude')", [clan]); return one("select name, reports, reasons, notes from public.clan_reports_open"); });
await as(a.id);
await step("kick_member", async () => { await one("select public.kick_member($1)", [c.id]); return (await one("select members from public.clans"))[0].members; });
await step("founder leaves: clan passes on", async () => { await one("select public.leave_clan()"); return one("select c.members, m.handle, m.role from public.clans c join public.clan_members m on m.clan_id = c.id"); });
await as(b.id);
await step("last member leaves: clan dissolved", async () => { await one("select public.leave_clan()"); return (await one("select count(*)::int as n from public.clans"))[0].n; });
await step("foul() samples", async () => one("select public.foul('Peacock Throne') as peacock, public.foul('Therapists') as therapists, public.foul('the c0ck') as c0ck, public.foul('K K K') as kkk, public.foul_tag('1488') as t1488, public.foul_tag('WOLF') as wolf"));
