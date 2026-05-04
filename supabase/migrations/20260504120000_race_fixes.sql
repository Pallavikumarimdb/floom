-- Bundle F: race / TOCTOU fixes (P0-1, P0-2, P1-3, P1-4)
-- Applied: 2026-05-04

-- ─────────────────────────────────────────────────────────────────────────────
-- P0-1: atomic queue-slot claim
-- Replaces the TS-side SELECT COUNT … INSERT pattern with a Postgres function
-- that takes an advisory transaction lock on the app_id before checking depth.
-- Two concurrent requests can no longer both pass the count check.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.claim_app_queue_slot(
  p_app_id             uuid,
  p_queue_max          int,
  p_version_id         uuid,
  p_caller_user_id     uuid,
  p_caller_agent_token_id uuid,
  p_input              jsonb,
  p_status             text,
  p_view_token_hash    text
)
returns public.executions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_row   public.executions%rowtype;
begin
  -- Advisory lock scoped to this transaction on the app's queue.
  -- hashtext produces a 32-bit int from the app_id string; two calls with the
  -- same p_app_id block each other until the transaction completes.
  perform pg_advisory_xact_lock(hashtext('app_queue:' || p_app_id::text));

  select count(*) into v_count
  from public.executions
  where app_id = p_app_id
    and status in ('queued', 'running');

  if v_count >= p_queue_max then
    -- Signal queue_full to the caller via SQLSTATE P0001.
    raise exception 'queue_full' using errcode = 'P0001';
  end if;

  insert into public.executions (
    app_id,
    version_id,
    caller_user_id,
    caller_agent_token_id,
    input,
    status,
    view_token_hash,
    created_at
  ) values (
    p_app_id,
    p_version_id,
    p_caller_user_id,
    p_caller_agent_token_id,
    coalesce(p_input, '{}'::jsonb),
    p_status,
    p_view_token_hash,
    now()
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.claim_app_queue_slot(uuid, int, uuid, uuid, uuid, jsonb, text, text) from public;
grant execute on function public.claim_app_queue_slot(uuid, int, uuid, uuid, uuid, jsonb, text, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- P1-3: quota warning email idempotency
-- Replace the read-modify-write on user_metadata with an INSERT-or-skip table.
-- A unique constraint on (user_id, warned_date) ensures only one row per day;
-- the winning INSERT fires the email, duplicate inserts are silently ignored.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.quota_warning_log (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  warned_date date   not null,
  created_at timestamptz not null default now(),
  primary key (user_id, warned_date)
);

-- RLS: service_role bypasses; no direct user access needed.
alter table public.quota_warning_log enable row level security;

revoke all on table public.quota_warning_log from public, authenticated;
grant all on table public.quota_warning_log to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- P1-4: welcome email idempotency
-- Same pattern: INSERT-or-skip table with user_id primary key (one-per-lifetime).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.welcome_email_log (
  user_id  uuid        not null primary key references auth.users(id) on delete cascade,
  sent_at  timestamptz not null default now()
);

alter table public.welcome_email_log enable row level security;

revoke all on table public.welcome_email_log from public, authenticated;
grant all on table public.welcome_email_log to service_role;
