// Phase 3 Plan 05 — generateWhyYouSentence unit tests (RED → GREEN).
//
// `generateWhyYouSentence({ task, candidate, mathBreakdown, chat?, validator? })`
// is the new grounded Why-you LLM call. Tests cover:
//   - Happy path: stub returns a grounded sentence → returned verbatim.
//   - Grounding validator REJECTS sentences citing skills not in payload → null.
//   - Stub throws → null returned, NO exception leaks.
//   - Stub returns malformed JSON → Zod parse fails → null.
//   - Anonymization end-to-end: real name/email NEVER appears in prompt body.
//
// These tests run RED until Task 3 creates `src/lib/recgon/whyYouLLM.ts`.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  generateWhyYouSentence,
  type WhyYouChatAdapter,
} from '@/lib/recgon/whyYouLLM';
import { buildWhyYouGroundedUserPrompt } from '@/lib/prompts';

type Fixture = {
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

function loadFixture(name: string): Fixture {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf-8'),
  ) as Fixture;
}

function makeInputs(fix: Fixture) {
  return {
    task: fix.task,
    candidate: {
      declaredSkills: fix.candidate.declaredSkills,
      interests: fix.candidate.interests,
      recentTasks: fix.candidate.recentTasks,
    },
    mathBreakdown: fix.mathBreakdown,
  };
}

function stubReturning(json: string): WhyYouChatAdapter {
  return async () => json;
}

describe('generateWhyYouSentence — happy path', () => {
  it('returns the LLM sentence verbatim when it cites a real skill from the candidate payload', async () => {
    const fix = loadFixture('english-m.json');
    const inputs = makeInputs(fix);

    const chat = stubReturning(
      JSON.stringify({
        sentence: 'You finished 3 typescript tasks recently (avg rating 4.5).',
        cited_signal: 'recent_track_record',
      }),
    );
    const out = await generateWhyYouSentence({ ...inputs, chat });
    expect(out.sentence).toBe(
      'You finished 3 typescript tasks recently (avg rating 4.5).',
    );
    expect(out.citedSignal).toBe('recent_track_record');
  });

  it('accepts a sentence that cites a canonical skill present in declaredSkills', async () => {
    const fix = loadFixture('english-m.json');
    const inputs = makeInputs(fix);

    const chat = stubReturning(
      JSON.stringify({
        sentence: 'Your typescript depth is the strongest match for this work.',
        cited_signal: 'skill_depth',
      }),
    );
    const out = await generateWhyYouSentence({ ...inputs, chat });
    expect(out.sentence).toBe(
      'Your typescript depth is the strongest match for this work.',
    );
    expect(out.citedSignal).toBe('skill_depth');
  });
});

describe('generateWhyYouSentence — grounding validator', () => {
  it('REJECTS sentences citing a skill that is NOT in the candidate payload', async () => {
    const fix = loadFixture('english-m.json');
    const inputs = makeInputs(fix);
    // Candidate declaredSkills = ['typescript', 'auth', 'node']. Sentence
    // claims rust — no grounding → must return null.

    const chat = stubReturning(
      JSON.stringify({
        sentence: "Your rust experience makes you a great fit.",
        cited_signal: 'skill_depth',
      }),
    );
    const out = await generateWhyYouSentence({ ...inputs, chat });
    expect(out.sentence).toBeNull();
    expect(out.citedSignal).toBeNull();
  });

  it('REJECTS sentences with pronouns even if grounded', async () => {
    const fix = loadFixture('english-m.json');
    const inputs = makeInputs(fix);

    // Pronouns ("he") leak — must be rejected (PRONOUN_DENY defense-in-depth).
    const chat = stubReturning(
      JSON.stringify({
        sentence: 'He has the strongest typescript record on the team.',
        cited_signal: 'skill_depth',
      }),
    );
    const out = await generateWhyYouSentence({ ...inputs, chat });
    expect(out.sentence).toBeNull();
    expect(out.citedSignal).toBeNull();
  });

  it('REJECTS sentences citing only availability/capacity language without a fit signal', async () => {
    const fix = loadFixture('english-m.json');
    const inputs = makeInputs(fix);
    // User Hard Rule 2: "AI should never assign a task to someone because he
    // had time". Sentence cites only availability — no skill / task kind /
    // recent track record / interest signal grounded in payload.

    const chat = stubReturning(
      JSON.stringify({
        sentence: 'Your week was the clearest of the candidates.',
        cited_signal: 'capacity_headroom',
      }),
    );
    const out = await generateWhyYouSentence({ ...inputs, chat });
    // grounding validator must reject availability-only sentences when there's
    // a strong fit signal candidate (skillOverlap >= 0.72). The user wants AI
    // to lead with fit, not time-availability.
    expect(out.sentence).toBeNull();
    expect(out.citedSignal).toBeNull();
  });
});

