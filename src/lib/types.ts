// TODO(v5-port): types stub — floom@main/lib/types.ts
// Original has full AppDetail, RunRecord, ReviewSummary, ActionSpec, etc.
// This stub defines the minimum shapes used by AppPermalinkPage.

export interface ActionSpec {
  label: string;
  description?: string;
  inputs: Array<{ name: string; type?: string }>;
}

export interface AppManifest {
  name?: string;
  actions: Record<string, ActionSpec>;
  primary_action?: string;
  license?: string;
  secrets_needed?: string[];
  capabilities?: Record<string, boolean | string | number>;
}

export interface AppDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  category?: string;
  author?: string;
  author_display?: string;
  creator_handle?: string;
  runtime?: string;
  version?: string;
  visibility?: 'public' | 'private' | 'unlisted';
  public?: boolean;
  is_async?: boolean;
  upstream_host?: string;
  renderer?: string;
  runs_7d?: number;
  created_at?: string;
  manifest: AppManifest;
  actions?: string[];
  source_url?: string;
  user?: { id?: string; is_local?: boolean } | null;
}

export interface RunRecord {
  id: string;
  app_slug?: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'timeout';
  inputs?: Record<string, unknown>;
  output?: unknown;
  created_at?: string;
}

export interface ReviewSummary {
  count: number;
  avg: number;
}
