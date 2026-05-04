-- ============================================================
-- Fix 1: Drop executions UPDATE owner policy
-- ============================================================
-- All execution writes go through service-role (admin client).
-- The owner-update policy via anon client was never used in app code
-- and had no WITH CHECK — an owner could rewrite caller_user_id, input,
-- output, and view_token_hash on any execution belonging to their app.
-- Drop the policy; service-role bypasses RLS and remains the sole writer.
DROP POLICY IF EXISTS "owners can update executions" ON public.executions;

-- ============================================================
-- Fix 2: Explicit RLS policies on cli_device_authorizations
-- ============================================================
-- RLS is enabled on this table but zero policies were defined,
-- leaving the intent ambiguous (deny-all or oversight?). Make it explicit.

-- The device auth flow:
--   1. CLI creates a pending row (service-role INSERT, no policy needed)
--   2. Authenticated user approves via UI (UPDATE via anon client after login)
--   3. CLI polls to check status (SELECT via anon client with user_code)
--   4. Expiry cleanup is service-role only

-- Users can SELECT their own approved/pending rows (owner_id = their uid).
-- Pending rows where owner_id IS NULL are readable by the poll endpoint via
-- service-role (bypasses RLS), so no anon SELECT on owner_id IS NULL needed.
DROP POLICY IF EXISTS "users can view their own device auths" ON public.cli_device_authorizations;
CREATE POLICY "users can view their own device auths"
  ON public.cli_device_authorizations
  FOR SELECT
  USING (owner_id = auth.uid());

-- Users can approve a pending row that has been linked to their account.
-- The link happens server-side (service-role UPDATE sets owner_id),
-- so by the time the user approves it, owner_id already equals their uid.
DROP POLICY IF EXISTS "users can approve their own device auths" ON public.cli_device_authorizations;
CREATE POLICY "users can approve their own device auths"
  ON public.cli_device_authorizations
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- INSERT and DELETE remain service-role only (no anon policies = deny for anon).
