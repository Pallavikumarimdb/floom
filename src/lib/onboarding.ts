// Original has localStorage-based first-run confetti/celebration state,
// sample prefill logic, and publish flag consumer.

export function consumeJustPublished(_slug: string): boolean {
  if (typeof window === 'undefined') return false;
  const key = `floom:just-published:${_slug}`;
  if (localStorage.getItem(key)) {
    localStorage.removeItem(key);
    return true;
  }
  return false;
}

export function hasConfettiShown(_slug: string): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(`floom:confetti-shown:${_slug}`);
}

export function markConfettiShown(_slug: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`floom:confetti-shown:${_slug}`, '1');
}

export function samplePrefill(input: { name: string; type?: string }): unknown {
  const lower = input.name.toLowerCase();
  if (lower.includes('url')) return 'https://example.com';
  if (lower.includes('email')) return 'user@example.com';
  if (lower.includes('text') || lower.includes('prompt') || lower.includes('query')) {
    return 'Enter your text here...';
  }
  return null;
}
