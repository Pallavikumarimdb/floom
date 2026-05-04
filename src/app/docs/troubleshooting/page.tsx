import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Troubleshooting",
  description: "Common issues and how to resolve them quickly.",
  alternates: { canonical: "https://floom.dev/docs/troubleshooting" },
  openGraph: {
    title: "Troubleshooting · Floom",
    description: "Common issues and how to resolve them quickly.",
    url: "https://floom.dev/docs/troubleshooting",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Troubleshooting · Floom",
    description: "Common issues and how to resolve them quickly.",
  },
};

const ISSUES = [
  {
    id: "app-not-in-status",
    symptom: "I deployed an app but it's not in floom status",
    why: "Your CLI is probably signed in under a different Floom account than when you deployed. Apps are tied to the account that deployed them, not to your machine — so if you've ever logged out and back in, or used a different email, those apps won't show up.",
    steps: [
      {
        code: "floom auth whoami",
        note: "This shows which email your CLI session is using right now.",
      },
    ],
    extra:
      "If the email is wrong, run floom auth logout then floom auth login and sign in with the original email. Your apps will reappear. If you're not sure which account deployed the app, look at the app's URL — the 8-character suffix (e.g. myapp-f7392ddf) matches the user ID of the account that created it.",
  },
  {
    id: "run-hangs",
    symptom: "My run hangs for 30+ seconds before output appears",
    why: "Floom v0.4 uses a single shared sandbox tier. When multiple runs arrive at once, they queue and execute one at a time. The queue is deliberate — it keeps runs from stepping on each other. Your run will complete; it's just waiting for the ones ahead of it to finish.",
    steps: [],
    extra:
      "Normal wait under typical load: under 5 seconds. Under heavy load: up to 5 minutes, after which the run is marked failed. Nothing to fix — this is working as designed. Parallel execution is planned for v0.5.",
  },
  {
    id: "composio-consent",
    symptom: "Connecting Gmail or Slack shows 'Composio' on the consent screen",
    why: 'When you click "Connect Gmail" on /connections, you\'ll see a Google sign-in screen that says "Composio wants access to your Google Account". This is expected. Floom uses Composio to handle OAuth for integrations — Composio is the registered app with Google, Slack, and other providers, so its name appears on the consent screen. Once you connect, Floom uses your credentials to call those services on your behalf.',
    steps: [],
    extra:
      "Not a bug. Floom is working toward direct OAuth registration with Gmail, Slack, and GitHub for v0.5 — those consent screens will show \"Floom\" instead of \"Composio\".",
  },
  {
    id: "composio-already-connected",
    symptom: "App says I need to connect Gmail but I already did",
    why: "Connections expire if the underlying OAuth token is revoked or the Composio session is invalidated. The /connections page shows the current status — if a toolkit shows as Expired or Disconnected, reconnect it and the next run will pick it up automatically.",
    steps: [
      {
        code: "floom.dev/connections",
        note: "Check that the toolkit shows Connected, not Expired.",
      },
    ],
    extra: "",
  },
  {
    id: "lost-output",
    symptom: "I lost my run output when I refreshed the page",
    why: "If you ran the app without signing in, your result is tied to a one-time view token that Floom stores in your browser's local storage. Clear your browsing data, switch to a different browser, use incognito mode, or open the page on another device — and the token is gone. Without the token, there's no way to get the result back.",
    steps: [],
    extra:
      "To keep your runs permanently, sign in before running. Signed-in users have full run history at any time, from any browser. For anonymous runs, copy the output before navigating away.",
  },
] as const;

export default function TroubleshootingPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Reference</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          Troubleshooting
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Something looks wrong? Here are the most common confusing states and how to get past them.
        </p>
      </div>

      <div className="mt-8 space-y-10">
        {ISSUES.map(({ id, symptom, why, steps, extra }) => (
          <div key={id} id={id} className="scroll-mt-[88px]">
            <h2 className="text-lg font-bold text-[#11110f]">{symptom}</h2>

            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                Why this happens
              </p>
              <p className="text-neutral-600">{why}</p>
            </div>

            {steps.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                  How to resolve
                </p>
                <div className="space-y-2">
                  {steps.map((step, i) => (
                    <div key={i}>
                      <code className="block rounded-md bg-[#f0ede6] border border-[#e0dbd0] px-3 py-2 font-mono text-sm text-[#2a2520]">
                        {step.code}
                      </code>
                      {step.note && (
                        <p className="mt-1 text-sm text-neutral-500">{step.note}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {extra && (
              <p className="mt-3 text-neutral-600">{extra}</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