describe('generateWhyYouSentence — failure handling', () => {
  it('returns {sentence:null, citedSignal:null} when chat THROWS', async () => {
    const fix = loadFixture('english-m.json');
    const inputs = makeInputs(fix);

    const chat: WhyYouChatAdapter = async () => {
      throw new Error('provider chain dead');
    };
    const out = await generateWhyYouSentence({ ...inputs, chat });
    expect(out.sentence).toBeNull();
    expect(out.citedSignal).toBeNull();
  });

  it('returns {sentence:null} when chat returns malformed JSON', async () => {
    const fix = loadFixture('english-m.json');
    const inputs = makeInputs(fix);

    const chat = stubReturning('this is not JSON at all { ouch');
    const out = await generateWhyYouSentence({ ...inputs, chat });
    expect(out.sentence).toBeNull();
    expect(out.citedSignal).toBeNull();
  });

  it('returns {sentence:null} when chat returns Zod-invalid JSON shape', async () => {
    const fix = loadFixture('english-m.json');
    const inputs = makeInputs(fix);

    // Missing required cited_signal; oversized sentence (> 30 words).
    const chat = stubReturning(
      JSON.stringify({
        sentence: Array.from({ length: 50 }).fill('typescript').join(' '),
        cited_signal: 'skill_depth',
      }),
    );
    const out = await generateWhyYouSentence({ ...inputs, chat });
    expect(out.sentence).toBeNull();
  });

  it('honors explicit null sentence from LLM when the model cannot ground', async () => {
    const fix = loadFixture('english-m.json');
    const inputs = makeInputs(fix);

    const chat = stubReturning(
      JSON.stringify({ sentence: null, cited_signal: null }),
    );
    const out = await generateWhyYouSentence({ ...inputs, chat });
    expect(out.sentence).toBeNull();
    expect(out.citedSignal).toBeNull();
  });
});

describe('generateWhyYouSentence — anonymization end-to-end', () => {
  it('NEVER includes real name or email in the prompt body', async () => {
    // Use the Turkish-F fixture which carries the user's real name + email
    // (matches the codebase's user identity — strongest possible leak signal).
    const fix = loadFixture('turkish-f.json');
    const inputs = makeInputs(fix);

    const captured: Array<{ system: string; user: string }> = [];
    const chat: WhyYouChatAdapter = async (system, user) => {
      captured.push({ system, user });
      return JSON.stringify({
        sentence: 'Your typescript depth fits this work.',
        cited_signal: 'skill_depth',
      });
    };

    await generateWhyYouSentence({
      ...inputs,
      chat,
      // Provide the real name + email to the prompt builder to confirm it
      // is anonymized BEFORE reaching the chat adapter. The runtime call
      // path will not have these fields (they live on Teammate but never
      // reach buildWhyYouGroundedUserPrompt); this is the strictest possible
      // assertion that no path can ever leak them.
      __testIdentity: {
        name: fix.candidate.real_name,
        email: fix.candidate.real_email,
      },
    } as Parameters<typeof generateWhyYouSentence>[0]);

    expect(captured.length).toBe(1);
    const body = captured[0].system + '\n' + captured[0].user;

    // Hard assertions on the user's real identity. NONE of these may appear.
    const realName = fix.candidate.real_name;
    const firstName = realName.split(/\s+/)[0];
    const lastName = realName.split(/\s+/).slice(-1)[0];
    const emailLocal = fix.candidate.real_email.split('@')[0];

    expect(body).not.toContain(realName);
    expect(body).not.toContain(firstName);
    expect(body).not.toContain(lastName);
    expect(body).not.toContain(fix.candidate.real_email);
    expect(body).not.toContain(emailLocal);
    expect(body).not.toContain('@gmail.com');
  });

  it('buildWhyYouGroundedUserPrompt — directly verifying it never embeds names', () => {
    const fix = loadFixture('turkish-f.json');
    // Build the prompt directly with a "candidate" payload — confirms the
    // builder API NEVER accepts identity fields, so they cannot accidentally
    // be passed in by callers.
    const body = buildWhyYouGroundedUserPrompt(
      fix.task,
      {
        declaredSkills: fix.candidate.declaredSkills,
        interests: fix.candidate.interests,
        recentTasks: fix.candidate.recentTasks,
      },
      fix.mathBreakdown,
    );

    expect(body).not.toContain(fix.candidate.real_name);
    expect(body).not.toContain('Eneskis');
    expect(body).not.toContain('Karaman');
    expect(body).not.toContain(fix.candidate.real_email);
    expect(body).not.toContain('eneskis1324');
    expect(body).not.toContain('@gmail.com');
    // Should use a generic placeholder
    expect(body).toMatch(/chosen_candidate|teammate|you/i);
  });
});
