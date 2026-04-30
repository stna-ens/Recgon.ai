/**
 * Strip lightweight markdown formatting from LLM-authored strings so users
 * don't see stray `**`, `__`, `*`, `_`, or backticks rendered as text. We do
 * not render markdown — we just clean it.
 *
 * Also strips legacy task-description caveats baked at brain-time that may now
 * be stale (e.g. "(GA4 not connected — baseline unavailable.)" — connectivity
 * is re-checked at verify time, so the cached caveat is misleading).
 */
export function stripMd(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1')
    .replace(/(?<![_\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    // Drop the stale GA4 caveat (em-dash and ASCII hyphen variants).
    .replace(/\n*\(GA4 not connected\s*[—-]\s*baseline unavailable\.\)/g, '')
    .trim();
}
