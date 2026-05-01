// TODO(v5-port): publicPermalinks — stub of floom@main/lib/publicPermalinks.ts
// Original has classifyPermalinkLoadError, getPermalinkLoadErrorMessage,
// buildPublicRunPath, PermalinkLoadOutcome type.

export type PermalinkLoadOutcome = 'not_found' | 'retryable' | 'private';

export function classifyPermalinkLoadError(err: unknown): PermalinkLoadOutcome {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status;
    if (status === 404) return 'not_found';
    if (status === 403 || status === 401) return 'private';
    if (status >= 500) return 'retryable';
  }
  return 'not_found';
}

export function getPermalinkLoadErrorMessage(_target: string): string {
  return 'This app is temporarily unavailable. Please try again in a moment.';
}

export function buildPublicRunPath(runId: string): string {
  return `/runs/${runId}`;
}
