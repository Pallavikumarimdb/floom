import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Examples",
  description: "5 working Floom demo apps with run and source links: meeting action items, invoice calculator, UTM builder, CSV stats, multi-file Python.",
  alternates: { canonical: "https://floom.dev/docs/examples" },
};

const APPS = [
  {
    slug: "meeting-action-items",
    name: "Meeting action items",
    desc: "Paste a meeting transcript; get back a list of action items and a summary. Uses Gemini.",
    template: "meeting_action_items",
  },
  {
    slug: "invoice-calculator",
    name: "Invoice calculator",
    desc: "Enter line items and hourly rates; get a formatted invoice total with tax breakdown.",
    template: null,
  },
  {
    slug: "utm-url-builder",
    name: "UTM URL builder",
    desc: "Generate properly encoded UTM-tagged URLs from campaign parameters.",
    template: null,
  },
  {
    slug: "csv-stats",
    name: "CSV stats",
    desc: "Upload a CSV; get column types, row count, min/max, mean, and null counts.",
    template: "csv_stats",
  },
  {
    slug: "multi-file-python",
    name: "Multi-file Python",
    desc: "Starter template: multi-file Python app with helpers, shared logic, and requirements.txt.",
    template: "multi_file_python",
  },
] as const;

export default function ExamplesPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Reference</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          Examples
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Five working apps you can run now or use as a starting point.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        {APPS.map((app) => (
          <div key={app.slug} className="rounded-xl border border-[#ded8cc] bg-white p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-[#11110f]">{app.name}</p>
                <p className="mt-0.5 text-sm text-neutral-500">{app.desc}</p>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <Link
                  href={`/p/${app.slug}`}
                  className="rounded-md border border-[#ded8cc] px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-neutral-400 transition-colors whitespace-nowrap"
                >
                  Run app
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
