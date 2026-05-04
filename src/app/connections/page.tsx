import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConnectionsPage from "./ConnectionsPage";
import { SITE_URL } from "@/lib/config/origin";

export const metadata: Metadata = {
  title: "Connections",
  description: "Connect external services like Gmail and Slack to Floom so your agents can call their tools.",
  alternates: { canonical: `${SITE_URL}/connections` },
  robots: { index: false, follow: false },
};

export default async function Page() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    redirect("/login?next=/connections");
  }

  return <ConnectionsPage />;
}
