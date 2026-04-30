type SupabaseKeyKind = "anon" | "service-role";

export type SupabaseClientLike = {
  from: (table: string) => unknown;
};

type SupabaseModule = {
  createClient: (
    url: string,
    key: string,
    options: {
      auth: {
        autoRefreshToken: boolean;
        persistSession: boolean;
      };
    },
  ) => SupabaseClientLike;
};

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("Supabase server clients cannot be created in the browser.");
  }
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readSupabaseUrl(): string {
  return process.env.SUPABASE_URL ?? readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
}

function readSupabaseKey(kind: SupabaseKeyKind): string {
  if (kind === "service-role") {
    return readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  }

  return process.env.SUPABASE_ANON_KEY ?? readRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

async function loadSupabaseModule(): Promise<SupabaseModule> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<SupabaseModule>;

    return await dynamicImport("@supabase/supabase-js");
  } catch (error) {
    throw new Error(
      "Missing runtime dependency @supabase/supabase-js. Install it before using Supabase server helpers.",
      { cause: error },
    );
  }
}

export async function createSupabaseServerClient(
  kind: SupabaseKeyKind = "anon",
): Promise<SupabaseClientLike> {
  assertServerOnly();
  const { createClient } = await loadSupabaseModule();

  return createClient(readSupabaseUrl(), readSupabaseKey(kind), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function createSupabaseServiceRoleClient(): Promise<SupabaseClientLike> {
  return createSupabaseServerClient("service-role");
}
