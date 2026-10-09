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

-- ------------------------------------------------------- catalogue mirror
-- Generated by `npm run catalog-sql` from src/store/Catalog.ts. Do not edit by hand.
insert into public.catalog (item_id, crowns, kind) values
  ('troops-peasant', 250, 'item'),
  ('troops-mail', 300, 'item'),
  ('troops-archer', 400, 'item'),
  ('troops-monk', 400, 'item'),
  ('troops-crusader', 500, 'item'),
  ('troops-viking', 500, 'item'),
  ('troops-wizard', 600, 'item'),
  ('troops-skeleton', 650, 'item'),
  ('troops-ghost', 700, 'item'),
  ('troops-jester', 700, 'item'),
  ('troops-rabbit', 800, 'item'),
  ('troops-chicken', 800, 'item'),
  ('troops-goose', 850, 'item'),
  ('troops-cavalry', 900, 'item'),
  ('troops-snail', 900, 'item'),
  ('ships-black', 250, 'item'),
  ('ships-gilt', 400, 'item'),
  ('ships-norse', 700, 'item'),
  ('ships-lateen', 700, 'item'),
  ('ships-junk', 750, 'item'),
  ('ships-wraith', 850, 'item'),
  ('ships-tub', 800, 'item'),
  ('ships-swan', 900, 'item'),
  ('ships-duck', 1000, 'item'),
  ('ships-serpent', 1100, 'item'),
  ('ships-turtle', 1200, 'item'),
  ('build-slate', 250, 'item'),
  ('build-redbrick', 250, 'item'),
  ('build-nordic', 800, 'item'),
  ('build-desert', 800, 'item'),
  ('build-eastern', 850, 'item'),
  ('build-tourney', 900, 'item'),
  ('build-necropolis', 950, 'item'),
  ('build-apiary', 950, 'item'),
  ('build-toadstool', 1000, 'item'),
  ('trail-team', 100, 'item'),
  ('trail-gold', 150, 'item'),
  ('trail-blood', 150, 'item'),
  ('trail-ink', 150, 'item'),
  ('trail-royal', 150, 'item'),
  ('trail-sunset', 250, 'item'),
  ('trail-aurora', 250, 'item'),
  ('trail-deep', 250, 'item'),
  ('trail-ember', 250, 'item'),
  ('trail-frost', 250, 'item'),
  ('trail-forest', 250, 'item'),
  ('trail-teamfade', 250, 'item'),
  ('trail-bruise', 250, 'item'),
  ('trail-pulse', 300, 'item'),
  ('trail-mood', 350, 'item'),
  ('trail-alarm', 300, 'item'),
  ('trail-witch', 350, 'item'),
  ('trail-teamstripe', 200, 'item'),
  ('trail-regal', 250, 'item'),
  ('trail-crusader', 250, 'item'),
  ('trail-mourning', 250, 'item'),
  ('trail-tricolour', 250, 'item'),
  ('trail-teamtri', 250, 'item'),
  ('trail-imperial', 250, 'item'),
  ('trail-verdant', 250, 'item'),
  ('trail-chevrons', 300, 'item'),
  ('trail-goldchev', 350, 'item'),
  ('trail-barber', 300, 'item'),
  ('trail-teambarber', 300, 'item'),
  ('trail-chequer', 300, 'item'),
  ('trail-teamcheck', 300, 'item'),
  ('trail-harlequin', 350, 'item'),
  ('trail-surf', 300, 'item'),
  ('trail-lace', 300, 'item'),
  ('trail-goldlace', 350, 'item'),
  ('trail-mosaic', 350, 'item'),
  ('trail-goldbarber', 350, 'item'),
  ('trail-illuminated', 300, 'item'),
  ('trail-fire', 600, 'item'),
  ('trail-ghostfire', 600, 'item'),
  ('trail-bluefire', 600, 'item'),
  ('trail-stars', 500, 'item'),
  ('trail-fairy', 500, 'item'),
  ('trail-treasure', 500, 'item'),
  ('trail-g-fleur', 350, 'item'),
  ('trail-g-crowns', 350, 'item'),
  ('trail-g-crosses', 350, 'item'),
  ('trail-g-pattee', 400, 'item'),
  ('trail-g-stars', 350, 'item'),
  ('trail-g-anchors', 350, 'item'),
  ('trail-g-swords', 350, 'item'),
  ('trail-g-hearts', 350, 'item'),
  ('trail-g-skulls', 400, 'item'),
  ('trail-g-roses', 350, 'item'),
  ('trail-g-towers', 350, 'item'),
  ('trail-g-horses', 350, 'item'),
  ('trail-g-tridents', 350, 'item'),
  ('trail-g-keys', 400, 'item'),
  ('trail-g-chalices', 400, 'item'),
  ('trail-g-ermine', 450, 'item'),
  ('trail-g-bells', 400, 'item'),
  ('trail-g-axes', 400, 'item'),
  ('trail-g-arrows', 400, 'item'),
  ('trail-g-shields', 400, 'item'),
  ('trail-g-horseshoes', 400, 'item'),
  ('trail-g-jester', 450, 'item'),
  ('terr-stripes', 150, 'item'),
  ('terr-checks', 150, 'item'),
  ('terr-chevrons', 200, 'item'),
  ('terr-lozenges', 200, 'item'),
  ('terr-paly', 150, 'item'),
  ('terr-bendy', 150, 'item'),
  ('terr-dots', 200, 'item'),
  ('terr-waves', 200, 'item'),
  ('terr-scales', 250, 'item'),
  ('terr-bricks', 200, 'item'),
  ('terr-tartan', 250, 'item'),
  ('terr-honeycomb', 250, 'item'),
  ('terr-vair', 300, 'item'),
  ('terr-fretty', 300, 'item'),
  ('terr-camo', 300, 'item'),
  ('terr-g-fleur', 250, 'item'),
  ('terr-g-crowns', 250, 'item'),
  ('terr-g-crosses', 250, 'item'),
  ('terr-g-stars', 250, 'item'),
  ('terr-g-towers', 250, 'item'),
  ('terr-g-horses', 250, 'item'),
  ('terr-g-swords', 250, 'item'),
  ('terr-g-anchors', 250, 'item'),
  ('terr-g-moons', 250, 'item'),
  ('terr-g-suns', 250, 'item'),
  ('terr-g-hearts', 250, 'item'),
  ('terr-g-skulls', 300, 'item'),
  ('terr-g-spades', 250, 'item'),
  ('terr-g-clubs', 250, 'item'),
  ('terr-g-kings', 250, 'item'),
  ('terr-g-mitres', 250, 'item'),
  ('terr-g-pattee', 300, 'item'),
  ('terr-g-jerusalem', 300, 'item'),
  ('terr-g-lorraine', 250, 'item'),
  ('terr-g-roses', 250, 'item'),
  ('terr-g-shamrocks', 250, 'item'),
  ('terr-g-hammers', 250, 'item'),
  ('terr-g-tridents', 250, 'item'),
  ('terr-g-scales', 250, 'item'),
  ('terr-g-lozenge', 250, 'item'),
  ('terr-g-estoiles', 250, 'item'),
  ('terr-g-cinquefoils', 250, 'item'),
  ('terr-g-quatrefoils', 250, 'item'),
  ('terr-g-ivy', 250, 'item'),
  ('terr-g-pennons', 250, 'item'),
  ('terr-g-keys', 300, 'item'),
  ('terr-g-chalices', 350, 'item'),
  ('terr-g-ermine', 350, 'item'),
  ('terr-g-horseshoes', 300, 'item'),
  ('terr-g-bells', 300, 'item'),
  ('terr-g-axes', 350, 'item'),
  ('terr-g-arrows', 300, 'item'),
  ('terr-g-shields', 350, 'item'),
  ('terr-g-jester', 400, 'item'),
  ('banner-custom', 300, 'item'),
  ('bundle-risen', 2400, 'bundle'),
  ('bundle-marginalia', 2700, 'bundle'),
  ('bundle-fool', 2400, 'bundle'),
  ('bundle-farmyard', 2600, 'bundle'),
  ('bundle-northmen', 2000, 'bundle'),
  ('bundle-sultan', 1900, 'bundle'),
  ('bundle-tsar', 2300, 'bundle'),
  ('bundle-crusade', 1350, 'bundle'),
  ('bundle-enchanter', 1900, 'bundle'),
  ('bundle-herald', 950, 'bundle'),
  ('name', 200, 'name')
on conflict (item_id) do update set crowns = excluded.crowns, kind = excluded.kind;
