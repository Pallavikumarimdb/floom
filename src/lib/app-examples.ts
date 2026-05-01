// Per-slug example inputs surfaced as the "Try with example" chip on /p/<slug>.
// Floom v0 ships a single canonical demo: meeting-action-items.

const SAMPLE_NOTES = `Standup, Tuesday morning.

Sarah: I shipped the ingestion fix last night. Need to write the migration docs by EOW so support can use them.
Marcus: Customer hit the 500 error on /reports yesterday. Going to dig in this morning, expect a fix by lunch.
Priya: We need to decide on the Q3 OKR draft. Can we get a 30 min slot on Thursday?
Sarah: Reminder — we still owe legal the SOC 2 questionnaire response. Due end of next week.
Marcus: I can take that one.`;

const LAUNCH_DEMO_EXAMPLES: Record<string, Record<string, string>> = {
  'meeting-action-items': {
    notes: SAMPLE_NOTES,
  },
};

export function getLaunchDemoExampleTextInputs(
  slug: string,
): Record<string, string> | null {
  return LAUNCH_DEMO_EXAMPLES[slug] ?? null;
}
