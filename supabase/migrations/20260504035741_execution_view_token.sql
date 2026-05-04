-- Anon-runner view token: secret stored as hash, raw secret returned once to
-- the original submitter. Callers that hold the raw token can re-read their
-- own execution even without a user_id (anonymous callers).
alter table executions
  add column if not exists view_token_hash text;

-- Fast lookup for future token-addressed endpoint.
create index if not exists executions_view_token_hash_idx
  on executions(view_token_hash)
  where view_token_hash is not null;
