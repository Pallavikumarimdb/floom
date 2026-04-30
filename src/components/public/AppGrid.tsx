'use client';
// TODO(v5-port): AppGrid — stub of floom@main/components/public/AppGrid.tsx
// Original renders HubApp[] as rich cards with thumbnail previews.
// This stub renders the same AppStripe layout for v0 compatibility.
// See docs/v5-port-stubs.md for full stub list.
import type { CSSProperties } from 'react';
import { AppStripe } from './AppStripe';

// Minimal HubApp type compatible with what LandingV17Page passes.
interface HubApp {
  slug: string;
  name: string;
  description: string;
  category?: string;
  runs_7d?: number;
}

interface AppGridProps {
  apps: HubApp[];
}

const GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: 16,
};

export function AppGrid({ apps }: AppGridProps) {
  if (apps.length === 0) return null;

  return (
    <div style={GRID_STYLE}>
      {apps.map((app) => (
        <AppStripe
          key={app.slug}
          slug={app.slug}
          name={app.name}
          description={app.description}
          category={app.category}
          variant="apps"
        />
      ))}
    </div>
  );
}
