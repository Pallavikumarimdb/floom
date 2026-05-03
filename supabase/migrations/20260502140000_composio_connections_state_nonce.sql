-- Additive: add state_nonce column for OAuth CSRF protection.
-- Safe to apply multiple times (add column if not exists).

alter table public.composio_connections
  add column if not exists state_nonce text;
