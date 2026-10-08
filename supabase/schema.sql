-- crusades.io accounts. Run once in the Supabase SQL editor.
--
-- profiles: who has paid. Players can read their own row and change nothing;
--           only the Stripe webhook (service role) writes it.
-- skins:    the arms a premium player has chosen. Players write their own
--           row, and the database itself refuses if they are not premium.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  premium boolean not null default false,
  stripe_customer_id text unique,
  updated_at timestamptz not null default now()
);

create table if not exists public.skins (
  user_id uuid primary key references auth.users on delete cascade,
  skin jsonb not null check (pg_column_size(skin) < 512),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.skins enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "read own skin" on public.skins;
create policy "read own skin" on public.skins
  for select using (auth.uid() = user_id);

drop policy if exists "premium sets own skin" on public.skins;
create policy "premium sets own skin" on public.skins
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.premium)
  );

drop policy if exists "premium changes own skin" on public.skins;
create policy "premium changes own skin" on public.skins
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.premium)
  );

-- Every new sign-up gets a (free) profile row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
