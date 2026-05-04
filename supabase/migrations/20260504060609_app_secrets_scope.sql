-- Migration: add scope + runner_user_id to app_secrets (v0.4 per-runner secrets)
-- Applied to prod bdlzxpgsmlmijopdhqdf via Management API 2026-05-04.
-- This file is the local record of that operation.

-- Add scope column (shared = creator-set, per_runner = each caller sets their own)
ALTER TABLE app_secrets
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'shared';

-- Add runner_user_id (null for shared secrets, set to the runner's user id for per-runner)
ALTER TABLE app_secrets
  ADD COLUMN IF NOT EXISTS runner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Constraint: scope value must be valid
ALTER TABLE app_secrets
  ADD CONSTRAINT IF NOT EXISTS app_secrets_scope_valid
  CHECK (scope IN ('shared', 'per_runner'));

-- Constraint: per_runner rows must have a runner_user_id; shared rows must not
ALTER TABLE app_secrets
  ADD CONSTRAINT IF NOT EXISTS app_secrets_scope_runner_consistency
  CHECK (
    (scope = 'per_runner' AND runner_user_id IS NOT NULL) OR
    (scope = 'shared' AND runner_user_id IS NULL)
  );

-- Drop old unique constraint (only allowed one shared row per (app_id, name))
ALTER TABLE app_secrets
  DROP CONSTRAINT IF EXISTS app_secrets_app_name_key;

-- New unique index: one shared row + N per-runner rows per (app_id, name)
-- COALESCE maps NULL → a sentinel UUID so the unique index works correctly.
CREATE UNIQUE INDEX IF NOT EXISTS app_secrets_app_name_runner_idx
  ON app_secrets (app_id, name, COALESCE(runner_user_id, '00000000-0000-0000-0000-000000000000'));
