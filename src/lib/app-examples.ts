// TODO(v5-port): app-examples — stub of floom@main/lib/app-examples.ts
// Original has per-slug prefill text for the 3 launch demos.

const LAUNCH_DEMO_EXAMPLES: Record<string, Record<string, string>> = {
  'competitor-lens': {
    your_url: 'https://stripe.com',
    competitor_url: 'https://adyen.com',
  },
  'ai-readiness-audit': {
    url: 'https://floom.dev',
  },
  'pitch-coach': {
    pitch: 'We make AI tools for developers. Fast, cheap, no lock-in.',
  },
};

export function getLaunchDemoExampleTextInputs(
  slug: string,
): Record<string, string> | null {
  return LAUNCH_DEMO_EXAMPLES[slug] ?? null;
}
