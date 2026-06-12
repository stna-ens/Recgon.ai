'use client';

import { useEffect, useState } from 'react';

// Lazily fetches the "Why you" sentence for a task from
// /api/recgon/tasks/[id] when a detail surface opens.
//
// The server-side privacy filter on that route gates which viewers receive
// `whyYouSentence` (assignee + team owner only) and never serializes the raw
// assignment_reasoning JSONB — so this is safe to call for any viewer:
// non-authorized viewers simply get a response without the field and the
// caller's block stays hidden.
//
// Results are cached per task id for the lifetime of the component, so
// re-opening the same task doesn't refetch.
export function useWhyYou(taskId: string | null | undefined): string | undefined {
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!taskId || map[taskId] !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/recgon/tasks/${taskId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const sentence: string | undefined = data?.task?.whyYouSentence;
        if (!cancelled && typeof sentence === 'string' && sentence.length > 0) {
          setMap((prev) => ({ ...prev, [taskId]: sentence }));
        }
      } catch {
        /* swallowed — the block stays hidden on fetch error */
      }
    })();
    return () => { cancelled = true; };
  }, [taskId, map]);

  return taskId ? map[taskId] : undefined;
}
