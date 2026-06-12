'use client';

import { useEffect, useState } from 'react';

// Linear-style list keyboard navigation: j/k (or arrow keys) move the
// active row, Enter opens it. Disabled while the user is typing in any
// form control or when `enabled` is false (e.g. a panel is open).
//
// Returns [activeIdx, setActiveIdx]; -1 = nothing focused (until the
// first j/k press).

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function useListShortcuts(options: {
  count: number;
  enabled: boolean;
  onOpen: (index: number) => void;
}): [number, (idx: number) => void] {
  const { count, enabled, onOpen } = options;
  const [activeIdx, setActiveIdx] = useState(-1);

  // Clamp when the list shrinks (filter change).
  useEffect(() => {
    setActiveIdx((i) => (count === 0 ? -1 : Math.min(i, count - 1)));
  }, [count]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (count === 0) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, count - 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        setActiveIdx((i) => {
          if (i >= 0) {
            e.preventDefault();
            onOpen(i);
          }
          return i;
        });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, count, onOpen]);

  return [activeIdx, setActiveIdx];
}
