-- crusades.io accounts, Crowns and the store. Run in the Supabase SQL editor.
-- Safe to re-run: everything is "if not exists" or "create or replace".
--
-- profiles:  one row per account: Crowns balance, reserved house name, what
--            is equipped. Players read their own row; only the functions
--            below (and the Stripe webhook, via the service role) write it.
-- inventory: items owned. Written only by buy_item / grant_bundle.
-- purchases: a ledger of every Crown movement, for support and refunds.
-- skins:     the custom arms of a player who owns "banner-custom".

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  premium boolean not null default false,
  stripe_customer_id text unique,
  crowns integer not null default 0 check (crowns >= 0),
  username text unique,
  equipped jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists crowns integer not null default 0;
alter table public.profiles add column if not exists username text unique;
alter table public.profiles add column if not exists equipped jsonb not null default '{}'::jsonb;

create table if not exists public.inventory (
  user_id uuid not null references auth.users on delete cascade,
  item_id text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.purchases (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,              -- 'pack' | 'item' | 'bundle' | 'name' | 'refund' | 'grant'
  ref text,                        -- pack/item/bundle id, or the Stripe session id
  crowns integer not null,         -- + for credit, - for spend
  created_at timestamptz not null default now()
);
create unique index if not exists purchases_stripe_once on public.purchases (ref) where kind = 'pack';

create table if not exists public.skins (
  user_id uuid primary key references auth.users on delete cascade,
  skin jsonb not null check (pg_column_size(skin) < 512),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.inventory enable row level security;
alter table public.purchases enable row level security;
alter table public.skins enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "read own inventory" on public.inventory;
create policy "read own inventory" on public.inventory for select using (auth.uid() = user_id);
drop policy if exists "read own purchases" on public.purchases;
create policy "read own purchases" on public.purchases for select using (auth.uid() = user_id);
drop policy if exists "read own skin" on public.skins;
create policy "read own skin" on public.skins for select using (auth.uid() = user_id);

-- Custom arms: only for players who own the item (or are premium).
create or replace function public.may_customise_arms(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.premium)
      or exists (select 1 from public.inventory i where i.user_id = uid and i.item_id = 'banner-custom');
$$;
-- The plain banner any signed-in player may fly: a muted field, a simple
-- division, one of a few charges, no second colour and no charge colour.
-- The lists mirror FREE_COLORS, FREE_DIVISIONS and FREE_CHARGES in
-- src/client/Heraldry.ts.
create or replace function public.free_skin(skin jsonb) returns boolean
language sql immutable as $$
  select coalesce(
    lower(skin ->> 'color') in ('#7a3b3b', '#8a5a3a', '#8a7a45', '#5f7045', '#46705f', '#3f6475', '#4a5680', '#6a5078', '#5b4636', '#4a4f57')
    and (skin ->> 'division') in ('4', '0', '5', '6', '1', '12')
    and (skin ->> 'charge') in ('12', '0', '1', '2', '3', '4')
    and coalesce(jsonb_typeof(skin -> 'second'), 'null') = 'null'
    and coalesce(jsonb_typeof(skin -> 'ink'), 'null') = 'null',
    false);
$$;
drop policy if exists "premium sets own skin" on public.skins;
drop policy if exists "premium changes own skin" on public.skins;
drop policy if exists "owner sets own skin" on public.skins;
create policy "owner sets own skin" on public.skins
  for insert with check (auth.uid() = user_id and (public.may_customise_arms(auth.uid()) or public.free_skin(skin)));
drop policy if exists "owner changes own skin" on public.skins;
create policy "owner changes own skin" on public.skins
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id and (public.may_customise_arms(auth.uid()) or public.free_skin(skin)));

-- Every new sign-up gets a profile row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- Crowns in
-- Called by the Stripe webhook (service role). Idempotent per session id.
create or replace function public.add_crowns(uid uuid, amount integer, session text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.purchases where kind = 'pack' and ref = session) then return; end if;
  insert into public.purchases (user_id, kind, ref, crowns) values (uid, 'pack', session, amount);
  update public.profiles set crowns = crowns + amount, updated_at = now() where id = uid;
end $$;
revoke all on function public.add_crowns(uuid, integer, text) from public, anon, authenticated;

-- Called by the Stripe webhook when a pack is refunded, wholly or in part.
-- `should_total` is how many Crowns this charge should have given back so
-- far; only the part not yet taken is removed, so repeats are harmless. The
-- ledger records the full amount; the balance never goes below zero (a
-- player who already spent the Crowns keeps what they bought).
create or replace function public.refund_crowns(uid uuid, should_total integer, charge text)
returns integer language plpgsql security definer set search_path = public as $$
declare done integer; take integer;
begin
  select coalesce(sum(-crowns), 0) into done from public.purchases where kind = 'refund' and ref = charge;
  take := should_total - done;
  if take <= 0 then return 0; end if;
  insert into public.purchases (user_id, kind, ref, crowns) values (uid, 'refund', charge, -take);
  update public.profiles set crowns = greatest(0, crowns - take), updated_at = now() where id = uid;
  return take;
end $$;
revoke all on function public.refund_crowns(uuid, integer, text) from public, anon, authenticated;

-- --------------------------------------------------------------- Crowns out
-- Called by the signed-in player. The price is passed by the client but
-- checked against the catalogue mirror below, so the client cannot cheat it.
create table if not exists public.catalog (
  item_id text primary key,
  crowns integer not null check (crowns >= 0),
  kind text not null default 'item',  -- 'item' | 'bundle' | 'name'
  items text[]                        -- for a bundle: what is in it
);
alter table public.catalog add column if not exists items text[];
alter table public.catalog enable row level security;
drop policy if exists "anyone reads the catalog" on public.catalog;
create policy "anyone reads the catalog" on public.catalog for select using (true);

create or replace function public.buy_item(item text)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); price integer; bal integer;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select crowns into price from public.catalog where item_id = item and kind = 'item';
  if price is null then raise exception 'no such item'; end if;
  if exists (select 1 from public.inventory where user_id = uid and item_id = item) then raise exception 'already owned'; end if;
  select crowns into bal from public.profiles where id = uid for update;
  if bal < price then raise exception 'not enough crowns'; end if;
  update public.profiles set crowns = crowns - price, updated_at = now() where id = uid;
  insert into public.inventory (user_id, item_id) values (uid, item);
  insert into public.purchases (user_id, kind, ref, crowns) values (uid, 'item', item, -price);
  return bal - price;
