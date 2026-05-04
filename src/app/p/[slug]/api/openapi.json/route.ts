import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig, demoApp } from "@/lib/demo-app";
import { SITE_URL } from "@/lib/config/origin";

/**
 * GET /p/[slug]/api/openapi.json
 *
 * Returns an OpenAPI 3.1 spec for a public app, generated from its input_schema
 * and output_schema (or sensible defaults when schemas are not stored).
 *
 * Access: public apps only. No auth required.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  type SchemaMap = Record<string, unknown>;

  let appName = slug;
  let appDescription = "";
  let inputSchema: SchemaMap | null = null;
  let outputSchema: SchemaMap | null = null;

  if (!hasSupabaseConfig()) {
    if (slug === demoApp.slug) {
      appName = demoApp.name;
      appDescription = "Demo Floom app";
      inputSchema =
        ((demoApp as Record<string, unknown>).input_schema as SchemaMap) ?? null;
    } else {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
  } else {
    const admin = createAdminClient();
    const { data: app, error } = await admin
      .from("apps")
      .select(
        "name, description, public, app_versions(input_schema, output_schema)"
      )
      .eq("slug", slug)
      .eq("public", true)
      .order("version", { foreignTable: "app_versions", ascending: false })
      .limit(1, { foreignTable: "app_versions" })
      .maybeSingle();

    if (error || !app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    appName = (app.name as string) ?? slug;
    appDescription = (app.description as string) ?? "";
    const versions = app.app_versions as
      | Array<{
          input_schema: SchemaMap | null;
          output_schema: SchemaMap | null;
        }>
      | undefined;
    inputSchema = versions?.[0]?.input_schema ?? null;
    outputSchema = versions?.[0]?.output_schema ?? null;
  }

  // Build the run endpoint URL.
  const runUrl = `${SITE_URL}/api/apps/${slug}/run`;

  // Input schema: use stored JSON Schema or a catch-all if missing.
  const requestBodySchema: SchemaMap = inputSchema ?? {
    type: "object",
    description: "App-specific inputs. Check the app page for details.",
    additionalProperties: true,
  };

  // Output schema: use stored or a generic wrapper.
  const successResponseSchema: SchemaMap = outputSchema ?? {
    type: "object",
    description: "App-specific output. Check the app page for details.",
    additionalProperties: true,
  };

  const spec = {
    openapi: "3.1.0",
    info: {
      title: `${appName} — Floom API`,
      version: "1.0.0",
      description:
        appDescription ||
        `API reference for the ${appName} app on Floom.\n\nPublic apps run without authentication. To run a private app or raise rate limits, pass a Floom agent token in the Authorization header.`,
    },
    servers: [{ url: SITE_URL, description: "Floom" }],
    paths: {
      [`/api/apps/${slug}/run`]: {
        post: {
          operationId: `run_${slug.replace(/-/g, "_")}`,
          summary: `Run ${appName}`,
          description: `Submit a run of the ${appName} app. Returns immediately with an execution_id and view_token. Poll GET /api/runs/{execution_id} for the result.`,
          tags: [slug],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["inputs"],
                  properties: {
                    inputs: requestBodySchema,
                  },
                },
                example: { inputs: {} },
              },
            },
          },
          responses: {
            "200": {
              description: "Run queued successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      execution_id: {
                        type: "string",
                        format: "uuid",
                        description: "Unique ID for this run. Use to poll for results.",
                      },
                      view_token: {
                        type: "string",
                        description: "Opaque token granting read access to this specific run. Store client-side.",
                      },
                      status: {
                        type: "string",
                        enum: ["queued", "running", "succeeded", "failed", "timed_out"],
                        description: "Initial status. Poll /api/runs/{execution_id} until terminal.",
                      },
                      output: {
                        ...successResponseSchema,
                        description: "Final output when status is succeeded. Null while running.",
                        nullable: true,
                      },
                    },
                    required: ["execution_id", "status"],
                  },
                },
              },
            },
            "401": { description: "Missing or invalid authorization token" },
            "404": { description: "App not found" },
            "429": { description: "Rate limit exceeded" },
            "502": { description: "Sandbox error — the app threw an exception" },
          },
          security: [{ bearerAuth: [] }],
        },
      },
      "/api/runs/{execution_id}": {
        get: {
          operationId: "get_run",
          summary: "Poll run status",
          description:
            "Returns the current status and output of a run. Poll until status is one of: succeeded, failed, timed_out, cancelled.",
          tags: ["runs"],
          parameters: [
            {
              name: "execution_id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
              description: "The execution_id returned by POST /api/apps/{slug}/run",
            },
          ],
          responses: {
            "200": {
              description: "Run record",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      status: {
                        type: "string",
                        enum: [
                          "queued",
                          "running",
                          "succeeded",
                          "failed",
                          "timed_out",
                          "cancelled",
                        ],
                      },
                      inputs: { type: "object", nullable: true },
                      output: { type: "object", nullable: true },
                      error: { type: "string", nullable: true },
                      created_at: { type: "string", format: "date-time" },
                      completed_at: { type: "string", format: "date-time", nullable: true },
                    },
                    required: ["id", "status"],
                  },
                },
              },
            },
            "401": { description: "Missing or invalid token" },
            "404": { description: "Run not found" },
          },
          security: [{ bearerAuth: [] }, { viewToken: [] }],
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Floom agent token. Mint at https://floom.dev/tokens. Required for private apps; optional for public apps.",
        },
        viewToken: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description: 'Pass as "ViewToken <token>" — grants read access to a specific run.',
        },
      },
    },
    externalDocs: {
      description: "Full API documentation on Floom",
      url: runUrl,
    },
  };

  return new NextResponse(JSON.stringify(spec, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
