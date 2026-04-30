-- Public app execution is mediated by Floom API routes.
-- Do not expose app/version metadata directly through Supabase anon reads.

drop policy if exists "Public apps are readable" on public.apps;
drop policy if exists "Public app versions readable" on public.app_versions;
