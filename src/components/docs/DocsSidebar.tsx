"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const DOCS_NAV = [
  {
    group: "Get started",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/quickstart", label: "Quick start" },
    ],
  },
  {
    group: "Build",
    items: [
      { href: "/docs/manifest", label: "Manifest reference" },
      { href: "/docs/schemas", label: "Input / output schemas" },
      { href: "/docs/secrets", label: "Secrets" },
      { href: "/docs/auth", label: "Authentication" },
    ],
  },
  {
    group: "Run",
    items: [
      { href: "/docs/api", label: "REST API" },
      { href: "/docs/mcp", label: "MCP for AI agents" },
      { href: "/docs/ci", label: "CI / automation" },
    ],
  },
  {
    group: "Connections",
    items: [
      { href: "/docs/connections", label: "Connections" },
      { href: "/docs/integrations", label: "Integrations" },
    ],
  },
  {
    group: "Reference",
    items: [
      { href: "/docs/examples", label: "Examples" },
      { href: "/docs/limits", label: "Limits" },
      { href: "/docs/faq", label: "FAQ" },
      { href: "/docs/troubleshooting", label: "Troubleshooting" },
    ],
  },
] as const;

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden lg:block w-52 flex-shrink-0 self-start sticky top-[64px]"
      aria-label="Docs navigation"
    >
      <div className="max-h-[calc(100vh-80px)] overflow-y-auto">
        <nav>
          {DOCS_NAV.map((section) => (
            <div key={section.group} className="mb-5">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                {section.group}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block text-sm px-2 py-1 transition-colors rounded ${
                          active
                            ? "text-[#047857] font-semibold bg-emerald-50"
                            : "text-neutral-500 hover:text-[#11110f] hover:bg-[#f5f4ed]"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}

type NavItem = { readonly href: string; readonly label: string };

export function DocsMobileNav() {
  const pathname = usePathname();
  const allItems: NavItem[] = DOCS_NAV.flatMap((s) => [...s.items] as NavItem[]);
  const current = allItems.find((i) => i.href === pathname);

  return (
    <details className="lg:hidden sticky top-[56px] z-10 bg-[#faf9f5] border-b border-[#e0dbd0] px-4 py-2">
      <summary className="text-sm font-semibold cursor-pointer text-[#11110f]">
        {current ? current.label : "Docs"}
      </summary>
      <nav className="mt-2 pb-2">
        {DOCS_NAV.map((section) => (
          <div key={section.group} className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
              {section.group}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block text-sm py-1 px-2 rounded transition-colors ${
                      pathname === item.href
                        ? "text-[#047857] font-semibold"
                        : "text-neutral-600 hover:text-[#047857]"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </details>
  );
}