end $$;

-- What a bundle holds comes from the catalogue, never from the caller: the
-- second argument is kept only so older pages still call this without error.
create or replace function public.buy_bundle(bundle text, items text[] default null)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); price integer; bal integer; it text; holds text[];
begin
  if uid is null then raise exception 'not signed in'; end if;
  select c.crowns, c.items into price, holds from public.catalog c where c.item_id = bundle and c.kind = 'bundle';
  if price is null or holds is null then raise exception 'no such bundle'; end if;
  if not exists (
    select 1 from unnest(holds) as h(item_id)
    where not exists (select 1 from public.inventory i where i.user_id = uid and i.item_id = h.item_id)
  ) then raise exception 'you already own everything in that bundle'; end if;
  select crowns into bal from public.profiles where id = uid for update;
  if bal < price then raise exception 'not enough crowns'; end if;
  update public.profiles set crowns = crowns - price, updated_at = now() where id = uid;
  foreach it in array holds loop
    insert into public.inventory (user_id, item_id) values (uid, it) on conflict do nothing;
  end loop;
  insert into public.purchases (user_id, kind, ref, crowns) values (uid, 'bundle', bundle, -price);
  return bal - price;
end $$;

create or replace function public.reserve_name(wanted text)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); price integer; bal integer; current text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if wanted !~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{2,23}$' then raise exception 'that name is not allowed'; end if;
  if exists (select 1 from public.profiles where lower(username) = lower(wanted) and id <> uid) then raise exception 'that name is taken'; end if;
  select crowns into price from public.catalog where item_id = 'name' and kind = 'name';
  select crowns, username into bal, current from public.profiles where id = uid for update;
  -- The first name costs; changing it later costs again. Keeping it costs nothing.
  if current is not null and current = wanted then raise exception 'that is already your house name'; end if;
  if bal < price then raise exception 'not enough crowns'; end if;
  update public.profiles set crowns = crowns - price, username = wanted, updated_at = now() where id = uid;
  insert into public.purchases (user_id, kind, ref, crowns) values (uid, 'name', wanted, -price);
  return bal - price;
end $$;

-- Wear something you own (or the default, id null) in a slot.
create or replace function public.equip_item(slot text, item text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if slot not in ('territory', 'banner', 'ships', 'buildings', 'troops', 'trails') then raise exception 'no such slot'; end if;
  if item is null then
    update public.profiles set equipped = equipped - slot, updated_at = now() where id = uid;
  else
    if not exists (select 1 from public.inventory where user_id = uid and item_id = item) then raise exception 'not owned'; end if;
    update public.profiles set equipped = equipped || jsonb_build_object(slot, item), updated_at = now() where id = uid;
  end if;
end $$;

-- The game server (service role) reads what a player wears.
create or replace function public.cosmetics_for(uid uuid)
returns table (username text, equipped jsonb, skin jsonb)
language sql stable security definer set search_path = public as $$
  select p.username, p.equipped, s.skin from public.profiles p left join public.skins s on s.user_id = p.id where p.id = uid;
$$;
revoke all on function public.cosmetics_for(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ records
-- A signed-in player's record. One row per account and kind of game
-- ('public', 'private', 'solo'): how many were played and won, time played,
-- the most land held, and `totals`, the running sums of everything the game
-- counts (buildings, ships, sorcery, levies, gold; see src/account/Record.ts
-- for its shape). Players read their own; it is written only by record_game
-- below, which the player's own browser calls when a game ends. Self-reported,
-- so the function bounds what it takes and accepts at most one game a minute.
drop table if exists public.records_old;
do $$ begin
  -- An earlier shape of this table had no `mode` column; nothing was ever kept in it.
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'records')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'records' and column_name = 'mode') then
    drop table public.records;
  end if;
