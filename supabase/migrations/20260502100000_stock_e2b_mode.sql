alter table public.apps
  alter column entrypoint drop not null,
  alter column handler drop not null;

alter table public.app_versions
  alter column input_schema drop not null,
  alter column input_schema drop default,
  alter column output_schema drop not null,
  alter column output_schema drop default,
  add column if not exists bundle_kind text not null default 'single_file';

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
  add constraint app_versions_bundle_kind_check
  check (bundle_kind in ('single_file', 'tarball'));

alter table public.executions
  drop constraint if exists executions_status_valid,
  drop constraint if exists executions_status_check;

alter table public.executions
  add constraint executions_status_valid
  check (status in ('running', 'success', 'failed', 'timed_out', 'error'));
