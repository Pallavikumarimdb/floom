import { redirect } from "next/navigation";

// /connections → /integrations (308 permanent redirect)
export default function Page() {
  redirect("/integrations");
}
