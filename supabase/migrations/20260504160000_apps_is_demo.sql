-- Add is_demo flag to apps.
-- Demo apps (shared public GEMINI key) get tighter rate limits:
--   per-caller  : 5 runs / 3600 seconds  (vs default 20/60)
--   per-app     : 100 runs / 3600 seconds (vs default 500/60)
-- Applied in POST /api/apps/[slug]/run when app.is_demo = true.

ALTER TABLE apps
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Mark the public meeting-action-items demo as a demo app.
UPDATE apps
  SET is_demo = true
  WHERE slug = 'meeting-action-items'
    AND public = true;
