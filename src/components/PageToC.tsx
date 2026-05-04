"use client";

export interface TocItem {
  id: string;
  label: string;
}

export function PageToC({ items }: { items: TocItem[] }) {
  return (
    <aside
      className="hidden lg:block w-52 flex-shrink-0 self-start sticky top-[64px]"
      aria-label="Page contents"
    >
      <div className="max-h-[calc(100vh-80px)] overflow-y-auto">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          On this page
        </p>
        <nav>
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="block text-sm px-2 py-1 rounded text-neutral-500 hover:text-[#11110f] hover:bg-[#f5f4ed] transition-colors"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
