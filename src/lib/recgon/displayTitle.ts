// quick-260620-mav — pure display-fallback helper for compact UI surfaces.
//
// Picks the LLM-written compact label (shortSummary) when present, otherwise
// falls back to the full canonical title. Used by the week-calendar chips and
// the command-center decision rows. Dependency-free so it unit-tests trivially
// and can be imported anywhere (server or client) without side effects.
//
// NOTE: this only governs the VISIBLE compact label. The full title is still
// shown on the chip hover attribute and in the task detail panel — those read
// `title` directly and must NOT use this helper.

export function taskDisplayTitle(task: {
  shortSummary?: string | null;
  title: string;
}): string {
  return task.shortSummary?.trim() || task.title;
}
