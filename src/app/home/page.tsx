import { redirect } from "next/navigation";

// /home is referenced by the CLI's post-setup flow. Redirect to root.
export default function HomePage() {
  redirect("/");
}
