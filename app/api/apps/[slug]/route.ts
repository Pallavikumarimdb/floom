import { NextResponse } from "next/server";
import { fallbackApp } from "@/lib/schemas";
import { getAppBySlug, getCurrentAppManifest } from "@/lib/supabase/app-registry";
import type { FloomApp, JsonSchema } from "@/lib/types";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function hasSupabaseEnv() {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function appFromFallback(slug: string): FloomApp {
  return {
    ...fallbackApp,
    slug,
  };
}

function schemaFromManifest(manifest: unknown): JsonSchema | null {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return null;
  const maybe = manifest as { inputSchema?: JsonSchema; input_schema?: JsonSchema };
  return maybe.inputSchema ?? maybe.input_schema ?? null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;

  if (!hasSupabaseEnv()) {
    return NextResponse.json(appFromFallback(slug));
  }

  const app = await getAppBySlug(slug);

  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const manifest = await getCurrentAppManifest(app);

  return NextResponse.json({
    slug: app.slug,
    name: app.name,
    description: app.description ?? undefined,
    inputSchema: schemaFromManifest(manifest) ?? fallbackApp.inputSchema,
  } satisfies FloomApp);
}
