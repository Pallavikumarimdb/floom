const COMPOSIO_API_BASE = "https://backend.composio.dev";

// In-memory cache: provider slug -> auth_config_id, with TTL of 1 hour
const authConfigCache = new Map<string, { id: string; expiresAt: number }>();

export async function getAuthConfigIdForProvider(
  provider: string,
  apiKey: string
): Promise<string | null> {
  const now = Date.now();
  const cached = authConfigCache.get(provider);
  if (cached && cached.expiresAt > now) {
    return cached.id;
  }

  try {
    const response = await fetch(
      `${COMPOSIO_API_BASE}/api/v3/auth_configs?toolkit_slug=${encodeURIComponent(provider)}&limit=1`,
      {
        headers: { "x-api-key": apiKey },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      items?: Array<{ id: string; is_composio_managed?: boolean; status?: string; toolkit?: { slug?: string } }>;
    };

    // The Composio API may ignore toolkit_slug filter and return configs for other toolkits.
    // Validate that the returned config's toolkit slug matches the requested provider.
    const item = data.items?.find(
      (entry) =>
        entry.toolkit?.slug === provider &&
        entry.is_composio_managed !== false &&
        entry.status !== "DISABLED"
    ) ?? data.items?.find((entry) => entry.toolkit?.slug === provider) ?? null;

    if (!item || !item.id) {
      return null;
    }

    authConfigCache.set(provider, {
      id: item.id,
      expiresAt: now + 60 * 60 * 1000, // 1 hour TTL
    });

    return item.id;
  } catch {
    return null;
  }
}

type ToolkitItem = {
  name: string;
  slug: string;
  auth_schemes: string[];
  composio_managed_auth_schemes: string[];
  no_auth: boolean;
  meta: {
    description: string;
    logo: string;
    categories: Array<{ id: string; name: string }>;
  };
};

export type ToolkitWithReadiness = ToolkitItem & { coming_soon: boolean };

let toolkitCache: { items: ToolkitItem[]; expiresAt: number } | null = null;

async function fetchAllToolkits(apiKey: string): Promise<ToolkitItem[]> {
  const now = Date.now();
  if (toolkitCache && toolkitCache.expiresAt > now) {
    return toolkitCache.items;
  }

  try {
    // Fetch only toolkits that have composio-managed auth (the ones users can connect via OAuth)
    const response = await fetch(
      `${COMPOSIO_API_BASE}/api/v3/toolkits?limit=100`,
      {
        headers: { "x-api-key": apiKey },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as { items?: ToolkitItem[] };
    const items = (data.items ?? []).filter(
      (item) => !item.no_auth && item.composio_managed_auth_schemes.length > 0
    );

    toolkitCache = {
      items,
      expiresAt: now + 60 * 60 * 1000, // 1 hour TTL
    };

    return items;
  } catch {
    return [];
  }
}

export async function getAvailableToolkits(apiKey: string): Promise<ToolkitItem[]> {
  return fetchAllToolkits(apiKey);
}

// Cache: set of provisioned toolkit slugs with 1 hour TTL
let provisionedSlugsCache: { slugs: Set<string>; expiresAt: number } | null = null;

async function fetchProvisionedSlugs(apiKey: string): Promise<Set<string>> {
  const now = Date.now();
  if (provisionedSlugsCache && provisionedSlugsCache.expiresAt > now) {
    return provisionedSlugsCache.slugs;
  }

  try {
    // Fetch all provisioned auth configs in one call (no toolkit_slug filter)
    const response = await fetch(
      `${COMPOSIO_API_BASE}/api/v3/auth_configs?limit=100`,
      {
        headers: { "x-api-key": apiKey },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return new Set();
    }

    const data = await response.json() as {
      items?: Array<{ status?: string; toolkit?: { slug?: string } }>;
    };

    const slugs = new Set(
      (data.items ?? [])
        .filter((entry) => entry.status !== "DISABLED" && entry.toolkit?.slug)
        .map((entry) => entry.toolkit!.slug as string)
    );

    provisionedSlugsCache = {
      slugs,
      expiresAt: now + 60 * 60 * 1000, // 1 hour TTL
    };

    return slugs;
  } catch {
    return new Set();
  }
}

/**
 * Returns the full toolkit catalog tagged with `coming_soon: true` for
 * toolkits that do not yet have a provisioned auth config in this workspace.
 * UI should disable the "Connect" button when `coming_soon` is true.
 */
export async function getAvailableToolkitsWithReadiness(
  apiKey: string
): Promise<ToolkitWithReadiness[]> {
  const [toolkits, provisionedSlugs] = await Promise.all([
    fetchAllToolkits(apiKey),
    fetchProvisionedSlugs(apiKey),
  ]);

  // If we couldn't fetch provisioned slugs at all, fall back to showing all
  // toolkits as ready rather than marking everything coming_soon.
  const hasSlugs = provisionedSlugs.size > 0;

  return toolkits.map((toolkit) => ({
    ...toolkit,
    coming_soon: hasSlugs ? !provisionedSlugs.has(toolkit.slug) : false,
  }));
}
