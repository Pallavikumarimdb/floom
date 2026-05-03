alter table public.apps
  add column if not exists max_concurrency integer not null default 10;

alter table public.executions
  add column if not exists started_at timestamptz,
  add column if not exists progress jsonb,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists lease_until timestamptz,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists timed_out_at timestamptz,
  add column if not exists sandbox_id text,
  add column if not exists sandbox_pid integer,
  add column if not exists poll_count integer not null default 0,
  add column if not exists infra_attempt_count integer not null default 0,
  add column if not exists next_poll_at timestamptz,
  add column if not exists queue_message_id text,
  add column if not exists stdout_offset integer not null default 0,
  add column if not exists stderr_offset integer not null default 0;

-- Drop the old check constraint BEFORE remapping data: the legacy constraint
-- only allows ('pending','running','success','error'), so updating rows to
-- 'succeeded'/'failed'/'timed_out' below would otherwise fail.
alter table public.executions
  drop constraint if exists executions_status_valid,
  drop constraint if exists executions_status_check;

update public.executions
set status = case status
  when 'success' then 'succeeded'
  when 'error' then 'failed'
  else status
end
where status in ('success', 'error');

-- Catch genuinely abandoned sync-runtime executions stuck in 'running'.
-- Window widened from 2 min -> 15 min so a legitimate sync run that was
-- in flight at migration time isn't force-killed mid-execution. v0.1
-- sandbox timeout is 60s, command timeout 45s, request timeout 55s, so
-- anything 'running' for >15 min is structurally orphaned.
update public.executions
set
  status = 'timed_out',
  timed_out_at = coalesce(timed_out_at, now()),
  completed_at = coalesce(completed_at, now()),
  error = coalesce(error, 'Execution exceeded SANDBOX_TIMEOUT_MS')
where status = 'running'
  and created_at < now() - interval '15 minutes';

alter table public.executions
  add constraint executions_status_valid
  check (status in ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled'));

-- Backwards-compat alias trigger so legacy v0.1 code paths that still write
-- 'success' / 'error' continue to insert/update without violating the new
-- constraint. PR #29's worker writes the new vocab directly so the trigger
-- is a no-op for the new code. Drop this trigger after v0.1 sync route is
-- retired.
create or replace function public.executions_status_alias()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'success' then new.status := 'succeeded'; end if;
  if new.status = 'error' then new.status := 'failed'; end if;
  return new;
end;
$$;

drop trigger if exists executions_status_alias_trigger on public.executions;
create trigger executions_status_alias_trigger
  before insert or update of status on public.executions
  for each row execute function public.executions_status_alias();

create table if not exists public.execution_events (
  id bigint generated always as identity primary key,
  execution_id uuid not null references public.executions(id) on delete cascade,
  kind text not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint execution_events_kind_valid check (kind in ('status', 'progress', 'stdout', 'stderr', 'heartbeat', 'system'))
);

create index if not exists executions_status_created_at_idx
  on public.executions(status, created_at desc);

create index if not exists executions_app_status_created_at_idx
  on public.executions(app_id, status, created_at desc);

create index if not exists executions_active_lease_expires_at_idx
  on public.executions(lease_expires_at)
  where status in ('queued', 'running');

create index if not exists executions_active_lease_until_idx
  on public.executions(lease_until)
  where status in ('queued', 'running');

create index if not exists execution_events_execution_id_id_idx
  on public.execution_events(execution_id, id);

alter table public.execution_events enable row level security;

drop policy if exists "execution events are readable by app owner or caller" on public.execution_events;
create policy "execution events are readable by app owner or caller"
  on public.execution_events
  for select
  using (
    kind in ('status', 'progress', 'heartbeat', 'system')
    and exists (
      select 1
      from public.executions
      join public.apps on apps.id = executions.app_id
      where executions.id = execution_events.execution_id
        and (apps.owner_id = auth.uid() or executions.caller_user_id = auth.uid())
    )
  );

create or replace function public.claim_execution_lease(
  p_execution_id uuid,
  p_lease_token uuid,
  p_lease_expires_at timestamptz
)
returns setof public.executions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_execution public.executions%rowtype;
  v_max_concurrency integer;
  v_running_count integer;
begin
  select *
  into v_execution
  from public.executions
  where id = p_execution_id
  for update;

  if not found then
    return;
  end if;

  if v_execution.status not in ('queued', 'running') then
    return;
  end if;

  if v_execution.lease_expires_at is not null
    and v_execution.lease_expires_at >= now()
    and v_execution.lease_token is distinct from p_lease_token
  then
    return;
  end if;

  if v_execution.status = 'queued' then
    perform pg_advisory_xact_lock(hashtext(v_execution.app_id::text));

    select greatest(coalesce(max_concurrency, 10), 1)
    into v_max_concurrency
    from public.apps
    where id = v_execution.app_id;

    if v_max_concurrency is null then
      v_max_concurrency := 10;
    end if;

    select count(*)
    into v_running_count
    from public.executions
    where app_id = v_execution.app_id
      and status = 'running';

    if v_running_count < v_max_concurrency then
      return query
      update public.executions
      set
        status = 'running',
        started_at = coalesce(started_at, now()),
        lease_token = p_lease_token,
        lease_expires_at = p_lease_expires_at,
        lease_until = p_lease_expires_at,
        last_heartbeat_at = now(),
        heartbeat_at = now(),
        next_poll_at = null
      where id = p_execution_id
        and status = 'queued'
      returning public.executions.*;
      return;
    end if;
  end if;

  return query
  update public.executions
  set
    lease_token = p_lease_token,
    lease_expires_at = p_lease_expires_at,
    lease_until = p_lease_expires_at,
    last_heartbeat_at = now(),
    heartbeat_at = now()
  where id = p_execution_id
    and status in ('queued', 'running')
    and (
      lease_expires_at is null
      or lease_expires_at < now()
      or lease_token = p_lease_token
    )
  returning public.executions.*;
end;
$$;

revoke all on function public.claim_execution_lease(uuid, uuid, timestamptz) from public;
grant execute on function public.claim_execution_lease(uuid, uuid, timestamptz) to service_role;

create or replace function public.clear_execution_lease(p_execution_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.executions
  set
    lease_token = null,
    lease_expires_at = null,
    lease_until = null
  where id = p_execution_id;
$$;

revoke all on function public.clear_execution_lease(uuid) from public;
grant execute on function public.clear_execution_lease(uuid) to service_role;
