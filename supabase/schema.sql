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
