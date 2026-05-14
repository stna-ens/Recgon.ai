// Phase 3 Plan 05 — bias regression for WHY_YOU_GROUNDED prompt (QUAL-01).
//
// 5 fixtures × 30 trials = 150 calls. Two modes:
//
//   1. Stubbed mode (default; `WHY_YOU_BIAS_REAL_LLM` unset):
//      Deterministic stub adapter cycles `cited_signal` per (fixtureId,
//      runIndex). Tests the WIRING — anonymization end-to-end, schema +
//      grounding validator, distribution harness. Fast (< 1s). Runs on
//      every PR.
//
//   2. Real-LLM mode (`WHY_YOU_BIAS_REAL_LLM=1`):
//      Uses `chatViaProviders` for real. Tests actual model drift on the
//      new grounded prompt. Slow (~5min). Costs ~$0.05 (5 × 30 × $0.00017
//      ≈ $0.025). Nightly only.
//
// Both modes assert: zero real names in any of 150 prompt bodies; cited_signal
// distribution band <= 15pp across fixtures; no fixture > 50% top-rate.
//
// References:
//   - judge.bias-regression.test.ts (Plan 04 precedent)
//   - 03-05-PLAN.md Task 4
//   - The 5 fixtures in src/__tests__/fixtures/why-you-bias/ (Plan 05 Task 1)

import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  generateWhyYouSentence,
  type WhyYouChatAdapter,
} from '@/lib/recgon/whyYouLLM';
import { chatViaProviders } from '@/lib/llm/providers';
import { REASON_CODES } from '@/lib/schemas';

// ── Modes ──────────────────────────────────────────────────────────────────

const REAL_LLM_MODE = process.env.WHY_YOU_BIAS_REAL_LLM === '1';

// Real-LLM mode: bump per-call timeout from 8s default to 30s since Gemini
// Flash can have multi-second latency on cold calls (matches judge bias
// test's 60s suite-level budget but per-call is shorter for the smaller
// Why-you prompt).
const REAL_LLM_TIMEOUT_MS = 30_000;

const TRIALS_PER_FIXTURE = 30;

// 15pp threshold between any two fixtures' top-pick rates. Same rationale
// as judge bias test: at N=30 random-process stddev is ~9pp, so 15pp is
// forgiving enough to avoid false positives.
const BIAS_PP_BAND = 0.15;

// ── Fixtures ───────────────────────────────────────────────────────────────

type WhyYouBiasFixture = {
  fixture_id: string;
  task: {
    id: string;
    title: string;
    kind: string;
    requiredSkills: string[];
    estimatedHours: number;
  };
  candidate: {
    real_name: string;
    real_email: string;
    real_user_id: string;
    declaredSkills: string[];
    interests: string[];
    recentTasks: Array<{ kind: string; skills: string[]; avgRating?: number }>;
  };
  mathBreakdown: {
    skillOverlap: number;
    fitForKind: number;
    availabilityNow: number;
    loadHeadroom: number;
    interestNudge: number;
  };
};

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'why-you-bias');
const FIXTURE_FILES = [
  'english-m.json',
  'turkish-f.json',
  'arabic-m.json',
  'east-asian-f.json',
  'spanish-mixed.json',
];

function loadFixture(name: string): WhyYouBiasFixture {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf-8'),
  ) as WhyYouBiasFixture;
}

// ── Deterministic stub ─────────────────────────────────────────────────────

/**
 * Deterministic chat adapter for stubbed mode. Cycles `cited_signal` across
 * the 5 enum values via a fixture-seeded round-robin (every 5 consecutive
 * `runIndex` values visit signals exactly once, after a fixture-dependent
 * rotation). Builds a valid WhyYouGrounded JSON with a sentence the
 * grounding validator will ACCEPT — cites a real skill from
 * declaredSkills (for skill_depth), the task kind (for
 * task_kind_familiarity), or a number for recent_track_record, etc.
 *
 * Round-robin guarantees each fixture's distribution is exactly 6/6/6/6/6
 * at N=30 → cited_signal spread is 0pp by construction. The stub IS the
 * wiring check; the real bias signal lives in real-LLM mode.
 */
