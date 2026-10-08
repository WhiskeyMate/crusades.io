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
drop policy if exists "premium sets own skin" on public.skins;
drop policy if exists "premium changes own skin" on public.skins;
drop policy if exists "owner sets own skin" on public.skins;
create policy "owner sets own skin" on public.skins
  for insert with check (auth.uid() = user_id and public.may_customise_arms(auth.uid()));
drop policy if exists "owner changes own skin" on public.skins;
create policy "owner changes own skin" on public.skins
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id and public.may_customise_arms(auth.uid()));

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
  kind text not null default 'item'   -- 'item' | 'bundle' | 'name'
);
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

create or replace function public.buy_bundle(bundle text, items text[])
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); price integer; bal integer; it text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select crowns into price from public.catalog where item_id = bundle and kind = 'bundle';
  if price is null then raise exception 'no such bundle'; end if;
  select crowns into bal from public.profiles where id = uid for update;
  if bal < price then raise exception 'not enough crowns'; end if;
  update public.profiles set crowns = crowns - price, updated_at = now() where id = uid;
  foreach it in array items loop
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
  -- The first name costs; changing it later costs again.
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
  if slot not in ('territory', 'banner', 'ships', 'buildings', 'troops') then raise exception 'no such slot'; end if;
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

-- ------------------------------------------------------- catalogue mirror
-- Keep in step with src/store/Catalog.ts. Re-run after changing prices.
insert into public.catalog (item_id, crowns, kind) values
  ('terr-stripes', 150, 'item'), ('terr-checks', 150, 'item'), ('terr-chevrons', 200, 'item'), ('terr-lozenges', 200, 'item'),
  ('banner-custom', 300, 'item'),
  ('ships-black', 250, 'item'), ('ships-gilt', 400, 'item'),
  ('build-slate', 250, 'item'), ('build-redbrick', 250, 'item'),
  ('troops-mail', 300, 'item'), ('troops-crusader', 500, 'item'),
  ('bundle-northern', 650, 'bundle'), ('bundle-crusade', 900, 'bundle'), ('bundle-herald', 800, 'bundle'),
  ('name', 200, 'name')
on conflict (item_id) do update set crowns = excluded.crowns, kind = excluded.kind;
