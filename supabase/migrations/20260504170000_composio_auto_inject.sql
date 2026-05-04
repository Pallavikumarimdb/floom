-- Add composio column to app_versions for auto-injection of Composio connections.
-- Stores the list of provider slugs declared in the floom.yaml composio: field.
-- At run time, the worker looks up the caller's active composio_connections row
-- for each provider and injects COMPOSIO_<PROVIDER>_CONNECTION_ID env vars.

alter table public.app_versions
  add column if not exists composio text[] not null default array[]::text[];
