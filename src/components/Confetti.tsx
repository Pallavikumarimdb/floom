'use client';
// Original fires a canvas-based confetti burst on first publish.
// This stub is a no-op.

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
