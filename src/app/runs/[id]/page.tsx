import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/demo-app";

type ExecutionRow = {
  id: string;
  app_id: string;
};

type AppRow = {
  slug: string;
  public: boolean;
};

export default async function RunRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!hasSupabaseConfig()) {
    notFound();
  }

  const admin = createAdminClient();
  const { data: execution } = await admin
    .from("executions")
    .select("id, app_id")
    .eq("id", id)
    .maybeSingle<ExecutionRow>();

  if (!execution) {
    notFound();
  }

  const { data: app } = await admin
    .from("apps")
    .select("slug, public")
    .eq("id", execution.app_id)
    .maybeSingle<AppRow>();

  if (!app?.public) {
    notFound();
  }

  redirect(`/p/${app.slug}?run=${id}`);
}