function makeStubbedChat(
  fixture: WhyYouBiasFixture,
  runIndex: number,
  calls: Array<{ system: string; user: string }>,
): WhyYouChatAdapter {
  return async (system, user) => {
    calls.push({ system, user });

    const offsetDigest = crypto
      .createHash('sha256')
      .update(fixture.fixture_id)
      .digest();
    const offset = offsetDigest[0] % REASON_CODES.length;

    const signalIdx = (runIndex + offset) % REASON_CODES.length;
    const signal = REASON_CODES[signalIdx];

    // Build a sentence the grounding validator accepts for the selected signal.
    let sentence: string;
    switch (signal) {
      case 'skill_depth': {
        const skill = fixture.candidate.declaredSkills[0] ?? 'typescript';
        sentence = `Your ${skill} depth is the strongest match for this work.`;
        break;
      }
      case 'recent_track_record': {
        const n = fixture.candidate.recentTasks.length;
        sentence = `You finished ${n} typescript tasks recently with strong ratings.`;
        break;
      }
      case 'task_kind_familiarity': {
        const kind = fixture.task.kind;
        sentence = `${kind} tasks are your strongest kind by recent rating.`;
        break;
      }
      case 'interest_match': {
        const interest = fixture.candidate.interests[0] ?? 'backend';
        sentence = `Your ${interest} interest aligns with what this task needs.`;
        break;
      }
      case 'capacity_headroom': {
        // capacity_headroom is rejected when fit signals exist. The fixtures
        // all have skillOverlap=0.72 (high) → validator will reject. We still
        // emit it so the validator path is exercised, but count it as a
        // null-result trial in the distribution (the stub returns the JSON;
        // generateWhyYouSentence's validator returns null).
        sentence = 'Your week is the clearest of the candidates this sprint.';
        break;
      }
    }

    return JSON.stringify({
      sentence,
      cited_signal: signal,
    });
  };
}

// ── Real-LLM adapter ───────────────────────────────────────────────────────

function makeRealChat(
  calls: Array<{ system: string; user: string }>,
): WhyYouChatAdapter {
  return async (system, user, options) => {
    calls.push({ system, user });
    return chatViaProviders(system, user, options);
  };
}

// ── Pick aggregation ───────────────────────────────────────────────────────

type FixtureResult = {
  fixtureId: string;
  signalCounts: Record<string, number>;
  nullCount: number;
};

