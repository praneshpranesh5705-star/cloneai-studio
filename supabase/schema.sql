-- CloneAI Studio — full database schema
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- It is idempotent: running it twice is safe.

-- ---------------------------------------------------------------------------
-- 1. Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Agents
-- ---------------------------------------------------------------------------
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 400),
  system_prompt text not null default '',
  provider text not null default 'demo',
  model text not null default 'demo',
  temperature numeric(3, 2) not null default 0.70 check (temperature >= 0 and temperature <= 2),
  max_tokens integer not null default 800 check (max_tokens between 64 and 4096),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agents_owner_idx on public.agents (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Knowledge documents
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  content text not null check (char_length(content) between 1 and 200000),
  char_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists documents_agent_idx on public.documents (agent_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Conversations
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_agent_idx on public.conversations (agent_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- 5. Messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- 6. Usage events (one row per model call)
-- ---------------------------------------------------------------------------
create table if not exists public.usage_events (
  id bigserial primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  kind text not null default 'chat',
  provider text,
  model text,
  prompt_chars integer not null default 0,
  completion_chars integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists usage_owner_idx on public.usage_events (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists agents_touch on public.agents;
create trigger agents_touch before update on public.agents
  for each row execute function public.touch_updated_at();

drop trigger if exists conversations_touch on public.conversations;
create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Row Level Security
--    Every table is locked down; the policies below are the only way in.
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.agents        enable row level security;
alter table public.documents     enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.usage_events  enable row level security;

-- profiles: a user sees and edits only their own row
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- agents: owner has full control; anyone signed in can read public agents
drop policy if exists "agents_select_own_or_public" on public.agents;
create policy "agents_select_own_or_public" on public.agents
  for select to authenticated
  using ((select auth.uid()) = owner_id or is_public = true);

drop policy if exists "agents_insert_own" on public.agents;
create policy "agents_insert_own" on public.agents
  for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "agents_update_own" on public.agents;
create policy "agents_update_own" on public.agents
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "agents_delete_own" on public.agents;
create policy "agents_delete_own" on public.agents
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- documents: only the owner, and only for an agent they own
drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own" on public.documents
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own" on public.documents
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = (select auth.uid()))
  );

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own" on public.documents
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- conversations: owner only
drop policy if exists "conversations_select_own" on public.conversations;
create policy "conversations_select_own" on public.conversations
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "conversations_insert_own" on public.conversations;
create policy "conversations_insert_own" on public.conversations
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = (select auth.uid()))
  );

drop policy if exists "conversations_update_own" on public.conversations;
create policy "conversations_update_own" on public.conversations
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "conversations_delete_own" on public.conversations;
create policy "conversations_delete_own" on public.conversations
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- messages: reachable only through a conversation the caller owns
drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own" on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.owner_id = (select auth.uid())
  ));

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert to authenticated
  with check (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.owner_id = (select auth.uid())
  ));

-- usage_events: owner reads their own; inserts come from the server
drop policy if exists "usage_select_own" on public.usage_events;
create policy "usage_select_own" on public.usage_events
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "usage_insert_own" on public.usage_events;
create policy "usage_insert_own" on public.usage_events
  for insert to authenticated with check ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles      to authenticated;
grant select, insert, update, delete on public.agents        to authenticated;
grant select, insert, delete on public.documents     to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert on public.messages              to authenticated;
grant select, insert on public.usage_events          to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Auto-create a profile row whenever a user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
