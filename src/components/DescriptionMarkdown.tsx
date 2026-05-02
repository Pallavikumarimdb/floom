'use client';
// Minimal markdown renderer for app descriptions: bold (**…**), inline
// code (`…`), and plain paragraphs. Not a full Markdown engine — full
// the patterns used by the description fallback in AppPermalinkPage and
// real-app descriptions stored in Supabase.

import { Fragment, type CSSProperties, type ReactNode } from 'react';

interface DescriptionMarkdownProps {
  description: string;
  testId?: string;
  style?: CSSProperties;
}

const BOLD_OR_CODE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function renderInline(text: string): ReactNode {
  const parts = text.split(BOLD_OR_CODE).filter((p) => p !== '');
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: '0.92em',
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: 4,
            padding: '1px 5px',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function DescriptionMarkdown({ description, testId, style }: DescriptionMarkdownProps) {
  const paragraphs = description.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return null;
  return (
    <div data-testid={testId} style={style}>
      {paragraphs.map((p, i) => (
        <p
          key={i}
          style={{
            margin: i === 0 ? 0 : '0.9em 0 0',
            whiteSpace: 'pre-wrap',
          }}
        >
          {renderInline(p)}
        </p>
      ))}
    </div>
  );
}
