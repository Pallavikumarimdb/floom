-- 20260501120000_apps_public_rls_select.sql
-- Defense-in-depth: enforce `apps.public = true` at the DB layer for any
-- non-admin (user-role) client.
--
-- Today, the runtime reads `apps` rows exclusively via the Supabase admin
-- client (service-role key) inside `src/app/api/apps/[slug]/route.ts` and
-- friends. The admin client bypasses RLS entirely, so this policy does not
-- affect production behaviour.
--
-- Without this policy, however, any future code path that uses the
-- user-role client (anon key) to read `apps` would silently return zero
-- rows for public apps, because no SELECT policy exists for the
-- `authenticated` or `anon` roles. This migration adds an explicit
-- "anyone can read public apps" policy so user-role reads are correct +
-- intentional.
--
-- Companion: keep private apps unreadable from user-role contexts. Owners
-- already have a separate policy ("owner can read own apps"); this only
-- adds the public-readable case.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'apps'
      AND policyname = 'apps_public_readable'
  ) THEN
    CREATE POLICY apps_public_readable
    ON public.apps
    FOR SELECT
    TO anon, authenticated
    USING (public = true);
  END IF;
END $$;

COMMENT ON POLICY apps_public_readable ON public.apps IS
  'Anyone (anon or authenticated) can read rows where public = true. '
  'Private apps remain readable only via the owner policy or the admin client.';
