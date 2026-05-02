alter table public.apps
  alter column entrypoint drop not null,
  alter column handler drop not null;

alter table public.app_versions
  alter column input_schema drop not null,
  alter column input_schema drop default,
  alter column output_schema drop not null,
  alter column output_schema drop default,
  add column if not exists bundle_kind text not null default 'single_file',
  add column if not exists command text;

alter table public.executions
  add column if not exists error_detail jsonb;

drop table if exists public.app_quota_usage cascade;
create table public.app_quota_usage (
  app_id uuid not null references public.apps(id) on delete cascade,
  window_start date not null,
  e2b_seconds_consumed integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app_id, window_start),
  constraint app_quota_usage_seconds_nonnegative check (e2b_seconds_consumed >= 0)
);

create index if not exists app_quota_usage_window_start_idx
  on public.app_quota_usage(window_start desc);

create index if not exists app_quota_usage_app_id_window_start_idx
  on public.app_quota_usage(app_id, window_start desc);

drop trigger if exists floom_set_app_quota_usage_updated_at on public.app_quota_usage;
create trigger floom_set_app_quota_usage_updated_at
  before update on public.app_quota_usage
  for each row execute function public.floom_set_updated_at();

alter table public.app_quota_usage enable row level security;

drop policy if exists "service role manages app quota usage" on public.app_quota_usage;
create policy "service role manages app quota usage"
  on public.app_quota_usage
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.apps'::regclass
      and conname in ('apps_runtime_supported', 'apps_runtime_check')
  ) then
    alter table public.apps drop constraint if exists apps_runtime_supported;
    alter table public.apps drop constraint if exists apps_runtime_check;
  end if;
end;
$$;

alter table public.app_versions
  drop constraint if exists app_versions_bundle_kind_check;

alter table public.app_versions
  drop constraint if exists app_versions_tarball_command_check;

alter table public.app_versions
  add constraint app_versions_bundle_kind_check
  check (bundle_kind in ('single_file', 'tarball'));

alter table public.app_versions
  add constraint app_versions_tarball_command_check
  check (bundle_kind <> 'tarball' or nullif(btrim(command), '') is not null);

alter table public.executions
  drop constraint if exists executions_status_valid,
  drop constraint if exists executions_status_check;

alter table public.executions
  add constraint executions_status_valid
  check (status in ('running', 'success', 'failed', 'timed_out', 'error'));

create or replace function public.floom_reserve_app_quota_usage(
  p_app_id uuid,
  p_owner_id uuid,
  p_seconds integer,
  p_app_limit integer,
  p_owner_limit integer,
  p_window_start date default (timezone('utc', now()))::date
)
returns table (
  allowed boolean,
  reason text,
  e2b_seconds_consumed integer,
  owner_e2b_seconds_consumed integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seconds integer := greatest(0, coalesce(p_seconds, 0));
  v_app_current integer := 0;
  v_owner_current integer := 0;
  v_app_next integer := 0;
begin
  if not exists (
    select 1
    from public.apps
    where id = p_app_id
      and owner_id = p_owner_id
  ) then
    raise exception 'app does not belong to owner';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  -- Qualify with table name; the function's RETURN TABLE has an
  -- e2b_seconds_consumed OUT column that otherwise creates an ambiguous
  -- reference and PostgREST RPC calls fail with SQLSTATE 42702.
  select coalesce(app_quota_usage.e2b_seconds_consumed, 0)
  into v_app_current
  from public.app_quota_usage
  where app_quota_usage.app_id = p_app_id
    and app_quota_usage.window_start = p_window_start;
  v_app_current := coalesce(v_app_current, 0);

  select coalesce(sum(app_quota_usage.e2b_seconds_consumed), 0)
  into v_owner_current
  from public.app_quota_usage
  join public.apps on apps.id = app_quota_usage.app_id
  where apps.owner_id = p_owner_id
    and app_quota_usage.window_start = p_window_start;

  if v_app_current + v_seconds > p_app_limit then
    return query select false, 'exhausted'::text, v_app_current, v_owner_current;
    return;
  end if;

  if v_owner_current + v_seconds > p_owner_limit then
    return query select false, 'exhausted'::text, v_app_current, v_owner_current;
    return;
  end if;

  insert into public.app_quota_usage (
    app_id,
    window_start,
    e2b_seconds_consumed
  )
  values (
    p_app_id,
    p_window_start,
    v_seconds
  )
  on conflict (app_id, window_start)
  do update set
    e2b_seconds_consumed = public.app_quota_usage.e2b_seconds_consumed + excluded.e2b_seconds_consumed,
    updated_at = now()
  returning public.app_quota_usage.e2b_seconds_consumed into v_app_next;

  return query select true, null::text, v_app_next, v_owner_current + v_seconds;
end;
$$;

create or replace function public.floom_adjust_app_quota_usage(
  p_app_id uuid,
  p_seconds_delta integer,
  p_window_start date default (timezone('utc', now()))::date
)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.app_quota_usage (
    app_id,
    window_start,
    e2b_seconds_consumed
  )
  values (
    p_app_id,
    p_window_start,
    greatest(0, coalesce(p_seconds_delta, 0))
  )
  on conflict (app_id, window_start)
  do update set
    e2b_seconds_consumed = greatest(
      0,
      public.app_quota_usage.e2b_seconds_consumed + coalesce(p_seconds_delta, 0)
    ),
    updated_at = now()
  returning e2b_seconds_consumed;
$$;
