import { redirect } from "next/navigation";

// /auth (bare, without callback suffix) is not a valid route.
// Auth routes are under /login. Redirect stale links.
export default function AuthPage() {
  redirect("/login");
}
