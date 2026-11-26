-- ---------------------------------------------------------------------------
-- LEGACY / OPTIONAL — you do not need to run this file.
--
-- supabase/schema.sql already creates public.profiles, its three RLS policies
-- and the signup trigger. Run that one file and you are done.
--
-- This file is kept only for someone who wants the profiles table on its own.
-- It is now idempotent: every policy is dropped before being recreated, so
-- running it twice (or after schema.sql) no longer errors with
--   ERROR: policy "Users can read their own profile" already exists
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Drop BOTH naming schemes. schema.sql creates profiles_select_own /
-- profiles_insert_own / profiles_update_own; this file historically created
-- "Users can read their own profile" and friends. Dropping only one set left
-- duplicate policies stacked on the same table.
drop policy if exists "Users can read their own profile"   on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select, insert, update on public.profiles to authenticated;
