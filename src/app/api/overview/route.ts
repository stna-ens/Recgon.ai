import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getAllProjects } from '@/lib/storage';
import { getRecentActivities } from '@/lib/activityLog';
import { getUserById } from '@/lib/userStorage';
import { getRecentCommits } from '@/lib/githubFetcher';
import { getCachedSummaries, getPendingSummaryShas } from '@/lib/commitSummary';
import { enqueueJob } from '@/lib/llm/jobQueue';
import { supabase } from '@/lib/supabase';
import { serverError } from '@/lib/apiError';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const SIGNAL_LABELS: Record<string, string> = {
  analyze_code: 'analysis completed',
  query_feedback: 'feedback analyzed',
  collect_feedback: 'feedback collected',
  generate_content: 'content generated',
  generate_campaign: 'campaign planned',
  fetch_analytics: 'analytics refreshed',
  mark_item_complete: 'action marked complete',
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const sevenDaysAgoIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

    // Pull "things gone wrong" tasks for the ATTENTION board column:
    //   - stuck:   verification has been mid-flight (auto_running /
    //              proof_evaluating) for >24h — the AI got wedged.
    //   - failed:  verification rejected the proof — the owner has to
    //              override or re-request.
    //   - drift:   AI couldn't route the task at all (status='unassigned').
    // Deliberately excludes routine in-flight items like proof_requested
    // and awaiting_review — those are normal flow, not "gone wrong",
    // and are surfaced via the focus card's next-steps.
    const stuckCutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [projects, activities, completedTasksRes, stuckRes, failedRes, driftRes] = await Promise.all([
      getAllProjects(teamId, session.user.id),
      getRecentActivities(teamId, { sinceHours: 7 * 24, limit: 30 }),
      supabase
        .from('agent_tasks')
        .select('id, title, project_id, completed_at')
        .eq('team_id', teamId)
        .eq('status', 'completed')
        .gte('completed_at', sevenDaysAgoIso)
        .order('completed_at', { ascending: false })
        .limit(20),
      supabase
        .from('agent_tasks')
        .select('id, title, kind, priority, project_id, assigned_at, verification_status')
        .eq('team_id', teamId)
        .in('verification_status', ['auto_running', 'proof_evaluating'])
        .lt('assigned_at', stuckCutoffIso)
        .order('assigned_at', { ascending: true })
        .limit(10),
      supabase
        .from('agent_tasks')
        .select('id, title, kind, priority, project_id, assigned_at, verification_status')
        .eq('team_id', teamId)
        .eq('verification_status', 'failed')
        .order('assigned_at', { ascending: false })
        .limit(10),
      supabase
        .from('agent_tasks')
        .select('id, title, kind, priority, project_id, created_at')
        .eq('team_id', teamId)
        .eq('status', 'unassigned')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

    const signals = activities
      .filter((a) => a.status === 'succeeded' && SIGNAL_LABELS[a.toolName])
      .filter((a) => !a.projectId || projectMap[a.projectId])
      .slice(0, 6)
      .map((a) => ({
        id: a.id,
        label: SIGNAL_LABELS[a.toolName],
        projectName: a.projectId ? (projectMap[a.projectId] ?? null) : null,
        createdAt: a.createdAt,
      }));

    type Action = {
      id: string;
      title: string;
      source: 'analysis' | 'feedback';
      projectName: string;
      priority: 'high' | 'med' | 'low';
      surfacedAt: string | null;
    };

    const actions: Action[] = [];
    let unreadFeedback = 0;
    const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;

    // Aggregates added for the v2 home cockpit redesign.
    const sentimentBreakdown = { positive: 0, neutral: 0, negative: 0 };
    let slippingCount = 0;
    let analyzedCount = 0;

    type Shipped = {
      id: string;
      title: string;
      kind: 'prompt' | 'task';
      projectName: string | null;
      shippedAt: string;
    };
    const shipped: Shipped[] = [];

    // --- v2 home (homepage-first redesign) ---
    // Per-project momentum row. Surfaces *movement* (bet age, sentiment
    // shift, pulse badge) instead of static state, so the home reads
    // differently from /projects.
    type ProjectCard = {
      id: string;
      name: string;
      currentStage: string | null;
      overallScore: number | null;
      analyzedAt: string | null;
      topRisk: string | null;
      topNextStep: string | null;
      voice: string | null; // latest feedback summary or first praise/bug snippet
      voiceTone: 'positive' | 'mixed' | 'negative' | null;
      // Momentum signals.
      betAgeDays: number | null;          // days since current top next-step was set (analysis age)
      sentimentDelta: number | null;      // (latest pos% - prev pos%); null if <2 feedback analyses
      pulse: 'shipping' | 'converging' | 'stuck' | 'drifting' | 'idle';
      logoUrl?: string;
    };
    const projectCards: ProjectCard[] = [];

    // "Wins" — recent shipped evidence per project (improvements[] + nextStepsTaken)
    type Win = {
      id: string;
      projectId: string;
      projectName: string;
      label: string;
      kind: 'improvement' | 'next-step-taken';
      evidence: string | null;
    };
    const wins: Win[] = [];

    // Today's focus — the project that needs the most attention right now.
    type TodayFocus = {
      projectId: string;
      projectName: string;
      logoUrl?: string;
      currentStage: string | null;
      overallScore: number | null;
      topRisk: string | null;
      nextSteps: string[]; // up to 2
      latestVoice: string | null;
      analyzedAt: string | null;
      // Scope counts — what Recgon found about this project
      risksCount: number;
      nextStepsCount: number;
      improvementsCount: number;
    } | null;
    let todayFocus: TodayFocus = null;
    let focusScore = Infinity;

    for (const project of projects) {
      const analysis = project.analysis as {
        overallScore?: number;
        analyzedAt?: string;
        prioritizedNextSteps?: string[];
        swot?: { weaknesses?: string[] };
        topRisks?: string[];
        currentStage?: string;
        improvements?: string[];
        nextStepsTaken?: { step: string; taken: boolean; evidence: string }[];
      } | undefined;

      if (analysis) {
        analyzedCount++;
        if (typeof analysis.overallScore === 'number' && analysis.overallScore < 6) {
          slippingCount++;
        }
      }

      if (analysis?.prioritizedNextSteps) {
        const score = analysis.overallScore ?? 10;
        const priority: Action['priority'] = score < 5 ? 'high' : score < 7 ? 'med' : 'low';
        for (const step of analysis.prioritizedNextSteps.slice(0, 3)) {
          actions.push({
            id: `${project.id}-step-${actions.length}`,
            title: step,
            source: 'analysis',
            projectName: project.name,
            priority,
            surfacedAt: analysis.analyzedAt ?? null,
          });
        }
      }

      const feedbackAnalyses = project.feedbackAnalyses;
      let latestVoice: string | null = null;
      let latestTone: ProjectCard['voiceTone'] = null;

      if (feedbackAnalyses && feedbackAnalyses.length > 0) {
        const latest = feedbackAnalyses[0];
        const latestAt = latest.analyzedAt ?? null;
        const developerPrompts = latest.developerPrompts ?? [];

        // Aggregate sentiment from each project's MOST RECENT feedback analysis.
        const sb = latest.sentimentBreakdown;
        if (sb && typeof sb.positive === 'number') {
          sentimentBreakdown.positive += sb.positive;
          sentimentBreakdown.neutral += sb.neutral;
          sentimentBreakdown.negative += sb.negative;
        }

        // Project-card "voice" — prefer the AI summary, fall back to first
        // praise or bug snippet so the homepage always shows real customer
        // voice (not a derived heuristic).
        if (latest.summary && latest.summary.trim()) {
          latestVoice = latest.summary.trim();
        } else if (latest.praises?.length) {
          latestVoice = latest.praises[0];
        } else if (latest.bugs?.length) {
          latestVoice = latest.bugs[0];
        }
        if (latestVoice) {
          const pos = sb?.positive ?? 0;
          const neg = sb?.negative ?? 0;
          if (pos > neg * 1.5) latestTone = 'positive';
          else if (neg > pos * 1.5) latestTone = 'negative';
          else latestTone = 'mixed';
        }

        for (const prompt of developerPrompts.slice(0, 2)) {
          actions.push({
            id: `${project.id}-fb-${actions.length}`,
            title: prompt,
            source: 'feedback',
            projectName: project.name,
            priority: 'med',
            surfacedAt: latestAt,
          });
        }

        for (const fb of feedbackAnalyses) {
          const at = fb.analyzedAt;
          if (at && new Date(at).getTime() >= sevenDaysAgo) unreadFeedback++;

          // Pull completed-prompt outcomes into the shipped feed.
          const completed = fb.completedPrompts ?? [];
          for (const cp of completed) {
            if (!cp.completedAt) continue;
            if (new Date(cp.completedAt).getTime() < sevenDaysAgo) continue;
            const title = fb.developerPrompts?.[cp.promptIndex];
            if (!title) continue;
            shipped.push({
              id: `${fb.id}-cp-${cp.promptIndex}`,
              title,
              kind: 'prompt',
              projectName: project.name,
              shippedAt: cp.completedAt,
            });
          }
        }
      }

      // Wins from re-analysis: improvements[] + nextStepsTaken (taken=true).
      if (analysis?.improvements?.length) {
        for (let i = 0; i < Math.min(analysis.improvements.length, 3); i++) {
          const text = analysis.improvements[i];
          if (!text) continue;
          wins.push({
            id: `${project.id}-imp-${i}`,
            projectId: project.id,
            projectName: project.name,
            label: text,
            kind: 'improvement',
            evidence: null,
          });
        }
      }
      if (analysis?.nextStepsTaken?.length) {
        const taken = analysis.nextStepsTaken.filter((s) => s.taken);
        for (let i = 0; i < Math.min(taken.length, 3); i++) {
          wins.push({
            id: `${project.id}-step-taken-${i}`,
            projectId: project.id,
            projectName: project.name,
            label: taken[i].step,
            kind: 'next-step-taken',
            evidence: taken[i].evidence ?? null,
          });
        }
      }

      // Build the per-project momentum card.
      if (analysis) {
        const topRisk =
          analysis.topRisks?.find((r) => r && r.trim()) ??
          analysis.swot?.weaknesses?.find((w) => w && w.trim()) ??
          null;
        const topNextStep = analysis.prioritizedNextSteps?.find((s) => s && s.trim()) ?? null;

        // Bet age = days since the current analysis was run. Treats
        // re-analysis as a "new bet" — the top next-step is at most this
        // old. Without history rows we can't tell if it actually changed.
        const betAgeDays =
          analysis.analyzedAt
            ? Math.max(0, Math.round((Date.now() - new Date(analysis.analyzedAt).getTime()) / (24 * 60 * 60 * 1000)))
            : null;

        // Sentiment delta: requires ≥2 feedback analyses. Compares positive%
        // share of the most recent vs the previous one.
        let sentimentDelta: number | null = null;
        if (feedbackAnalyses && feedbackAnalyses.length >= 2) {
          const ratio = (sb: { positive?: number; neutral?: number; negative?: number } | undefined): number | null => {
            if (!sb) return null;
            const total = (sb.positive ?? 0) + (sb.neutral ?? 0) + (sb.negative ?? 0);
            if (total === 0) return null;
            return ((sb.positive ?? 0) / total) * 100;
          };
          const latestPct = ratio(feedbackAnalyses[0].sentimentBreakdown);
          const prevPct = ratio(feedbackAnalyses[1].sentimentBreakdown);
          if (latestPct !== null && prevPct !== null) sentimentDelta = Math.round(latestPct - prevPct);
        }

        // Pulse badge — Recgon's one-word read on this project's vibe.
        const pulseScore = analysis.overallScore ?? 0;
        const hasShippedNextStep = (analysis.nextStepsTaken ?? []).some((s) => s.taken);
        const hasImprovements = (analysis.improvements?.length ?? 0) > 0;
        let pulse: ProjectCard['pulse'] = 'idle';
        if (hasShippedNextStep) pulse = 'shipping';
        else if (pulseScore >= 7 && hasImprovements) pulse = 'converging';
        else if ((sentimentDelta !== null && sentimentDelta < -5) || pulseScore < 5) pulse = 'drifting';
        else if (betAgeDays !== null && betAgeDays > 14 && !hasImprovements) pulse = 'stuck';
        else pulse = 'idle';

        projectCards.push({
          id: project.id,
          name: project.name,
          currentStage: analysis.currentStage ?? null,
          overallScore: typeof analysis.overallScore === 'number' ? analysis.overallScore : null,
          analyzedAt: analysis.analyzedAt ?? null,
          topRisk,
          topNextStep,
          voice: latestVoice,
          voiceTone: latestTone,
          betAgeDays,
          sentimentDelta,
          pulse,
          logoUrl: project.logoUrl,
        });

        // Today's focus = lowest-scoring project with at least one risk/next step.
        const focusCmpScore = analysis.overallScore ?? 10;
        if (focusCmpScore < focusScore && (topRisk || topNextStep)) {
          focusScore = focusCmpScore;
          todayFocus = {
            projectId: project.id,
            projectName: project.name,
            logoUrl: project.logoUrl,
            currentStage: analysis.currentStage ?? null,
            overallScore: typeof analysis.overallScore === 'number' ? analysis.overallScore : null,
            topRisk,
            nextSteps: (analysis.prioritizedNextSteps ?? []).filter((s) => s && s.trim()).slice(0, 3),
            latestVoice,
            analyzedAt: analysis.analyzedAt ?? null,
            risksCount:
              (analysis.topRisks ?? []).filter((r) => r && r.trim()).length +
              (analysis.swot?.weaknesses ?? []).filter((w) => w && w.trim()).length,
            nextStepsCount: (analysis.prioritizedNextSteps ?? []).filter((s) => s && s.trim()).length,
            improvementsCount:
              (analysis.improvements ?? []).filter((i) => i && i.trim()).length +
              (analysis.nextStepsTaken ?? []).filter((s) => s.taken).length,
          };
        }
      } else {
        // Project without analysis still appears on the momentum row so the
        // user can see "this needs analysis" rather than have it disappear.
        projectCards.push({
          id: project.id,
          name: project.name,
          currentStage: null,
          overallScore: null,
          analyzedAt: null,
          topRisk: null,
          topNextStep: null,
          voice: latestVoice,
          voiceTone: latestTone,
          betAgeDays: null,
          sentimentDelta: null,
          pulse: 'idle',
          logoUrl: project.logoUrl,
        });
      }
    }

    // GitHub updates — recent commits per project, enriched with Recgon's
    // plain-English summary when one has been generated. Flow:
    //   1. Pull recent commits from each GitHub-connected project (parallel).
    //   2. Bulk-lookup cached summaries from `commit_summaries` per repo.
    //   3. For shas with no cached summary, enqueue a `commit_summary` job
    //      (deduped against pending/running jobs to avoid double-work).
    //   4. UI shows summary if present, raw message + `summarizing: true`
    //      otherwise; the next reload picks up the populated summary.
    type Update = {
      id: string;
      projectId: string;
      projectName: string;
      message: string;
      summary: string | null;
      summarizing: boolean;
      sha: string;
      fullSha: string;
      url: string;
      committedAt: string;
      authorName: string | null;
      authorAvatar: string | null;
    };
    const updates: Update[] = [];
    const githubProjects = projects.filter((p) => p.isGithub && p.githubUrl);
    if (githubProjects.length > 0) {
      const user = await getUserById(session.user.id);
      const token = user?.githubAccessToken;

      // Step 1: fetch commits per repo.
      type RawCommitRow = {
        project: { id: string; name: string; githubUrl: string };
        sha: string;
        message: string;
        url: string;
        committedAt: string;
        authorName: string | null;
        authorAvatar: string | null;
      };
      const rawByRepo = new Map<string, RawCommitRow[]>();
      const commitResults = await Promise.allSettled(
        githubProjects.map(async (p) => {
          const commits = await getRecentCommits(p.githubUrl!, token, 3);
          return commits.map((c) => ({
            project: { id: p.id, name: p.name, githubUrl: p.githubUrl! },
            sha: c.sha,
            message: c.message,
            url: c.url,
            committedAt: c.committedAt,
            authorName: c.authorName,
            authorAvatar: c.authorAvatar,
          }));
        }),
      );
      for (const r of commitResults) {
        if (r.status !== 'fulfilled') continue;
        for (const row of r.value) {
          const arr = rawByRepo.get(row.project.githubUrl) ?? [];
          arr.push(row);
          rawByRepo.set(row.project.githubUrl, arr);
        }
      }

      // Step 2 + 3: per repo, look up cached summaries and enqueue jobs for
      // the missing shas (deduped against pending jobs).
      for (const [repoUrl, rows] of rawByRepo.entries()) {
        const shas = rows.map((r) => r.sha);
        const [cached, pending] = await Promise.all([
          getCachedSummaries(repoUrl, shas),
          getPendingSummaryShas(repoUrl, shas),
        ]);
        for (const row of rows) {
          const summary = cached.get(row.sha) ?? null;
          const isPending = pending.has(row.sha);
          const needsEnqueue = !summary && !isPending;
          if (needsEnqueue) {
            try {
              await enqueueJob({
                teamId,
                userId: session.user.id,
                kind: 'commit_summary',
                payload: { githubUrl: repoUrl, sha: row.sha, token },
              });
            } catch (err) {
              // Queue may be unavailable — log and continue with fallback.
              console.warn('[overview] failed to enqueue commit_summary', {
                sha: row.sha,
                err: err instanceof Error ? err.message : String(err),
              });
            }
          }
          updates.push({
            id: `${row.project.id}-${row.sha.slice(0, 7)}`,
            projectId: row.project.id,
            projectName: row.project.name,
            message: row.message,
            summary,
            summarizing: !summary, // pending OR just-enqueued — both surface to UI as "summarizing"
            sha: row.sha.slice(0, 7),
            fullSha: row.sha,
            url: row.url,
            committedAt: row.committedAt,
            authorName: row.authorName,
            authorAvatar: row.authorAvatar,
          });
        }
      }
      updates.sort((a, b) => new Date(b.committedAt).getTime() - new Date(a.committedAt).getTime());
    }

    // Completed agent tasks → shipped feed.
    for (const t of completedTasksRes.data ?? []) {
      const completedAt = t.completed_at as string | null;
      if (!completedAt) continue;
      shipped.push({
        id: t.id as string,
        title: t.title as string,
        kind: 'task',
        projectName: t.project_id ? (projectMap[t.project_id as string] ?? null) : null,
        shippedAt: completedAt,
      });
    }
    shipped.sort((a, b) => new Date(b.shippedAt).getTime() - new Date(a.shippedAt).getTime());

    const priorityOrder = { high: 0, med: 1, low: 2 };

    const projectBestPriority = new Map<string, number>();
    const projectFirstIdx = new Map<string, number>();
    actions.forEach((a, idx) => {
      const best = projectBestPriority.get(a.projectName);
      const p = priorityOrder[a.priority];
      if (best === undefined || p < best) projectBestPriority.set(a.projectName, p);
      if (!projectFirstIdx.has(a.projectName)) projectFirstIdx.set(a.projectName, idx);
    });

    actions.sort((a, b) => {
      const pa = projectBestPriority.get(a.projectName)!;
      const pb = projectBestPriority.get(b.projectName)!;
      if (pa !== pb) return pa - pb;
      if (a.projectName !== b.projectName) {
        return projectFirstIdx.get(a.projectName)! - projectFirstIdx.get(b.projectName)!;
      }
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const priorityCounts = {
      high: actions.filter((a) => a.priority === 'high').length,
      med: actions.filter((a) => a.priority === 'med').length,
      low: actions.filter((a) => a.priority === 'low').length,
    };

    type DeckTask = {
      id: string;
      title: string;
      kind: string | null;
      priority: number | null;
      projectName: string | null;
    };

    function toDeck(rows: unknown[] | null | undefined): DeckTask[] {
      return (rows ?? []).map((raw) => {
        const r = raw as Record<string, unknown>;
        return {
          id: r.id as string,
          title: r.title as string,
          kind: (r.kind as string | null) ?? null,
          priority: (r.priority as number | null) ?? null,
          projectName: r.project_id ? (projectMap[r.project_id as string] ?? null) : null,
        };
      });
    }

    // ATTENTION board column — "things gone wrong" decision queue. Each
    // bucket is a distinct failure mode that needs an owner's call.
    const decisionDeck = {
      stuck: toDeck(stuckRes.data).slice(0, 3),
      stuckTotal: (stuckRes.data ?? []).length,
      failed: toDeck(failedRes.data).slice(0, 3),
      failedTotal: (failedRes.data ?? []).length,
      drift: toDeck(driftRes.data).slice(0, 3),
      driftTotal: (driftRes.data ?? []).length,
    };
    const needsYouCount =
      decisionDeck.stuckTotal + decisionDeck.failedTotal + decisionDeck.driftTotal;

    // --- PM Briefing: Watching / Winning / Deciding ---
    // The homepage's signature card. Recgon picks the one thing per slot it
    // would actually open a stand-up with. Each slot derives from real data,
    // never fabricated text.
    type BriefingSlot = {
      headline: string;            // the one-sentence "Recgon's voice" line
      detail: string | null;       // a short evidence tag under it
      href: string | null;         // deep link the user can open
    } | null;

    type Briefing = {
      watching: BriefingSlot;
      winning: BriefingSlot;
      deciding: BriefingSlot;
    };

    const briefing: Briefing = { watching: null, winning: null, deciding: null };

    // WATCHING — the lowest-score project's top risk (already computed as todayFocus).
    if (todayFocus && todayFocus.topRisk) {
      briefing.watching = {
        headline: `${todayFocus.projectName} is at ${typeof todayFocus.overallScore === 'number' ? todayFocus.overallScore.toFixed(1) : '—'}.`,
        detail: todayFocus.topRisk,
        href: `/projects/${todayFocus.projectId}`,
      };
    } else if (slippingCount > 0) {
      briefing.watching = {
        headline: `${slippingCount} ${slippingCount === 1 ? 'product is' : 'products are'} slipping.`,
        detail: 'Open the momentum row below for context.',
        href: null,
      };
    }

    // WINNING — newest evidence-backed win. Prefer nextStepsTaken (with
    // evidence) > improvements > shipped tasks.
    const winningCandidate = wins.find((w) => w.kind === 'next-step-taken' && w.evidence)
      ?? wins.find((w) => w.kind === 'improvement')
      ?? null;
    if (winningCandidate) {
      briefing.winning = {
        headline: winningCandidate.kind === 'next-step-taken'
          ? `${winningCandidate.projectName} shipped a tracked next-step.`
          : `${winningCandidate.projectName} improved since last analysis.`,
        detail: winningCandidate.evidence ?? winningCandidate.label,
        href: `/projects/${winningCandidate.projectId}`,
      };
    } else if (shipped.length > 0) {
      const s = shipped[0];
      briefing.winning = {
        headline: `${s.projectName ?? 'A teammate'} closed work this week.`,
        detail: s.title,
        href: '/tasks',
      };
    }

    // DECIDING — what's gone wrong and needs YOUR call. Failed first
    // (proof was rejected, owner has to override or re-request), then
    // stuck (verifications wedged for >24h), then drift (couldn't be
    // routed). Mirrors the ATTENTION column's order.
    if (decisionDeck.failedTotal > 0) {
      briefing.deciding = {
        headline: `${decisionDeck.failedTotal} ${decisionDeck.failedTotal === 1 ? 'verification' : 'verifications'} failed.`,
        detail: decisionDeck.failed[0]?.title ?? null,
        href: '/tasks?filter=failed',
      };
    } else if (decisionDeck.stuckTotal > 0) {
      briefing.deciding = {
        headline: `${decisionDeck.stuckTotal} ${decisionDeck.stuckTotal === 1 ? 'verification has' : 'verifications have'} been stuck >24h.`,
        detail: decisionDeck.stuck[0]?.title ?? null,
        href: '/tasks?filter=stuck',
      };
    } else if (decisionDeck.driftTotal > 0) {
      briefing.deciding = {
        headline: `${decisionDeck.driftTotal} ${decisionDeck.driftTotal === 1 ? 'task' : 'tasks'} couldn't be auto-routed.`,
        detail: decisionDeck.drift[0]?.title ?? null,
        href: '/tasks?filter=drift',
      };
    }

    // Sort projectCards: lowest overallScore first (so the most urgent product
    // is the leftmost card on the rolodex), then unanalyzed at the end.
    projectCards.sort((a, b) => {
      const sa = a.overallScore ?? 999;
      const sb = b.overallScore ?? 999;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });

    // --- v2 home (observability cockpit) ---
    // upNext: flat list of "what to work on next" derived from
    // prioritizedNextSteps[]. Sorted with high-urgency projects (low score)
    // first so the sidebar reads as a real triage queue.
    type UpNextItem = {
      id: string;
      label: string;
      projectId: string;
      projectName: string;
      projectScore: number | null;
      priority: 'high' | 'med' | 'low';
    };
    const upNext: UpNextItem[] = [];
    for (const project of projects) {
      const analysis = project.analysis as
        | { overallScore?: number; prioritizedNextSteps?: string[] }
        | undefined;
      if (!analysis?.prioritizedNextSteps?.length) continue;
      const score = analysis.overallScore ?? 10;
      const priority: UpNextItem['priority'] = score < 5 ? 'high' : score < 7 ? 'med' : 'low';
      analysis.prioritizedNextSteps.slice(0, 2).forEach((step, idx) => {
        if (!step?.trim()) return;
        upNext.push({
          id: `${project.id}-up-${idx}`,
          label: step.trim(),
          projectId: project.id,
          projectName: project.name,
          projectScore: typeof analysis.overallScore === 'number' ? analysis.overallScore : null,
          priority,
        });
      });
    }
    const upNextOrder = { high: 0, med: 1, low: 2 };
    upNext.sort((a, b) => upNextOrder[a.priority] - upNextOrder[b.priority]);

    return NextResponse.json({
      actions: actions.slice(0, 5),
      signals,
      unreadFeedback,
      // v2 cockpit aggregates ↓
      totalProjects: projects.length,
      analyzedCount,
      slippingCount,
      sentimentBreakdown,
      priorityCounts,
      shipped: shipped.slice(0, 10),
      decisionDeck,
      needsYouCount,
      // v2 home (homepage-first) ↓
      todayFocus,
      projectCards,
      wins: wins.slice(0, 8),
      updates: updates.slice(0, 6),
      // v2 home (PM cockpit) ↓
      briefing,
      // v2 home (observability cockpit) ↓
      upNext: upNext.slice(0, 8),
    });
  } catch (err) {
    return serverError('GET /api/overview', err);
  }
}
