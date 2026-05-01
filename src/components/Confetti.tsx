'use client';
// TODO(v5-port): Confetti — stub of floom@main/components/Confetti.tsx
// Original fires a canvas-based confetti burst on first publish.
// This stub is a no-op.
// See docs/v5-port-stubs.md for full stub list.

interface ConfettiProps {
  fire?: boolean;
  onDone?: () => void;
}

export function Confetti({ fire, onDone }: ConfettiProps) {
  if (fire && onDone) {
    // Let the parent know we're done immediately (no animation).
    setTimeout(onDone, 0);
  }
  return null;
}
