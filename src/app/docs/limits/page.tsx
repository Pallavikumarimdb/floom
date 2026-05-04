import type { Metadata } from "next";
import Link from "next/link";
import { IC } from "@/components/docs/DocsPrimitives";

export const metadata: Metadata = {
  title: "Limits",
  description: "Floom limits: sandbox timeout, rate limits, bundle size caps, concurrent runs.",
  alternates: { canonical: "https://floom.dev/docs/limits" },
};

const LIMITS = [
  ["Sync run cap", "290 seconds (Vercel Pro 300s ceiling, 10s response buffer)"],
  ["Anonymous public rate limit", "20 runs / caller / 60s"],
  ["Per-app public rate limit", "100 runs / 60s"],
  ["Per-app E2B quota", "30 min / day"],
  ["Per-owner E2B quota", "2 hours / day across all apps"],
  ["Bundle compressed size", "5 MB"],
  ["Bundle unpacked size", "25 MB"],
  ["Single file size", "10 MB"],
  ["File count per bundle", "500"],
  ["Connections proxy rate limit", "60 calls / min / token"],
  ["Max concurrent runs (default)", "10"],
];

export default function LimitsPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Reference</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          Limits
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Current limits during alpha. These will increase as the platform matures.
        </p>
      </div>

      <div id="table" className="mt-8 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[#ded8cc]">
              <th className="text-left py-2 pr-6 font-semibold text-[#11110f]">Limit</th>
              <th className="text-left py-2 font-semibold text-[#11110f]">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0ede6]">
            {LIMITS.map(([label, value]) => (
              <tr key={label}>
                <td className="py-2 pr-6 text-neutral-600">{label}</td>
                <td className="py-2 font-mono text-[#2a2520]">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 space-y-3 text-sm text-neutral-500">
        <p>
          Runs exceeding the 290-second cap return <IC>status: timed_out</IC>. For longer jobs, use the async pattern; see <Link href="/docs/api#async-runs" className="underline">async runs</Link>.
        </p>
        <p>
          Bundle size includes all files in the directory minus any paths in <IC>bundle_exclude</IC>. Large fixtures or datasets should be excluded or fetched at run time.
        </p>
      </div>
    </>
  );
}
