-- Migration: decoupled sandbox poller (Option B)
--
-- Adds sandbox polling columns to the executions table so the new
-- /api/internal/executions/poll-sandboxes cron route can track which
-- executions need to be re-connected and polled independently of the
-- QStash process loop.
--
-- Run manually via Supabase SQL editor (service role) when you flip
-- FLOOM_DECOUPLED_SANDBOX=enabled in Vercel.  Do NOT run before the
-- code is deployed.

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS last_polled_at TIMESTAMPTZ;

-- Partial index: only rows with status='running' need fast lookup.
-- This avoids scanning the full executions table on every 30s cron tick.
CREATE INDEX IF NOT EXISTS executions_status_polled_idx
  ON executions (status, last_polled_at)
  WHERE status = 'running';
