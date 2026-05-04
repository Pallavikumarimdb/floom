-- Replay protection for QStash webhook deliveries.
-- Each delivery carries an upstash-message-id header that is unique per message
-- (a ULID, e.g. "msg_01jvfq..."). We store seen ids and reject duplicates.
-- Rows older than 10 minutes are expired — QStash re-delivers within its retry
-- window (default ≤ 5 min), so 10 minutes is a safe TTL with ample headroom.

create table if not exists public.qstash_seen_jti (
  jti text not null,
  seen_at timestamptz not null default now(),
  constraint qstash_seen_jti_pkey primary key (jti)
);

-- Fast range scan for lazy cleanup (delete where seen_at < now() - interval '10 minutes').
create index if not exists qstash_seen_jti_seen_at_idx
  on public.qstash_seen_jti (seen_at);

-- Only the service role may read/write this table (internal worker path only).
alter table public.qstash_seen_jti enable row level security;

-- No anon or authenticated policies — service_role bypasses RLS by default in Supabase.
-- This table is never accessed by client-side code.

comment on table public.qstash_seen_jti is
  'Deduplication table for QStash webhook deliveries. jti = upstash-message-id header value.';
