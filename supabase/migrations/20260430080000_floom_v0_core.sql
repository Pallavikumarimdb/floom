create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  name text not null,
  runtime text not null,
  entrypoint text not null,
  handler text not null,
  public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apps_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  constraint apps_runtime_supported check (runtime in ('python'))
);

create table if not exists public.app_versions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  version integer not null,
  bundle_path text not null unique,
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  dependencies jsonb not null default '{}'::jsonb,
  secrets text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  constraint app_versions_version_positive check (version > 0),
  constraint app_versions_app_version_unique unique (app_id, version)
);

create table if not exists public.agent_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null default array['read', 'run', 'publish']::text[],
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint agent_tokens_hash_sha256 check (token_hash ~ '^[a-f0-9]{64}$')
);

create table if not exists public.executions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  version_id uuid references public.app_versions(id) on delete set null,
  caller_user_id uuid references auth.users(id) on delete set null,
  caller_agent_token_id uuid references public.agent_tokens(id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  status text not null default 'running',
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint executions_status_valid check (status in ('running', 'success', 'error'))
);

create table if not exists public.public_run_rate_limits (
  rate_key text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.apps
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists slug text,
  add column if not exists name text,
  add column if not exists runtime text,
  add column if not exists entrypoint text,
  add column if not exists handler text,
  add column if not exists public boolean default false,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.app_versions
  add column if not exists app_id uuid references public.apps(id) on delete cascade,
  add column if not exists version integer,
  add column if not exists bundle_path text,
  add column if not exists input_schema jsonb default '{}'::jsonb,
  add column if not exists output_schema jsonb default '{}'::jsonb,
  add column if not exists dependencies jsonb default '{}'::jsonb,
  add column if not exists secrets text[] default array[]::text[],
  add column if not exists created_at timestamptz default now();

alter table public.agent_tokens
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists name text,
  add column if not exists token_hash text,
  add column if not exists token_prefix text,
  add column if not exists scopes text[] default array['read', 'run', 'publish']::text[],
  add column if not exists expires_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists last_used_at timestamptz,
  add column if not exists revoked_at timestamptz;

alter table public.executions
  add column if not exists app_id uuid references public.apps(id) on delete cascade,
  add column if not exists version_id uuid references public.app_versions(id) on delete set null,
  add column if not exists caller_user_id uuid references auth.users(id) on delete set null,
  add column if not exists caller_agent_token_id uuid references public.agent_tokens(id) on delete set null,
  add column if not exists input jsonb default '{}'::jsonb,
  add column if not exists output jsonb,
  add column if not exists status text default 'running',
  add column if not exists error text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists completed_at timestamptz;

alter table public.public_run_rate_limits
  add column if not exists rate_key text,
  add column if not exists window_start timestamptz default now(),
  add column if not exists request_count integer default 1,
  add column if not exists updated_at timestamptz default now();

-- Existing Floom Minimal databases can already have these tables without the
-- constraints from the create-table definitions above. Each preflight aborts
-- before adding its constraint when existing rows violate the intended shape;
-- the migration does not guess, delete, or rewrite live data.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'p'
  ) then
    if exists (select 1 from public.profiles where id is null) then
      raise exception 'preflight abort: public.profiles.id contains null values; fix data before adding profiles_pkey';
    end if;
    if exists (
      select 1 from public.profiles
      group by id
      having count(*) > 1
    ) then
      raise exception 'preflight abort: public.profiles.id contains duplicate values; fix data before adding profiles_pkey';
    end if;
    alter table public.profiles add constraint profiles_pkey primary key (id);
  elsif not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ) then
    raise exception 'preflight abort: public.profiles already has a primary key that is not profiles(id)';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_id_fkey'
  ) then
    if exists (
      select 1
      from public.profiles
      where id is not null
        and not exists (
          select 1 from auth.users
          where auth.users.id = profiles.id
        )
    ) then
      raise exception 'preflight abort: public.profiles.id has rows without matching auth.users.id; fix data before adding profiles_id_fkey';
    end if;
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.apps'::regclass
      and contype = 'p'
  ) then
    if exists (select 1 from public.apps where id is null) then
      raise exception 'preflight abort: public.apps.id contains null values; fix data before adding apps_pkey';
    end if;
    if exists (
      select 1 from public.apps
      group by id
      having count(*) > 1
    ) then
      raise exception 'preflight abort: public.apps.id contains duplicate values; fix data before adding apps_pkey';
    end if;
    alter table public.apps add constraint apps_pkey primary key (id);
  elsif not exists (
    select 1 from pg_constraint
    where conrelid = 'public.apps'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ) then
    raise exception 'preflight abort: public.apps already has a primary key that is not apps(id)';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.apps'::regclass
      and conname = 'apps_slug_key'
  ) then
    if exists (
      select 1 from public.apps
      where slug is not null
      group by slug
      having count(*) > 1
    ) then
      raise exception 'preflight abort: public.apps.slug contains duplicate values; fix data before adding apps_slug_key';
    end if;
    alter table public.apps add constraint apps_slug_key unique (slug);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.apps'::regclass
      and conname = 'apps_owner_id_fkey'
  ) then
    if exists (
      select 1
      from public.apps
      where owner_id is not null
        and not exists (
          select 1 from auth.users
          where auth.users.id = apps.owner_id
        )
    ) then
      raise exception 'preflight abort: public.apps.owner_id has rows without matching auth.users.id; fix data before adding apps_owner_id_fkey';
    end if;
    alter table public.apps
      add constraint apps_owner_id_fkey
      foreign key (owner_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.apps'::regclass
      and conname = 'apps_slug_format'
  ) then
    if exists (
      select 1 from public.apps
      where slug is not null
        and slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
    ) then
      raise exception 'preflight abort: public.apps.slug contains invalid values; fix data before adding apps_slug_format';
    end if;
    alter table public.apps
      add constraint apps_slug_format
      check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.apps'::regclass
      and conname in ('apps_runtime_supported', 'apps_runtime_check')
  ) then
    if exists (
      select 1 from public.apps
      where runtime is not null
        and runtime not in ('python')
    ) then
      raise exception 'preflight abort: public.apps.runtime contains unsupported values; fix data before adding apps_runtime_supported';
    end if;
    alter table public.apps
      add constraint apps_runtime_supported
      check (runtime in ('python'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_versions'::regclass
      and contype = 'p'
  ) then
    if exists (select 1 from public.app_versions where id is null) then
      raise exception 'preflight abort: public.app_versions.id contains null values; fix data before adding app_versions_pkey';
    end if;
    if exists (
      select 1 from public.app_versions
      group by id
      having count(*) > 1
    ) then
      raise exception 'preflight abort: public.app_versions.id contains duplicate values; fix data before adding app_versions_pkey';
    end if;
    alter table public.app_versions add constraint app_versions_pkey primary key (id);
  elsif not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_versions'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ) then
    raise exception 'preflight abort: public.app_versions already has a primary key that is not app_versions(id)';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_versions'::regclass
      and conname = 'app_versions_app_id_fkey'
  ) then
    if exists (
      select 1
      from public.app_versions
      where app_id is not null
        and not exists (
          select 1 from public.apps
          where apps.id = app_versions.app_id
        )
    ) then
      raise exception 'preflight abort: public.app_versions.app_id has rows without matching public.apps.id; fix data before adding app_versions_app_id_fkey';
    end if;
    alter table public.app_versions
      add constraint app_versions_app_id_fkey
      foreign key (app_id) references public.apps(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_versions'::regclass
      and conname = 'app_versions_bundle_path_key'
  ) then
    if exists (
      select 1 from public.app_versions
      where bundle_path is not null
      group by bundle_path
      having count(*) > 1
    ) then
      raise exception 'preflight abort: public.app_versions.bundle_path contains duplicate values; fix data before adding app_versions_bundle_path_key';
    end if;
    alter table public.app_versions
      add constraint app_versions_bundle_path_key unique (bundle_path);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_versions'::regclass
      and conname in ('app_versions_app_version_unique', 'app_versions_app_id_version_key')
  ) then
    if exists (
      select 1 from public.app_versions
      where app_id is not null
        and version is not null
      group by app_id, version
      having count(*) > 1
    ) then
      raise exception 'preflight abort: public.app_versions has duplicate (app_id, version) values; fix data before adding app_versions_app_version_unique';
    end if;
    alter table public.app_versions
      add constraint app_versions_app_version_unique unique (app_id, version);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_versions'::regclass
      and conname = 'app_versions_version_positive'
  ) then
    if exists (
      select 1 from public.app_versions
      where version is not null
        and version <= 0
    ) then
      raise exception 'preflight abort: public.app_versions.version contains non-positive values; fix data before adding app_versions_version_positive';
    end if;
    alter table public.app_versions
      add constraint app_versions_version_positive check (version > 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_tokens'::regclass
      and contype = 'p'
  ) then
    if exists (select 1 from public.agent_tokens where id is null) then
      raise exception 'preflight abort: public.agent_tokens.id contains null values; fix data before adding agent_tokens_pkey';
    end if;
    if exists (
      select 1 from public.agent_tokens
      group by id
      having count(*) > 1
    ) then
      raise exception 'preflight abort: public.agent_tokens.id contains duplicate values; fix data before adding agent_tokens_pkey';
    end if;
    alter table public.agent_tokens add constraint agent_tokens_pkey primary key (id);
  elsif not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_tokens'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ) then
    raise exception 'preflight abort: public.agent_tokens already has a primary key that is not agent_tokens(id)';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_tokens'::regclass
      and conname = 'agent_tokens_owner_id_fkey'
  ) then
    if exists (
      select 1
      from public.agent_tokens
      where owner_id is not null
        and not exists (
          select 1 from auth.users
          where auth.users.id = agent_tokens.owner_id
        )
    ) then
      raise exception 'preflight abort: public.agent_tokens.owner_id has rows without matching auth.users.id; fix data before adding agent_tokens_owner_id_fkey';
    end if;
    alter table public.agent_tokens
      add constraint agent_tokens_owner_id_fkey
      foreign key (owner_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_tokens'::regclass
      and conname = 'agent_tokens_token_hash_key'
  ) then
    if exists (
      select 1 from public.agent_tokens
      where token_hash is not null
      group by token_hash
      having count(*) > 1
    ) then
      raise exception 'preflight abort: public.agent_tokens.token_hash contains duplicate values; fix data before adding agent_tokens_token_hash_key';
    end if;
    alter table public.agent_tokens
      add constraint agent_tokens_token_hash_key unique (token_hash);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_tokens'::regclass
      and conname = 'agent_tokens_hash_sha256'
  ) then
    if exists (
      select 1 from public.agent_tokens
      where token_hash is not null
        and token_hash !~ '^[a-f0-9]{64}$'
    ) then
      raise exception 'preflight abort: public.agent_tokens.token_hash contains invalid values; fix data before adding agent_tokens_hash_sha256';
    end if;
    alter table public.agent_tokens
      add constraint agent_tokens_hash_sha256
      check (token_hash ~ '^[a-f0-9]{64}$');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.executions'::regclass
      and contype = 'p'
  ) then
    if exists (select 1 from public.executions where id is null) then
      raise exception 'preflight abort: public.executions.id contains null values; fix data before adding executions_pkey';
    end if;
    if exists (
      select 1 from public.executions
      group by id
      having count(*) > 1
    ) then
      raise exception 'preflight abort: public.executions.id contains duplicate values; fix data before adding executions_pkey';
    end if;
    alter table public.executions add constraint executions_pkey primary key (id);
  elsif not exists (
    select 1 from pg_constraint
    where conrelid = 'public.executions'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ) then
    raise exception 'preflight abort: public.executions already has a primary key that is not executions(id)';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.executions'::regclass
      and conname = 'executions_app_id_fkey'
  ) then
    if exists (
      select 1
      from public.executions
      where app_id is not null
        and not exists (
          select 1 from public.apps
          where apps.id = executions.app_id
        )
    ) then
      raise exception 'preflight abort: public.executions.app_id has rows without matching public.apps.id; fix data before adding executions_app_id_fkey';
    end if;
    alter table public.executions
      add constraint executions_app_id_fkey
      foreign key (app_id) references public.apps(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.executions'::regclass
      and conname = 'executions_version_id_fkey'
  ) then
    if exists (
      select 1
      from public.executions
      where version_id is not null
        and not exists (
          select 1 from public.app_versions
          where app_versions.id = executions.version_id
        )
    ) then
      raise exception 'preflight abort: public.executions.version_id has rows without matching public.app_versions.id; fix data before adding executions_version_id_fkey';
    end if;
    alter table public.executions
      add constraint executions_version_id_fkey
      foreign key (version_id) references public.app_versions(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.executions'::regclass
      and conname = 'executions_caller_user_id_fkey'
  ) then
    if exists (
      select 1
      from public.executions
      where caller_user_id is not null
        and not exists (
          select 1 from auth.users
          where auth.users.id = executions.caller_user_id
        )
    ) then
      raise exception 'preflight abort: public.executions.caller_user_id has rows without matching auth.users.id; fix data before adding executions_caller_user_id_fkey';
    end if;
    alter table public.executions
      add constraint executions_caller_user_id_fkey
      foreign key (caller_user_id) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.executions'::regclass
      and conname = 'executions_caller_agent_token_id_fkey'
  ) then
    if exists (
      select 1
      from public.executions
      where caller_agent_token_id is not null
        and not exists (
          select 1 from public.agent_tokens
          where agent_tokens.id = executions.caller_agent_token_id
        )
    ) then
      raise exception 'preflight abort: public.executions.caller_agent_token_id has rows without matching public.agent_tokens.id; fix data before adding executions_caller_agent_token_id_fkey';
    end if;
    alter table public.executions
      add constraint executions_caller_agent_token_id_fkey
      foreign key (caller_agent_token_id) references public.agent_tokens(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.executions'::regclass
      and conname in ('executions_status_valid', 'executions_status_check')
  ) then
    if exists (
      select 1 from public.executions
      where status is not null
        and status not in ('running', 'success', 'error')
    ) then
      raise exception 'preflight abort: public.executions.status contains invalid values; fix data before adding executions_status_valid';
    end if;
    alter table public.executions
      add constraint executions_status_valid
      check (status in ('running', 'success', 'error'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.public_run_rate_limits'::regclass
      and contype = 'p'
  ) then
    if exists (select 1 from public.public_run_rate_limits where rate_key is null) then
      raise exception 'preflight abort: public.public_run_rate_limits.rate_key contains null values; fix data before adding public_run_rate_limits_pkey';
    end if;
    if exists (
      select 1 from public.public_run_rate_limits
      group by rate_key
      having count(*) > 1
    ) then
      raise exception 'preflight abort: public.public_run_rate_limits.rate_key contains duplicate values; fix data before adding public_run_rate_limits_pkey';
    end if;
    alter table public.public_run_rate_limits
      add constraint public_run_rate_limits_pkey primary key (rate_key);
  elsif not exists (
    select 1 from pg_constraint
    where conrelid = 'public.public_run_rate_limits'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (rate_key)'
  ) then
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.public_run_rate_limits'::regclass
        and conname = 'public_run_rate_limits_rate_key_key'
    ) then
      if exists (
        select 1 from public.public_run_rate_limits
        where rate_key is not null
        group by rate_key
        having count(*) > 1
      ) then
        raise exception 'preflight abort: public.public_run_rate_limits.rate_key contains duplicate values; fix data before adding public_run_rate_limits_rate_key_key';
      end if;
      alter table public.public_run_rate_limits
        add constraint public_run_rate_limits_rate_key_key unique (rate_key);
    end if;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.public_run_rate_limits'::regclass
      and contype in ('p', 'u')
      and pg_get_constraintdef(oid) in ('PRIMARY KEY (rate_key)', 'UNIQUE (rate_key)')
  ) then
    raise exception 'preflight abort: public.public_run_rate_limits.rate_key needs a primary key or unique constraint before check_public_run_rate_limit can use on conflict (rate_key)';
  end if;
