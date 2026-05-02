create table if not exists public.cli_device_authorizations (
  id uuid primary key default gen_random_uuid(),
  device_code_hash text not null unique,
  user_code text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'expired', 'consumed')),
  token_ciphertext text,
  agent_token_id uuid references public.agent_tokens(id) on delete set null,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  consumed_at timestamptz
);

alter table public.cli_device_authorizations enable row level security;

create index if not exists cli_device_authorizations_expires_at_idx
  on public.cli_device_authorizations (expires_at);

create index if not exists cli_device_authorizations_owner_id_idx
  on public.cli_device_authorizations (owner_id);
