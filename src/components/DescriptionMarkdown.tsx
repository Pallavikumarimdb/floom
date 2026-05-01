'use client';
// TODO(v5-port): DescriptionMarkdown — stub of floom@main/components/DescriptionMarkdown.tsx
// Original renders markdown with syntax highlighting, code blocks, and
// inline code with copyable snippets. This stub renders plain text.
// See docs/v5-port-stubs.md for full stub list.

import type { CSSProperties } from 'react';

interface DescriptionMarkdownProps {
  description: string;
  testId?: string;
  style?: CSSProperties;
}

export function DescriptionMarkdown({ description, testId, style }: DescriptionMarkdownProps) {
  return (
    <p data-testid={testId} style={{ ...style, whiteSpace: 'pre-wrap' }}>
      {description}
    </p>
  );
}