end;
$$;

create index if not exists apps_owner_id_idx on public.apps(owner_id);
create index if not exists apps_slug_idx on public.apps(slug);
create index if not exists app_versions_app_id_version_idx on public.app_versions(app_id, version desc);
create index if not exists agent_tokens_owner_id_idx on public.agent_tokens(owner_id);
create index if not exists executions_app_id_created_at_idx on public.executions(app_id, created_at desc);
create index if not exists executions_caller_user_id_idx on public.executions(caller_user_id);
create index if not exists public_run_rate_limits_updated_at_idx
  on public.public_run_rate_limits(updated_at);

create or replace function public.floom_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists floom_set_profiles_updated_at on public.profiles;
create trigger floom_set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.floom_set_updated_at();

drop trigger if exists floom_set_apps_updated_at on public.apps;
create trigger floom_set_apps_updated_at
  before update on public.apps
  for each row execute function public.floom_set_updated_at();

create or replace function public.floom_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists floom_on_auth_user_created on auth.users;
create trigger floom_on_auth_user_created
  after insert on auth.users
  for each row execute function public.floom_handle_new_user();

-- Retire legacy profile bootstrap triggers that insert without ON CONFLICT.
drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.check_public_run_rate_limit(
  p_rate_key text,
  p_limit integer default 20,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  if p_rate_key is null or btrim(p_rate_key) = '' then
    return false;
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100000 then
    return false;
  end if;

  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    return false;
  end if;

  insert into public.public_run_rate_limits (
    rate_key,
    window_start,
    request_count,
    updated_at
  )
  values (p_rate_key, v_now, 1, v_now)
  on conflict (rate_key) do update
  set window_start = case
        when public_run_rate_limits.window_start <= v_now - make_interval(secs => p_window_seconds)
          then v_now
        else public_run_rate_limits.window_start
      end,
      request_count = case
        when public_run_rate_limits.window_start <= v_now - make_interval(secs => p_window_seconds)
          then 1
        else public_run_rate_limits.request_count + 1
      end,
      updated_at = v_now
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_public_run_rate_limit(text, integer, integer) from public;
grant execute on function public.check_public_run_rate_limit(text, integer, integer) to service_role;

alter table public.profiles enable row level security;
alter table public.apps enable row level security;
alter table public.app_versions enable row level security;
alter table public.agent_tokens enable row level security;
alter table public.executions enable row level security;
alter table public.public_run_rate_limits enable row level security;

drop policy if exists "profiles are owned by user" on public.profiles;
create policy "profiles are owned by user"
  on public.profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "apps are readable when public or owned" on public.apps;
drop policy if exists "Public apps are readable" on public.apps;
drop policy if exists "apps are readable by owner" on public.apps;
create policy "apps are readable by owner"
  on public.apps
  for select
  using (owner_id = auth.uid());

drop policy if exists "owners can create apps" on public.apps;
create policy "owners can create apps"
  on public.apps
  for insert
  with check (owner_id = auth.uid());

drop policy if exists "owners can update apps" on public.apps;
create policy "owners can update apps"
  on public.apps
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "owners can delete apps" on public.apps;
create policy "owners can delete apps"
  on public.apps
  for delete
  using (owner_id = auth.uid());

drop policy if exists "versions are readable when app public or owned" on public.app_versions;
drop policy if exists "Public app versions readable" on public.app_versions;
drop policy if exists "versions are readable by owner" on public.app_versions;
create policy "versions are readable by owner"
  on public.app_versions
  for select
  using (
    exists (
      select 1 from public.apps
      where apps.id = app_versions.app_id
        and apps.owner_id = auth.uid()
    )
  );

drop policy if exists "owners can create versions" on public.app_versions;
create policy "owners can create versions"
  on public.app_versions
  for insert
  with check (
    exists (
      select 1 from public.apps
      where apps.id = app_versions.app_id
        and apps.owner_id = auth.uid()
    )
  );

drop policy if exists "owners can update versions" on public.app_versions;
create policy "owners can update versions"
  on public.app_versions
  for update
  using (
    exists (
      select 1 from public.apps
      where apps.id = app_versions.app_id
        and apps.owner_id = auth.uid()
    )
  );

drop policy if exists "owners can delete versions" on public.app_versions;
create policy "owners can delete versions"
  on public.app_versions
  for delete
  using (
    exists (
      select 1 from public.apps
      where apps.id = app_versions.app_id
        and apps.owner_id = auth.uid()
    )
  );

drop policy if exists "agent tokens are owned by user" on public.agent_tokens;
create policy "agent tokens are owned by user"
  on public.agent_tokens
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "executions are readable when app public or owned" on public.executions;
drop policy if exists "executions are readable by app owner or caller" on public.executions;
create policy "executions are readable by app owner or caller"
  on public.executions
  for select
  using (
    caller_user_id = auth.uid()
    or
    exists (
      select 1 from public.apps
      where apps.id = executions.app_id
        and apps.owner_id = auth.uid()
    )
  );

drop policy if exists "public users and owners can create executions" on public.executions;
create policy "public users and owners can create executions"
  on public.executions
  for insert
  with check (
    exists (
      select 1 from public.apps
      where apps.id = executions.app_id
        and (apps.public or apps.owner_id = auth.uid())
    )
    and (
      version_id is null
      or exists (
        select 1 from public.app_versions
        where app_versions.id = executions.version_id
          and app_versions.app_id = executions.app_id
      )
    )
    and (caller_user_id is null or caller_user_id = auth.uid())
    and caller_agent_token_id is null
  );

drop policy if exists "owners can update executions" on public.executions;
create policy "owners can update executions"
  on public.executions
  for update
  using (
    exists (
      select 1 from public.apps
      where apps.id = executions.app_id
        and apps.owner_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public, file_size_limit)
values ('app-bundles', 'app-bundles', false, 1048576)
on conflict (id) do nothing;

drop policy if exists "app bundles readable by owning user" on storage.objects;
create policy "app bundles readable by owning user"
  on storage.objects
  for select
  using (
    bucket_id = 'app-bundles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "app bundles writable by owning user" on storage.objects;
create policy "app bundles writable by owning user"
  on storage.objects
  for insert
  with check (
    bucket_id = 'app-bundles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "app bundles updateable by owning user" on storage.objects;
create policy "app bundles updateable by owning user"
  on storage.objects
  for update
  using (
    bucket_id = 'app-bundles'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'app-bundles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "app bundles deletable by owning user" on storage.objects;
create policy "app bundles deletable by owning user"
  on storage.objects
  for delete
  using (
    bucket_id = 'app-bundles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