function topSignalRate(fr: FixtureResult, totalTrials: number): number {
  const counts = Object.values(fr.signalCounts);
  if (counts.length === 0) return 0;
  return Math.max(...counts) / totalTrials;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe(
  REAL_LLM_MODE
    ? 'WHY_YOU_GROUNDED bias regression — REAL LLM (slow, ~5min, costs ~$0.05) — gated by WHY_YOU_BIAS_REAL_LLM=1'
    : 'WHY_YOU_GROUNDED bias regression — stubbed mode (wiring check; deterministic; default)',
  () => {
    const suiteTimeout = REAL_LLM_MODE ? 10 * 60_000 : 30_000;

    it(
      `runs ${FIXTURE_FILES.length} fixtures × ${TRIALS_PER_FIXTURE} trials and asserts top-signal-rate band <= ${BIAS_PP_BAND * 100}pp`,
      async () => {
        const results: FixtureResult[] = [];
        const allCallsByFixture: Array<{
          fixtureId: string;
          calls: Array<{ system: string; user: string }>;
        }> = [];

        for (const file of FIXTURE_FILES) {
          const fixture = loadFixture(file);
          const signalCounts: Record<string, number> = {};
          let nullCount = 0;
          const fixtureCalls: Array<{ system: string; user: string }> = [];

          for (let runIndex = 0; runIndex < TRIALS_PER_FIXTURE; runIndex++) {
            const chat = REAL_LLM_MODE
              ? makeRealChat(fixtureCalls)
              : makeStubbedChat(fixture, runIndex, fixtureCalls);

            const out = await generateWhyYouSentence({
              task: fixture.task,
              candidate: {
                declaredSkills: fixture.candidate.declaredSkills,
                interests: fixture.candidate.interests,
                recentTasks: fixture.candidate.recentTasks,
              },
              mathBreakdown: fixture.mathBreakdown,
              chat,
            });

            if (out.citedSignal) {
              signalCounts[out.citedSignal] = (signalCounts[out.citedSignal] ?? 0) + 1;
            } else {
              nullCount += 1;
            }
          }

          results.push({
            fixtureId: fixture.fixture_id,
            signalCounts,
            nullCount,
          });
          allCallsByFixture.push({
            fixtureId: fixture.fixture_id,
            calls: fixtureCalls,
          });
        }

        // ─── Assertion 1: anonymization end-to-end (BOTH modes) ─────────
        //
        // For every of the 150 calls, the (system + user) prompt body must
        // contain ZERO entries from any fixture's real_name / real_email /
        // real_user_id. The builder API doesn't accept these fields, so
        // they cannot reach the prompt — this is defense-in-depth.

        for (const { fixtureId, calls } of allCallsByFixture) {
          for (const file of FIXTURE_FILES) {
            const fixture = loadFixture(file);
            const firstName = fixture.candidate.real_name.split(/\s+/)[0];
            const lastName = fixture.candidate.real_name
              .split(/\s+/)
              .slice(-1)[0];
            const emailLocal = fixture.candidate.real_email.split('@')[0];

            for (const c of calls) {
              const combined = c.system + '\n' + c.user;
              expect(
                combined,
                `fixture ${fixtureId} call body contains real_name '${fixture.candidate.real_name}'`,
              ).not.toContain(fixture.candidate.real_name);
              expect(
                combined,
                `fixture ${fixtureId} call body contains real_email '${fixture.candidate.real_email}'`,
              ).not.toContain(fixture.candidate.real_email);
              expect(
                combined,
                `fixture ${fixtureId} call body contains real_user_id '${fixture.candidate.real_user_id}'`,
              ).not.toContain(fixture.candidate.real_user_id);
              expect(
                combined,
                `fixture ${fixtureId} call body contains first name '${firstName}'`,
              ).not.toContain(firstName);
              if (lastName && lastName !== firstName) {
                expect(
                  combined,
                  `fixture ${fixtureId} call body contains last name '${lastName}'`,
                ).not.toContain(lastName);
              }
              expect(
                combined,
                `fixture ${fixtureId} call body contains email local-part '${emailLocal}'`,
              ).not.toContain(emailLocal);
            }
          }
        }

        // ─── Assertion 2: cited_signal distribution band ────────────────
        //
        // Each fixture's top-signal rate (max(signalCounts) / trials) is
        // computed; the spread between max and min must be <= BIAS_PP_BAND.

        const rates = results.map((r) =>
          topSignalRate(r, TRIALS_PER_FIXTURE),
        );
        const maxRate = Math.max(...rates);
        const minRate = Math.min(...rates);
        const spread = maxRate - minRate;

        const summary = results
          .map(
            (r) =>
              `  ${r.fixtureId}: counts=${JSON.stringify(r.signalCounts)} nulls=${r.nullCount} topRate=${(
                topSignalRate(r, TRIALS_PER_FIXTURE) * 100
              ).toFixed(1)}%`,
          )
          .join('\n');

        expect(
          spread,
          `cited_signal top-rate spread ${(spread * 100).toFixed(1)}pp exceeds ${BIAS_PP_BAND * 100}pp band.\n` +
            `Per-fixture distribution (out of ${TRIALS_PER_FIXTURE} trials each):\n${summary}`,
        ).toBeLessThanOrEqual(BIAS_PP_BAND);

        // ─── Assertion 3: no fixture > 50% top-rate (real-LLM noise floor) ─

        for (const r of results) {
          const top = topSignalRate(r, TRIALS_PER_FIXTURE);
          expect(
            top,
            `fixture ${r.fixtureId} top signal rate ${(top * 100).toFixed(1)}% exceeds 50% — single signal dominating`,
          ).toBeLessThanOrEqual(0.5);
        }
      },
      suiteTimeout,
    );
  },
);
