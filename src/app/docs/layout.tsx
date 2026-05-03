import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { FloomFooter } from "@/components/FloomFooter";
import { DocsSidebar, DocsMobileNav } from "@/components/docs/DocsSidebar";
import { CommandPalette } from "@/components/docs/CommandPalette";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="min-h-screen overflow-x-hidden bg-[#faf9f5] text-[#11110f]">
      <SiteHeader />
      <CommandPalette />

      {/* Mobile nav */}
      <DocsMobileNav />

      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="flex gap-14">
          <DocsSidebar />
          <article className="min-w-0 flex-1">
            {children}
          </article>
        </div>
      </div>

      <div className="border-t border-[#ded8cc] bg-[#faf9f5]">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <p className="text-xs text-neutral-400">
            Last updated: 2026-05-04 · Floom v0.3
          </p>
        </div>
      </div>

      <FloomFooter />
    </main>
  );
}
