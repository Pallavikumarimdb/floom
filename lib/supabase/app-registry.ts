import { createSupabaseServiceRoleClient, type SupabaseClientLike } from "./server";

export type AppRegistryApp = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  description: string | null;
  prompt: string | null;
  visibility: "private" | "unlisted" | "public";
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AppVersionManifest = {
  manifest: unknown;
};

export type CreateExecutionInput = {
  appId: string;
  versionId?: string | null;
  userId?: string | null;
  shareLinkId?: string | null;
  sessionId?: string | null;
  inputs?: Record<string, unknown>;
  status?: "queued" | "running";
};

export type ExecutionRecord = {
  id: string;
  app_id: string;
  version_id: string | null;
  user_id: string | null;
  share_link_id: string | null;
  session_id: string | null;
  inputs: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseQuery = {
  select: (columns: string) => SupabaseQuery;
  eq: (column: string, value: unknown) => SupabaseQuery;
  insert: (value: Record<string, unknown>) => SupabaseQuery;
  maybeSingle: <T>() => Promise<QueryResult<T>>;
  single: <T>() => Promise<QueryResult<T>>;
};

function from(client: SupabaseClientLike, table: string): SupabaseQuery {
  return client.from(table) as SupabaseQuery;
}

async function registryClient(client?: SupabaseClientLike): Promise<SupabaseClientLike> {
  return client ?? createSupabaseServiceRoleClient();
}

export async function getAppBySlug(
  slug: string,
  client?: SupabaseClientLike,
): Promise<AppRegistryApp | null> {
  const supabase = await registryClient(client);
  const { data, error } = await from(supabase, "apps")
    .select(
      [
        "id",
        "owner_id",
        "slug",
        "name",
        "description",
        "prompt",
        "visibility",
        "current_version_id",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("slug", slug)
    .maybeSingle<AppRegistryApp>();

  if (error) {
    throw new Error(`Failed to load app by slug "${slug}": ${error.message}`);
  }

  return data;
}

export async function getCurrentAppManifest(
  app: AppRegistryApp,
  client?: SupabaseClientLike,
): Promise<unknown | null> {
  if (!app.current_version_id) {
    return null;
  }

  const supabase = await registryClient(client);
  const { data, error } = await from(supabase, "app_versions")
    .select("manifest")
    .eq("id", app.current_version_id)
    .maybeSingle<AppVersionManifest>();

  if (error) {
    throw new Error(`Failed to load current version for app "${app.id}": ${error.message}`);
  }

  return data?.manifest ?? null;
}

export async function createExecution(
  input: CreateExecutionInput,
  client?: SupabaseClientLike,
): Promise<ExecutionRecord> {
  const supabase = await registryClient(client);
  const { data, error } = await from(supabase, "executions")
    .insert({
      app_id: input.appId,
      version_id: input.versionId ?? null,
      user_id: input.userId ?? null,
      share_link_id: input.shareLinkId ?? null,
      session_id: input.sessionId ?? null,
      inputs: input.inputs ?? {},
      status: input.status ?? "queued",
    })
    .select(
      [
        "id",
        "app_id",
        "version_id",
        "user_id",
        "share_link_id",
        "session_id",
        "inputs",
        "output",
        "status",
        "error",
        "started_at",
        "completed_at",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .single<ExecutionRecord>();

  if (error) {
    throw new Error(`Failed to create execution for app "${input.appId}": ${error.message}`);
  }

  if (!data) {
    throw new Error(`Failed to create execution for app "${input.appId}": no row returned`);
  }

  return data;
}
