import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TokensPage from "./TokensPage";
import { SITE_URL } from "@/lib/config/origin";

export const metadata: Metadata = {
  title: "Agent tokens",
  description: "Manage Floom agent tokens. Mint, copy, and revoke tokens used to publish apps from your agent or CLI.",
  alternates: { canonical: `${SITE_URL}/tokens` },
  // robots.ts already disallows /tokens — also set noindex here so the
  // metadata is consistent if a curl strips robots.txt context.
  robots: { index: false, follow: false },
};

export default async function Page() {
  // Server-side auth gate — emit a 307 redirect when no session, instead of
  // rendering the client shell + bouncing on hydration. Other auth gates on
  // this app (signup/signin/etc) all 307 cleanly; /tokens was the odd one
  // out per the audit. This also prevents the page shell from briefly
  // flashing for unauthenticated users.
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    redirect("/login?next=/tokens");
  }

  return <TokensPage />;
}
