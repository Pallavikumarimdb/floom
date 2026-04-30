const PUBLIC_ANONYMOUS_RATE_LIMIT_ID = "anonymous";

export function getPublicRunRateLimitKey(appId: string) {
  return `public-run:${appId}:${PUBLIC_ANONYMOUS_RATE_LIMIT_ID}`;
}
