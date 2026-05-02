// Original wraps the hub API with React Query + auth token injection.
// AppPermalinkPage v5 port uses direct fetch() calls instead, but ApiError
// is still referenced for instanceof checks in catch blocks.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// These functions are not called in the v5 port (replaced by fetch()),
// but are kept for type-compatibility with any future stub imports.
export async function getApp(): Promise<never> {
  throw new ApiError('Use fetch() directly — api/client is stubbed', 501);
}

export async function getAppReviews(): Promise<{ summary: { count: number; avg: number } }> {
  return { summary: { count: 0, avg: 0 } };
}

export async function getRun(): Promise<never> {
  throw new ApiError('Use fetch() directly — api/client is stubbed', 501);
}

export async function shareRun(): Promise<void> {
  // no-op stub
}
