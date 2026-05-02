// Original has per-slug prefill text for the 3 launch demos.

const LAUNCH_DEMO_EXAMPLES: Record<string, Record<string, string>> = {
  'meeting-action-items': {
    transcript: 'Action: Sarah sends launch notes by Friday\nMike owns beta checklist tomorrow\nPriya will run demo QA before launch',
  },
};

export function getLaunchDemoExampleTextInputs(
  slug: string,
): Record<string, string> | null {
  return LAUNCH_DEMO_EXAMPLES[slug] ?? null;
}
