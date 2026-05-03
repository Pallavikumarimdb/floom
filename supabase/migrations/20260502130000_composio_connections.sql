create extension if not exists pgcrypto;

create table if not exists public.composio_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  composio_account_id text not null,
  scopes text[] not null default array[]::text[],
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint composio_connections_provider_format check (provider ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  constraint composio_connections_status_valid check (status in ('pending', 'active', 'revoked', 'expired')),
  constraint composio_connections_revoked_consistent check (
    (status = 'revoked' and revoked_at is not null)
    or
    (status <> 'revoked' and revoked_at is null)
  )
);

alter table public.composio_connections
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists provider text,
  add column if not exists composio_account_id text,
  add column if not exists scopes text[] default array[]::text[],
  add column if not exists status text default 'pending',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists revoked_at timestamptz;

create unique index if not exists composio_connections_composio_account_id_key
  on public.composio_connections(composio_account_id);

create index if not exists composio_connections_user_provider_idx
  on public.composio_connections(user_id, provider, status);

create unique index if not exists composio_connections_one_active_provider_account
  on public.composio_connections(user_id, provider, composio_account_id)
  where status = 'active';

create table if not exists public.composio_proxy_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.composio_connections(id) on delete cascade,
  agent_token_id uuid references public.agent_tokens(id) on delete set null,
  provider text not null,
  tool_slug text not null,
  status_code integer not null,
  success boolean not null default false,
  created_at timestamptz not null default now(),
  constraint composio_proxy_audit_status_code_valid check (status_code between 100 and 599)
);

alter table public.composio_proxy_audit_log
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists connection_id uuid references public.composio_connections(id) on delete cascade,
  add column if not exists agent_token_id uuid references public.agent_tokens(id) on delete set null,
  add column if not exists provider text,
  add column if not exists tool_slug text,
  add column if not exists status_code integer,
  add column if not exists success boolean default false,
  add column if not exists created_at timestamptz default now();

create index if not exists composio_proxy_audit_log_user_created_idx
  on public.composio_proxy_audit_log(user_id, created_at desc);

create index if not exists composio_proxy_audit_log_connection_created_idx
  on public.composio_proxy_audit_log(connection_id, created_at desc);

alter table public.composio_connections enable row level security;
alter table public.composio_proxy_audit_log enable row level security;

grant select, insert, update, delete on public.composio_connections to authenticated;
grant select on public.composio_proxy_audit_log to authenticated;

drop policy if exists "composio connections are owned by user" on public.composio_connections;
create policy "composio connections are owned by user"
  on public.composio_connections
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "composio proxy audit rows are readable by user" on public.composio_proxy_audit_log;
create policy "composio proxy audit rows are readable by user"
  on public.composio_proxy_audit_log
  for select
  using (user_id = auth.uid());
