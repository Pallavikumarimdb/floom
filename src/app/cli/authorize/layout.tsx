import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Authorize CLI",
};

export default function CliAuthorizeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
