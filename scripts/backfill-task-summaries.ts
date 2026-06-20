// quick-260620-mav — ONE-TIME, idempotent backfill of compact-UI labels.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ THE ORCHESTRATOR RUNS THIS — NOT THE EXECUTOR.                            │
// │ Run AFTER the 20260620_agent_tasks_short_summary.sql migration is applied:│
// │     npx tsx scripts/backfill-task-summaries.ts                            │
// └──────────────────────────────────────────────────────────────────────────┘
//
// What it does: fills `short_summary` for every agent_tasks row where it is
// currently NULL, using the SAME batched, fail-soft generateTaskSummaries util
// the live creation paths use.
//
// Idempotent + safe to re-run:
//   - Default: only targets rows WHERE short_summary IS NULL, so a second run
//     fills only the still-empty rows (e.g. rows whose LLM call returned null
//     last time can be retried by re-running).
//   - BACKFILL_FORCE_ALL=1: re-summarizes EVERY row (overwrites existing
//     short_summary). Use after changing the summary prompt. Rows whose LLM
//     call returns null keep their current value (never nulled).
//   - No deletes. No title/description edits. short_summary is the only column
//     written, via the fail-soft setTaskShortSummary writer.
//
// Language: resolved per row from the row's CREATOR (created_by ->
// getUserById(...).language). created_by is NULL for brain-minted tasks →
// default 'en'. A chunk may mix languages, so each chunk is grouped BY language
// and generateTaskSummaries is called once per language-group (still batched),
// preserving the id<->summary alignment within each group.

import { supabase } from '../src/lib/supabase';
import { getUserById } from '../src/lib/userStorage';
import { generateTaskSummaries } from '../src/lib/recgon/taskSummaries';
import { setTaskShortSummary } from '../src/lib/recgon/storage';
import { logger } from '../src/lib/logger';
import type { OutputLanguage } from '../src/lib/prompts';

const CHUNK_SIZE = 30;

type NullSummaryRow = {
  id: string;
  title: string;
  description: string | null;
  created_by: string | null;
};

// Cache creator → language so we never look the same user up twice.
const languageCache = new Map<string, OutputLanguage>();

async function resolveCreatorLanguage(createdBy: string | null): Promise<OutputLanguage> {
  if (!createdBy) return 'en'; // brain-minted tasks have no creator
  const cached = languageCache.get(createdBy);
  if (cached) return cached;
  let lang: OutputLanguage = 'en';
  try {
    const user = await getUserById(createdBy);
    lang = user?.language === 'tr' ? 'tr' : 'en';
  } catch {
    lang = 'en';
  }
  languageCache.set(createdBy, lang);
  return lang;
}

async function fetchNullSummaryChunk(): Promise<NullSummaryRow[]> {
  const { data, error } = await supabase
    .from('agent_tasks')
    .select('id, title, description, created_by')
    .is('short_summary', null)
    .order('created_at', { ascending: true })
    .limit(CHUNK_SIZE);
  if (error) throw new Error(`fetch null-summary chunk failed: ${error.message}`);
  return (data ?? []) as NullSummaryRow[];
}

async function processChunk(rows: NullSummaryRow[]): Promise<{ filled: number; skipped: number }> {
  // Group the chunk by language so each generateTaskSummaries call is a single
  // batched, language-consistent request.
  const byLanguage = new Map<OutputLanguage, NullSummaryRow[]>();
  for (const row of rows) {
    const lang = await resolveCreatorLanguage(row.created_by);
    const bucket = byLanguage.get(lang) ?? [];
    bucket.push(row);
    byLanguage.set(lang, bucket);
  }

  let filled = 0;
  let skipped = 0;

  for (const [language, group] of byLanguage) {
    const summaries = await generateTaskSummaries(
      group.map((r) => ({ title: r.title, description: r.description ?? '' })),
      { language },
    );
    for (let i = 0; i < group.length; i++) {
      const summary = summaries[i];
      if (summary) {
        await setTaskShortSummary(group[i].id, summary);
        filled++;
      } else {
        // Leave NULL — a future re-run can retry this row (idempotent).
        skipped++;
      }
    }
  }

  return { filled, skipped };
}

async function main(): Promise<void> {
  logger.info('backfill-task-summaries: starting (idempotent, NULL-only)');
  let totalProcessed = 0;
  let totalFilled = 0;
  let totalSkipped = 0;
  let chunkNo = 0;

  // Because we only fill rows that came back null and we leave genuine nulls
  // (LLM returned nothing) in place, we must NOT loop forever on a chunk that
  // is all-skips. We page by tracking how many rows we've already seen with an
  // OFFSET-free cursor: once a fetched chunk yields zero NEW fills AND we've
  // already attempted every currently-null row once, we stop. Simplest robust
  // approach: collect all currently-null ids up front, then chunk over them.
  // BACKFILL_FORCE_ALL=1 re-summarizes EVERY row (overwriting existing
  // short_summary) — used after a prompt change. Default (unset) is the
  // idempotent NULL-only fill. Rows whose LLM call returns null keep their
  // current value in force mode (never nulled), so a partial run is safe.
  const forceAll = process.env.BACKFILL_FORCE_ALL === '1';
  let enumQuery = supabase
    .from('agent_tasks')
    .select('id, title, description, created_by')
    .order('created_at', { ascending: true });
  if (!forceAll) enumQuery = enumQuery.is('short_summary', null);
  const { data: allRows, error } = await enumQuery;
  if (error) throw new Error(`enumerate rows failed: ${error.message}`);

  const rows = (allRows ?? []) as NullSummaryRow[];
  logger.info('backfill-task-summaries: rows to process', {
    count: rows.length,
    mode: forceAll ? 'force-all (regenerate)' : 'null-only (idempotent)',
  });

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    chunkNo++;
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { filled, skipped } = await processChunk(chunk);
    totalProcessed += chunk.length;
    totalFilled += filled;
    totalSkipped += skipped;
    logger.info('backfill-task-summaries: chunk done', {
      chunk: chunkNo,
      processed: chunk.length,
      filled,
      skipped,
    });
  }

  logger.info('backfill-task-summaries: complete', {
    totalProcessed,
    totalFilled,
    totalSkipped,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('backfill-task-summaries: fatal', {
      err: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });

// `fetchNullSummaryChunk` is retained for callers that prefer streaming chunks
// over the up-front enumeration; the main() path uses the enumerate-then-chunk
// strategy because it guarantees termination on all-skip re-runs.
void fetchNullSummaryChunk;