end $$;
create table if not exists public.records (
  user_id uuid not null references auth.users on delete cascade,
  mode text not null check (mode in ('public', 'private', 'solo')),
  played integer not null default 0,
  wins integer not null default 0,
  seconds bigint not null default 0,
  best_land real not null default 0,
  totals jsonb not null default '{}'::jsonb,
  last_map text,
  last_at timestamptz,
  primary key (user_id, mode)
);
alter table public.records enable row level security;
drop policy if exists "read own record" on public.records;
create policy "read own record" on public.records for select using (auth.uid() = user_id);

-- Adds two totals together: numbers add, lists add place by place, and
-- objects add key by key. Anything else is dropped.
create or replace function public.jsonb_sum(a jsonb, b jsonb) returns jsonb
language plpgsql immutable as $$
declare
  ta text := coalesce(jsonb_typeof(a), 'null');
  tb text := coalesce(jsonb_typeof(b), 'null');
  n integer;
  out jsonb;
  k text;
begin
  if ta = 'null' then ta := tb; a := case tb when 'number' then '0'::jsonb when 'array' then '[]'::jsonb when 'object' then '{}'::jsonb else null end; end if;
  if tb = 'null' then tb := ta; b := case ta when 'number' then '0'::jsonb when 'array' then '[]'::jsonb when 'object' then '{}'::jsonb else null end; end if;
  if ta <> tb then return a; end if;
  if ta = 'number' then
    return to_jsonb(greatest(0, (a #>> '{}')::numeric) + greatest(0, (b #>> '{}')::numeric));
  elsif ta = 'array' then
    n := least(greatest(jsonb_array_length(a), jsonb_array_length(b)), 8);
    out := '[]'::jsonb;
    for i in 0 .. n - 1 loop
      out := out || jsonb_build_array(public.jsonb_sum(a -> i, b -> i));
    end loop;
    return out;
  elsif ta = 'object' then
    out := '{}'::jsonb;
    for k in select distinct key from (select jsonb_object_keys(a) as key union all select jsonb_object_keys(b)) keys loop
      out := out || jsonb_build_object(k, public.jsonb_sum(a -> k, b -> k));
    end loop;
    return out;
  end if;
  return null;
end $$;

drop function if exists public.record_game(boolean, boolean, integer, real, integer, text);
create or replace function public.record_game(mode text, won boolean, land real, secs integer, map text, totals jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prev timestamptz;
  l real := greatest(0, least(coalesce(land, 0), 100));
  t integer := least(coalesce(secs, 0), 4 * 3600);
  add jsonb := coalesce(totals, '{}'::jsonb);
begin
  if uid is null then raise exception 'not signed in'; end if;
  if mode not in ('public', 'private', 'solo') then raise exception 'no such kind of game'; end if;
  -- Too short to be a game.
  if t < 60 then return; end if;
  select max(r.last_at) into prev from public.records r where r.user_id = uid;
  if prev is not null and now() - prev < interval '60 seconds' then return; end if;
  -- Totals far larger than a game could produce are not taken.
  if jsonb_typeof(add) <> 'object' or pg_column_size(add) > 4000 then add := '{}'::jsonb; end if;
  insert into public.records as r (user_id, mode, played, wins, seconds, best_land, totals, last_map, last_at)
  values (uid, record_game.mode, 1, case when won then 1 else 0 end, t, l, public.jsonb_sum(add, '{}'::jsonb), left(map, 60), now())
  on conflict (user_id, mode) do update set
    played = r.played + 1,
    wins = r.wins + excluded.wins,
    seconds = r.seconds + excluded.seconds,
    best_land = greatest(r.best_land, excluded.best_land),
    totals = public.jsonb_sum(r.totals, excluded.totals),
    last_map = excluded.last_map,
    last_at = excluded.last_at;
end $$;
revoke all on function public.record_game(text, boolean, real, integer, text, jsonb) from public, anon;
grant execute on function public.record_game(text, boolean, real, integer, text, jsonb) to authenticated;

-- -------------------------------------------------------------------- clans
-- Clans of players (the small AI realms in a game are "tribes"). A clan has a
-- name, a tag of two to four letters and digits that its members carry in
-- front of their house names, a few words about itself, and a pin on the
-- world map saying where it calls home. A player is in at most one clan.
--
-- clans:         anyone may read. Written only by the functions below.
-- clan_members:  anyone may read (the roll of a clan is public).
-- clan_requests: asks to join a clan that takes members by approval. Read by
--                the asker and by the clan's founder.
create table if not exists public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 24),
  tag text not null check (tag ~ '^[A-Z0-9]{2,4}$'),
  blurb text not null default '' check (char_length(blurb) <= 200),
  open boolean not null default true,
  pin_x real not null check (pin_x between 0 and 1),
  pin_y real not null check (pin_y between 0 and 1),
  founder uuid not null references auth.users on delete cascade,
  members integer not null default 1,
  created_at timestamptz not null default now()
);
create unique index if not exists clans_name_once on public.clans (lower(name));
create unique index if not exists clans_tag_once on public.clans (tag);

create table if not exists public.clan_members (
  user_id uuid primary key references auth.users on delete cascade,
  clan_id uuid not null references public.clans on delete cascade,
  role text not null default 'member' check (role in ('founder', 'member')),
  name text not null default 'A lord',
  joined_at timestamptz not null default now()
);
create index if not exists clan_members_by_clan on public.clan_members (clan_id);

create table if not exists public.clan_requests (
  clan_id uuid not null references public.clans on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null default 'A lord',
  created_at timestamptz not null default now(),
  primary key (clan_id, user_id)
);

alter table public.clans enable row level security;
alter table public.clan_members enable row level security;
alter table public.clan_requests enable row level security;
drop policy if exists "anyone reads clans" on public.clans;
create policy "anyone reads clans" on public.clans for select using (true);
drop policy if exists "anyone reads clan rolls" on public.clan_members;
create policy "anyone reads clan rolls" on public.clan_members for select using (true);
drop policy if exists "asker and founder read requests" on public.clan_requests;
create policy "asker and founder read requests" on public.clan_requests for select using (
  auth.uid() = user_id or exists (select 1 from public.clans c where c.id = clan_id and c.founder = auth.uid())
);
drop policy if exists "asker withdraws request" on public.clan_requests;
create policy "asker withdraws request" on public.clan_requests for delete using (auth.uid() = user_id);

-- Words clans may not use, in their names, tags or descriptions. Add or
-- remove rows here (or in the table editor) at any time; nothing needs
-- redeploying. Lower case letters only, except tags, which are as written.
--   any   : matched anywhere, even spread across spaces
--   part  : matched inside a single word
--   whole : matched as a whole word only (short words that sit inside innocent ones)
--   tag   : a whole tag
create table if not exists public.banned_words (
  word text not null,
  kind text not null check (kind in ('any', 'part', 'whole', 'tag')),
  primary key (word, kind)
);
-- Nobody reads it but the functions below.
alter table public.banned_words enable row level security;
insert into public.banned_words (word, kind) values
  ('nigger', 'any'), ('nigga', 'any'), ('niggr', 'any'), ('faggot', 'any'), ('kike', 'any'), ('tranny', 'any'),
  ('wetback', 'any'), ('hitler', 'any'), ('heilhitler', 'any'), ('whitepower', 'any'), ('gasthejews', 'any'), ('rapist', 'whole'), ('rapists', 'whole'),
  ('pedophile', 'any'), ('paedophile', 'any'), ('motherfucker', 'any'), ('fuck', 'any'), ('fuk', 'whole'), ('shit', 'part'),
  ('cunt', 'part'), ('bitch', 'part'), ('whore', 'part'), ('slut', 'part'), ('pussy', 'part'), ('penis', 'part'),
  ('vagina', 'part'), ('porn', 'part'), ('wanker', 'part'), ('jizz', 'part'), ('dildo', 'part'), ('blowjob', 'part'),
  ('handjob', 'part'), ('asshole', 'part'), ('arsehole', 'part'), ('molest', 'part'), ('retard', 'part'), ('nazi', 'part'),
  ('pedo', 'whole'), ('paedo', 'whole'), ('fagg', 'part'), ('cocksuck', 'part'), ('dickhead', 'part'), ('bollock', 'part'),
  ('cock', 'whole'), ('cocks', 'whole'), ('dick', 'whole'), ('dicks', 'whole'), ('rape', 'whole'), ('raped', 'whole'),
  ('rapes', 'whole'), ('raping', 'whole'), ('cum', 'whole'), ('anal', 'whole'), ('tits', 'whole'), ('fag', 'whole'),
  ('fags', 'whole'), ('twat', 'whole'), ('twats', 'whole'), ('wank', 'whole'), ('coon', 'whole'), ('coons', 'whole'),
  ('gook', 'whole'), ('spic', 'whole'), ('chink', 'whole'), ('kkk', 'any'), ('nonce', 'whole'), ('kys', 'whole'),
  ('KKK', 'tag'), ('NAZI', 'tag'), ('1488', 'tag'), ('FAG', 'tag'), ('FAGS', 'tag'), ('CUNT', 'tag'),
  ('FUCK', 'tag'), ('FUK', 'tag'), ('FUCC', 'tag'), ('FCK', 'tag'), ('SHIT', 'tag'), ('SHT', 'tag'),
  ('RAPE', 'tag'), ('NIGR', 'tag'), ('NIGA', 'tag'), ('NGGR', 'tag'), ('NGR', 'tag'), ('SLUT', 'tag'),
  ('DICK', 'tag'), ('COCK', 'tag'), ('PORN', 'tag'), ('ANAL', 'tag'), ('CUM', 'tag'), ('TITS', 'tag'),
  ('HEIL', 'tag'), ('PEDO', 'tag'), ('KYS', 'tag'), ('WANK', 'tag'), ('TWAT', 'tag'), ('HOE', 'tag')
on conflict do nothing;

-- Whether a piece of writing uses a banned word. Digits and signs often used
-- in place of letters are read as those letters first.
create or replace function public.foul(s text) returns boolean
language sql stable security definer set search_path = public as $$
  with t as (select translate(lower(coalesce(s, '')), '013457@$!', 'oieastasi') as v)
  select exists (
    select 1 from public.banned_words b, t where
      (b.kind = 'any' and regexp_replace(t.v, '[^a-z]', '', 'g') like '%' || b.word || '%')
      or (b.kind = 'part' and exists (select 1 from unnest(regexp_split_to_array(t.v, '[^a-z]+')) w where w like '%' || b.word || '%'))
      or (b.kind = 'whole' and b.word = any (regexp_split_to_array(t.v, '[^a-z]+')))
  );
$$;
create or replace function public.foul_tag(tag text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.banned_words b where b.kind = 'tag' and b.word = upper(coalesce(tag, ''))) or public.foul(tag);
$$;
revoke all on function public.foul(text) from public, anon, authenticated;
revoke all on function public.foul_tag(text) from public, anon, authenticated;

-- Reports of clans, for whoever runs the site to read in the table editor
-- (or the clan_reports_open view, which counts them by clan). One per player
-- and clan. Nobody reads them through the site.
create table if not exists public.clan_reports (
  id bigserial primary key,
  clan_id uuid not null references public.clans on delete cascade,
  reporter uuid not null references auth.users on delete cascade,
  reason text not null check (reason in ('name', 'about', 'pretending', 'other')),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (clan_id, reporter)
);
alter table public.clan_reports enable row level security;

create or replace view public.clan_reports_open as
  select c.id as clan_id, c.name, c.tag, c.blurb, c.members, count(*) as reports,
         max(r.created_at) as latest, string_agg(distinct r.reason, ', ') as reasons,
         string_agg(nullif(r.note, ''), ' | ') as notes
  from public.clan_reports r join public.clans c on c.id = r.clan_id
  group by c.id order by count(*) desc, max(r.created_at) desc;
revoke all on public.clan_reports_open from anon, authenticated;

create or replace function public.report_clan(clan uuid, reason text, note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if reason not in ('name', 'about', 'pretending', 'other') then raise exception 'Choose a reason.'; end if;
  if not exists (select 1 from clans c where c.id = clan) then raise exception 'No such clan.'; end if;
  if (select count(*) from clan_reports r where r.reporter = uid and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'That is enough reports for one day. Thank you.';
  end if;
  insert into clan_reports (clan_id, reporter, reason, note) values (clan, uid, report_clan.reason, left(btrim(coalesce(note, '')), 300))
  on conflict (clan_id, reporter) do update set reason = excluded.reason, note = excluded.note, created_at = now();
end $$;
revoke all on function public.report_clan(uuid, text, text) from public, anon;
grant execute on function public.report_clan(uuid, text, text) to authenticated;

-- A name fit to show: the letters a house name may have, at most 24 of them,
-- and no banned word.
create or replace function public.clan_display(display text) returns text
language sql stable as $$
  select case when public.foul(display) then 'A lord' else
    coalesce(nullif(btrim(left(regexp_replace(coalesce(display, ''), '[^A-Za-z0-9À-ÖØ-öø-ÿ _.\-]', '', 'g'), 24)), ''), 'A lord') end;
$$;

create or replace function public.create_clan(name text, tag text, blurb text, open boolean, x real, y real, display text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n text := btrim(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g'));
  t text := upper(btrim(coalesce(tag, '')));
  made uuid;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from clan_members m where m.user_id = uid) then raise exception 'You are already in a clan. Leave it first.'; end if;
  if char_length(n) < 3 or char_length(n) > 24 or n !~ '^[A-Za-z0-9À-ÖØ-öø-ÿ _.\-]+$' then
    raise exception 'A clan name is 3 to 24 letters, digits and spaces.';
  end if;
  if t !~ '^[A-Z0-9]{2,4}$' then raise exception 'A tag is 2 to 4 letters or digits.'; end if;
  if foul(n) then raise exception 'That clan name is not allowed.'; end if;
  if foul_tag(t) then raise exception 'That tag is not allowed.'; end if;
  if foul(blurb) then raise exception 'That description is not allowed.'; end if;
  begin
    insert into clans (name, tag, blurb, open, pin_x, pin_y, founder)
    values (n, t, left(btrim(coalesce(blurb, '')), 200), coalesce(open, true), greatest(0, least(1, x)), greatest(0, least(1, y)), uid)
    returning id into made;
  exception when unique_violation then
    raise exception 'That name or tag is already taken.';
  end;
  insert into clan_members (user_id, clan_id, role, name) values (uid, made, 'founder', clan_display(display));
  delete from clan_requests r where r.user_id = uid;
  return made;
end $$;

-- Joins an open clan at once ('joined'), or asks to join one that takes
-- members by approval ('asked').
create or replace function public.join_clan(clan uuid, display text)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c clans%rowtype;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from clan_members m where m.user_id = uid) then raise exception 'You are already in a clan. Leave it first.'; end if;
  select * into c from clans where id = clan for update;
  if not found then raise exception 'No such clan.'; end if;
  if c.members >= 200 then raise exception 'That clan is full.'; end if;
  if c.open then
    insert into clan_members (user_id, clan_id, role, name) values (uid, c.id, 'member', clan_display(display));
    update clans set members = members + 1 where id = c.id;
    delete from clan_requests r where r.user_id = uid;
    return 'joined';
  end if;
  if (select count(*) from clan_requests r where r.user_id = uid) >= 5 then raise exception 'You have asked five clans already. Withdraw one first.'; end if;
  insert into clan_requests (clan_id, user_id, name) values (c.id, uid, clan_display(display)) on conflict do nothing;
  return 'asked';
end $$;

-- Leaves your clan. A founder who leaves hands the clan to its longest-standing
-- member; if there is nobody else, the clan is dissolved.
create or replace function public.leave_clan()
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mine clan_members%rowtype;
  heir uuid;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  select * into mine from clan_members where user_id = uid;
  if not found then return; end if;
  if mine.role = 'founder' then
    select m.user_id into heir from clan_members m where m.clan_id = mine.clan_id and m.user_id <> uid order by m.joined_at limit 1;
    if heir is null then
      delete from clans where id = mine.clan_id;
      return;
    end if;
    update clan_members set role = 'founder' where user_id = heir;
    update clans set founder = heir where id = mine.clan_id;
  end if;
  delete from clan_members where user_id = uid;
  update clans set members = greatest(1, members - 1) where id = mine.clan_id;
end $$;

-- The founder answers an ask to join.
create or replace function public.answer_request(who uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c clans%rowtype;
  asked clan_requests%rowtype;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  select * into c from clans where founder = uid for update;
  if not found then raise exception 'Only a clan''s founder answers its requests.'; end if;
  select * into asked from clan_requests where clan_id = c.id and user_id = who;
  if not found then raise exception 'That request is gone.'; end if;
  delete from clan_requests where clan_id = c.id and user_id = who;
  if not accept then return; end if;
  if exists (select 1 from clan_members m where m.user_id = who) then raise exception 'They have joined another clan.'; end if;
  if c.members >= 200 then raise exception 'Your clan is full.'; end if;
  insert into clan_members (user_id, clan_id, role, name) values (who, c.id, 'member', asked.name);
  update clans set members = members + 1 where id = c.id;
  delete from clan_requests r where r.user_id = who;
end $$;

-- The founder removes a member.
create or replace function public.kick_member(who uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c uuid;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  select id into c from clans where founder = uid;
  if c is null then raise exception 'Only a clan''s founder removes members.'; end if;
  if who = uid then raise exception 'Leave the clan instead.'; end if;
  delete from clan_members where user_id = who and clan_id = c;
  if found then update clans set members = greatest(1, members - 1) where id = c; end if;
end $$;

-- The founder changes what the clan says of itself, how it takes members and where its pin is.
create or replace function public.update_clan(blurb text, open boolean, x real, y real)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if foul(update_clan.blurb) then raise exception 'That description is not allowed.'; end if;
  update clans set
    blurb = left(btrim(coalesce(update_clan.blurb, '')), 200),
    open = coalesce(update_clan.open, clans.open),
    pin_x = greatest(0, least(1, coalesce(x, pin_x))),
    pin_y = greatest(0, least(1, coalesce(y, pin_y)))
  where founder = uid;
  if not found then raise exception 'Only a clan''s founder changes it.'; end if;
end $$;

-- The tag a player carries, for the game server (service role only).
create or replace function public.clan_tag_for(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select c.tag from public.clan_members m join public.clans c on c.id = m.clan_id where m.user_id = uid;
$$;

revoke all on function public.create_clan(text, text, text, boolean, real, real, text) from public, anon;
revoke all on function public.join_clan(uuid, text) from public, anon;
revoke all on function public.leave_clan() from public, anon;
revoke all on function public.answer_request(uuid, boolean) from public, anon;
revoke all on function public.kick_member(uuid) from public, anon;
revoke all on function public.update_clan(text, boolean, real, real) from public, anon;
grant execute on function public.create_clan(text, text, text, boolean, real, real, text) to authenticated;
grant execute on function public.join_clan(uuid, text) to authenticated;
grant execute on function public.leave_clan() to authenticated;
grant execute on function public.answer_request(uuid, boolean) to authenticated;
grant execute on function public.kick_member(uuid) to authenticated;
grant execute on function public.update_clan(text, boolean, real, real) to authenticated;
revoke all on function public.clan_tag_for(uuid) from public, anon, authenticated;

-- ------------------------------------------------------- catalogue mirror
-- Generated by `npm run catalog-sql` from src/store/Catalog.ts. Do not edit by hand.
-- Whatever is no longer sold stops being sold: the table is rebuilt whole.
delete from public.catalog;
insert into public.catalog (item_id, crowns, kind, items) values
  ('troops-peasant', 250, 'item', null),
  ('troops-mail', 300, 'item', null),
  ('troops-archer', 400, 'item', null),
  ('troops-monk', 400, 'item', null),
  ('troops-crusader', 500, 'item', null),
  ('troops-viking', 500, 'item', null),
  ('troops-wizard', 600, 'item', null),
  ('troops-skeleton', 650, 'item', null),
  ('troops-ghost', 700, 'item', null),
  ('troops-jester', 700, 'item', null),
  ('troops-rabbit', 800, 'item', null),
  ('troops-chicken', 800, 'item', null),
  ('troops-goose', 850, 'item', null),
  ('troops-cavalry', 900, 'item', null),
  ('troops-snail', 900, 'item', null),
  ('ships-black', 250, 'item', null),
  ('ships-gilt', 400, 'item', null),
  ('ships-norse', 700, 'item', null),
  ('ships-lateen', 700, 'item', null),
  ('ships-junk', 750, 'item', null),
  ('ships-wraith', 850, 'item', null),
  ('ships-tub', 800, 'item', null),
  ('ships-swan', 900, 'item', null),
  ('ships-duck', 1000, 'item', null),
  ('ships-serpent', 1100, 'item', null),
  ('ships-turtle', 1200, 'item', null),
  ('build-slate', 250, 'item', null),
  ('build-redbrick', 250, 'item', null),
  ('build-nordic', 800, 'item', null),
  ('build-desert', 800, 'item', null),
  ('build-eastern', 850, 'item', null),
  ('build-tourney', 900, 'item', null),
  ('build-necropolis', 950, 'item', null),
  ('build-apiary', 950, 'item', null),
  ('build-toadstool', 1000, 'item', null),
  ('trail-team', 100, 'item', null),
  ('trail-gold', 150, 'item', null),
  ('trail-blood', 150, 'item', null),
  ('trail-ink', 150, 'item', null),
  ('trail-royal', 150, 'item', null),
  ('trail-sunset', 250, 'item', null),
  ('trail-aurora', 250, 'item', null),
  ('trail-deep', 250, 'item', null),
  ('trail-ember', 250, 'item', null),
  ('trail-frost', 250, 'item', null),
  ('trail-forest', 250, 'item', null),
  ('trail-teamfade', 250, 'item', null),
  ('trail-bruise', 250, 'item', null),
  ('trail-pulse', 300, 'item', null),
  ('trail-mood', 350, 'item', null),
  ('trail-alarm', 300, 'item', null),
  ('trail-witch', 350, 'item', null),
  ('trail-teamstripe', 200, 'item', null),
  ('trail-regal', 250, 'item', null),
  ('trail-crusader', 250, 'item', null),
  ('trail-mourning', 250, 'item', null),
  ('trail-tricolour', 250, 'item', null),
  ('trail-teamtri', 250, 'item', null),
  ('trail-imperial', 250, 'item', null),
  ('trail-verdant', 250, 'item', null),
  ('trail-chevrons', 300, 'item', null),
  ('trail-goldchev', 350, 'item', null),
  ('trail-barber', 300, 'item', null),
  ('trail-teambarber', 300, 'item', null),
  ('trail-chequer', 300, 'item', null),
  ('trail-teamcheck', 300, 'item', null),
  ('trail-harlequin', 350, 'item', null),
  ('trail-surf', 300, 'item', null),
  ('trail-lace', 300, 'item', null),
  ('trail-goldlace', 350, 'item', null),
  ('trail-mosaic', 350, 'item', null),
  ('trail-goldbarber', 350, 'item', null),
  ('trail-illuminated', 300, 'item', null),
  ('trail-fire', 600, 'item', null),
  ('trail-ghostfire', 600, 'item', null),
  ('trail-bluefire', 600, 'item', null),
  ('trail-stars', 500, 'item', null),
  ('trail-fairy', 500, 'item', null),
  ('trail-treasure', 500, 'item', null),
  ('trail-g-fleur', 350, 'item', null),
  ('trail-g-crowns', 350, 'item', null),
  ('trail-g-crosses', 350, 'item', null),
  ('trail-g-pattee', 400, 'item', null),
  ('trail-g-stars', 350, 'item', null),
  ('trail-g-anchors', 350, 'item', null),
  ('trail-g-swords', 350, 'item', null),
  ('trail-g-hearts', 350, 'item', null),
  ('trail-g-skulls', 400, 'item', null),
  ('trail-g-roses', 350, 'item', null),
  ('trail-g-towers', 350, 'item', null),
  ('trail-g-horses', 350, 'item', null),
  ('trail-g-tridents', 350, 'item', null),
  ('trail-g-keys', 400, 'item', null),
  ('trail-g-chalices', 400, 'item', null),
  ('trail-g-ermine', 450, 'item', null),
  ('trail-g-bells', 400, 'item', null),
  ('trail-g-axes', 400, 'item', null),
  ('trail-g-arrows', 400, 'item', null),
  ('trail-g-shields', 400, 'item', null),
  ('trail-g-horseshoes', 400, 'item', null),
  ('trail-g-jester', 450, 'item', null),
  ('terr-stripes', 150, 'item', null),
  ('terr-checks', 150, 'item', null),
  ('terr-chevrons', 200, 'item', null),
  ('terr-lozenges', 200, 'item', null),
  ('terr-paly', 150, 'item', null),
  ('terr-bendy', 150, 'item', null),
  ('terr-dots', 200, 'item', null),
  ('terr-waves', 200, 'item', null),
  ('terr-scales', 250, 'item', null),
  ('terr-bricks', 200, 'item', null),
  ('terr-tartan', 250, 'item', null),
  ('terr-honeycomb', 250, 'item', null),
  ('terr-vair', 300, 'item', null),
  ('terr-fretty', 300, 'item', null),
  ('terr-camo', 300, 'item', null),
  ('terr-g-fleur', 250, 'item', null),
  ('terr-g-crowns', 250, 'item', null),
  ('terr-g-crosses', 250, 'item', null),
  ('terr-g-stars', 250, 'item', null),
  ('terr-g-towers', 250, 'item', null),
  ('terr-g-horses', 250, 'item', null),
  ('terr-g-swords', 250, 'item', null),
  ('terr-g-anchors', 250, 'item', null),
  ('terr-g-moons', 250, 'item', null),
  ('terr-g-suns', 250, 'item', null),
  ('terr-g-hearts', 250, 'item', null),
  ('terr-g-skulls', 300, 'item', null),
  ('terr-g-spades', 250, 'item', null),
  ('terr-g-clubs', 250, 'item', null),
  ('terr-g-kings', 250, 'item', null),
  ('terr-g-mitres', 250, 'item', null),
  ('terr-g-pattee', 300, 'item', null),
  ('terr-g-jerusalem', 300, 'item', null),
  ('terr-g-lorraine', 250, 'item', null),
  ('terr-g-roses', 250, 'item', null),
  ('terr-g-shamrocks', 250, 'item', null),
  ('terr-g-hammers', 250, 'item', null),
  ('terr-g-tridents', 250, 'item', null),
  ('terr-g-scales', 250, 'item', null),
  ('terr-g-lozenge', 250, 'item', null),
  ('terr-g-estoiles', 250, 'item', null),
  ('terr-g-cinquefoils', 250, 'item', null),
  ('terr-g-quatrefoils', 250, 'item', null),
  ('terr-g-ivy', 250, 'item', null),
  ('terr-g-pennons', 250, 'item', null),
  ('terr-g-keys', 300, 'item', null),
  ('terr-g-chalices', 350, 'item', null),
  ('terr-g-ermine', 350, 'item', null),
  ('terr-g-horseshoes', 300, 'item', null),
  ('terr-g-bells', 300, 'item', null),
  ('terr-g-axes', 350, 'item', null),
  ('terr-g-arrows', 300, 'item', null),
  ('terr-g-shields', 350, 'item', null),
  ('terr-g-jester', 400, 'item', null),
  ('banner-custom', 300, 'item', null),
  ('bundle-risen', 2400, 'bundle', array['build-necropolis', 'ships-wraith', 'troops-skeleton', 'terr-g-skulls', 'trail-g-skulls']),
  ('bundle-marginalia', 2700, 'bundle', array['troops-snail', 'build-toadstool', 'ships-turtle', 'terr-g-ivy', 'trail-illuminated']),
  ('bundle-fool', 2400, 'bundle', array['troops-jester', 'build-tourney', 'ships-tub', 'terr-g-jester', 'trail-g-jester']),
  ('bundle-farmyard', 2600, 'bundle', array['troops-goose', 'build-apiary', 'ships-duck', 'terr-g-shamrocks', 'trail-surf']),
  ('bundle-northmen', 2000, 'bundle', array['build-nordic', 'ships-norse', 'troops-viking', 'terr-g-axes', 'trail-g-axes']),
  ('bundle-sultan', 1900, 'bundle', array['build-desert', 'ships-lateen', 'troops-archer', 'terr-g-moons', 'trail-sunset']),
  ('bundle-tsar', 2300, 'bundle', array['build-eastern', 'ships-junk', 'troops-cavalry', 'terr-g-kings', 'trail-regal']),
  ('bundle-crusade', 1350, 'bundle', array['troops-crusader', 'ships-gilt', 'build-slate', 'terr-g-pattee', 'trail-g-pattee']),
  ('bundle-enchanter', 1900, 'bundle', array['troops-wizard', 'ships-serpent', 'terr-g-estoiles', 'trail-fairy']),
  ('bundle-herald', 950, 'bundle', array['banner-custom', 'terr-stripes', 'terr-checks', 'terr-chevrons', 'terr-lozenges', 'terr-g-fleur', 'terr-g-crowns']),
  ('name', 200, 'name', null);
