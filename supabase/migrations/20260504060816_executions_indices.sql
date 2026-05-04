-- Performance: hot-path query indices on executions
-- /api/me/runs and /api/apps/<slug>/runs were table-scanning without these.

CREATE INDEX IF NOT EXISTS executions_caller_user_id_idx
  ON executions(caller_user_id)
  WHERE caller_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS executions_app_id_created_at_idx
  ON executions(app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS executions_caller_created_at_idx
  ON executions(caller_user_id, created_at DESC)
  WHERE caller_user_id IS NOT NULL;
