import Link from 'next/link';
import RecgonMark from '@/components/redesign/RecgonMark';
import {
  PaperCard,
  InkRule,
  Stamp,
  VintageChip,
  WaxStamp,
  Eyebrow,
} from '@/components/redesign/Surface';
import SceneHost from '@/components/redesign/scenes/SceneHost';
import StatBlock from '@/components/redesign/viz/StatBlock';
import ProgressRing from '@/components/redesign/viz/ProgressRing';
import Sparkline from '@/components/redesign/viz/Sparkline';
import BarSpark from '@/components/redesign/viz/BarSpark';
import TimelineRibbon from '@/components/redesign/viz/TimelineRibbon';
import ThemeBubbleMap from '@/components/redesign/viz/ThemeBubbleMap';

/* =============================================================
   Recgon — Redesign landing page
   Vintage editorial PM workspace. Centerpiece 3D Product Compass.
   Replaces wall-of-text with viz primitives throughout.
   ============================================================= */

export default function RedesignLanding() {
  return (
    <>
      <TopBar />

      <main>
        <Hero />
        <DisciplinesSection />
        <PullQuoteBreak />
        <HowItThinksSection />
        <NumbersSection />
        <ClosingCta />
      </main>

      <Footer />
    </>
  );
}

/* ---------- TOP BAR ---------- */

function TopBar() {
  return (
    <header className="rg-topbar">
      <Link href="/redesign" className="flex items-c gap-3">
        <RecgonMark size={32} />
        <span style={{ fontFamily: 'var(--font-fraunces, serif)', fontSize: 20, letterSpacing: '-0.02em' }}>
          Recgon
        </span>
        <VintageChip tone="neutral">v2 / preview</VintageChip>
      </Link>
      <nav className="flex items-c gap-6">
        <a href="#why" className="t-small ink-soft">Why</a>
        <a href="#how" className="t-small ink-soft">How</a>
        <a href="#numbers" className="t-small ink-soft">Numbers</a>
        <Link href="/login" className="rg-btn rg-btn--ghost rg-btn--mono">Sign in</Link>
        <Link href="/register" className="rg-btn rg-btn--ink rg-btn--mono">Start →</Link>
      </nav>
    </header>
  );
}

/* ---------- HERO ---------- */

function Hero() {
  return (
    <section className="page-shell page-shell--wide" style={{ paddingTop: 0 }}>
      <div className="hero-grid">
        {/* LEFT: editorial hero copy */}
        <div className="col gap-6 relative z-1">
          <Eyebrow>
            <Stamp>PM_001</Stamp>
            <span className="t-stamp ink-quiet">/</span>
            <Stamp className="ink-soft">a product manager in your corner</Stamp>
          </Eyebrow>

          <h1 className="t-hero rg-fade-up">
            The coach
            <br />
            solo founders
            <br />
            <span className="t-italic accent-pink">don&rsquo;t have.</span>
          </h1>

          <p className="rg-fade-up rg-fade-up--d1" style={{ maxWidth: '46ch', fontSize: 18, lineHeight: 1.55, color: 'var(--rg-ink-soft)' }}>
            Recgon reads your codebase, your analytics, and your users&rsquo; complaints — then tells you the truth, in writing, like a senior PM who already knows the work.
          </p>

          <div className="flex items-c gap-3 rg-fade-up rg-fade-up--d2" style={{ marginTop: 8 }}>
            <Link href="/register" className="rg-btn rg-btn--ink">
              Get the briefing →
            </Link>
            <Link href="#how" className="rg-btn rg-btn--paper">
              See how it thinks
            </Link>
          </div>

          <div className="flex items-c gap-6 rg-fade-up rg-fade-up--d3" style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--rg-rule)' }}>
            <MiniStat stamp="ANALYSES_RUN" value="14,326" delta="+18%" />
            <MiniStat stamp="MEDIAN_TIME" value="5.2s" delta="P95 ≤ 9s" />
            <MiniStat stamp="ACCURACY" value="91%" delta="self-graded" />
          </div>
        </div>

        {/* RIGHT: 3D Product Compass */}
        <div className="relative">
          <SceneHost
            corners={{
              tl: <span>FIG_01 · PRODUCT_COMPASS</span>,
              tr: <span>ROT_0.18·R/S</span>,
              br: <span>RECGON.APP / 2026</span>,
            }}
          />
          <div className="halftone-bg" style={{ borderRadius: 'var(--rg-r-card)', overflow: 'hidden' }} />
          {/* Discipline labels — float around the canvas */}
          <DisciplineLabels />
        </div>
      </div>
    </section>
  );
}

function MiniStat({ stamp, value, delta }: { stamp: string; value: string; delta: string }) {
  return (
    <div className="col" style={{ minWidth: 0 }}>
      <span className="t-stamp">{stamp}</span>
      <span style={{ fontFamily: 'var(--font-fraunces, serif)', fontSize: 22, letterSpacing: '-0.02em', color: 'var(--rg-ink)' }}>
        {value}
      </span>
      <span className="mono" style={{ fontSize: 11, color: 'var(--rg-ink-quiet)' }}>{delta}</span>
    </div>
  );
}

function DisciplineLabels() {
  // Absolute-positioned chips around the scene; they don't move with the 3D
  // (per DESIGN.md the canvas labels use HTML, not three.js Text).
  const labels = [
    { text: 'ANALYTICS', tone: 'ochre' as const, top: '14%', left: '-6%' },
    { text: 'FEEDBACK', tone: 'sage' as const, top: '24%', right: '-2%' },
    { text: 'ROADMAP', tone: 'rust' as const, bottom: '14%', right: '6%' },
    { text: 'MARKETING', tone: 'pink' as const, bottom: '20%', left: '-4%' },
  ];
  return (
    <>
      {labels.map((l, i) => (
        <div
          key={i}
          className="rg-fade-up"
          style={{
            position: 'absolute',
            ...l,
            animationDelay: `${600 + i * 120}ms`,
          }}
        >
          <VintageChip tone={l.tone} dot>{l.text}</VintageChip>
        </div>
      ))}
    </>
  );
}

/* ---------- DISCIPLINES SECTION ---------- */

function DisciplinesSection() {
  return (
    <section id="why" className="page-shell">
      <header className="rg-page-header">
        <div className="rg-page-header__stamp-row">
          <Stamp>SECTION_02</Stamp>
          <span className="t-stamp ink-quiet">/</span>
          <Stamp className="ink-soft">what it watches over</Stamp>
        </div>
        <h2 className="t-display">Four disciplines, one editor.</h2>
        <p className="rg-page-header__sub">
          Recgon is not four chatbots in a trench coat. It&rsquo;s one editor that <em>writes</em> your roadmap from four feeds at once.
        </p>
        <InkRule size="tight" />
      </header>

      <div className="data-grid data-grid--2 mt-4">
        {/* Card 1 — Codebase health */}
        <PaperCard interactive>
          <div className="flex items-s justify-b mb-4">
            <div>
              <Stamp>D_01 / CODEBASE</Stamp>
              <h3 className="t-h2 mt-4" style={{ marginBottom: 6 }}>Reads the work, not the brief.</h3>
              <p className="t-small">Static analysis + semantic review across your repo. Health score, top liabilities, three things a senior would change first.</p>
            </div>
            <ProgressRing value={78} size={92} stroke={6} label="HEALTH" tone="sage" />
          </div>
          <InkRule size="tight" />
          <BarSpark
            data={[
              { label: 'CLARITY', value: 82, tone: 'sage' },
              { label: 'CONSISTENCY', value: 71, tone: 'sage' },
              { label: 'COVERAGE', value: 54, tone: 'ochre' },
              { label: 'COUPLING', value: 38, tone: 'rust' },
            ]}
          />
        </PaperCard>

        {/* Card 2 — Feedback */}
        <PaperCard interactive>
          <div className="flex items-s justify-b mb-4">
            <div>
              <Stamp>D_02 / FEEDBACK</Stamp>
              <h3 className="t-h2 mt-4" style={{ marginBottom: 6 }}>Hears your users in clusters.</h3>
              <p className="t-small">Themes, sentiment, and bug-prompts pulled from your channels. Themes plot themselves; you know where the pain is dense.</p>
            </div>
            <VintageChip tone="sage" dot>+POSITIVE 64%</VintageChip>
          </div>
          <InkRule size="tight" />
          <ThemeBubbleMap
            width={460}
            height={180}
            themes={[
              { label: 'onboarding', count: 28, tone: 'rust' },
              { label: 'pricing', count: 14, tone: 'ochre' },
              { label: 'speed', count: 22, tone: 'sage' },
              { label: 'mobile', count: 9, tone: 'quiet' },
              { label: 'export', count: 6, tone: 'pink' },
            ]}
          />
        </PaperCard>

        {/* Card 3 — Analytics */}
        <PaperCard interactive>
          <div className="flex items-s justify-b mb-4">
            <div>
              <Stamp>D_03 / ANALYTICS</Stamp>
              <h3 className="t-h2 mt-4" style={{ marginBottom: 6 }}>Numbers, with a verdict.</h3>
              <p className="t-small">Six GA4 reports rolled into one editorial paragraph. The chart shows the story; the paragraph names the villain.</p>
            </div>
          </div>
          <InkRule size="tight" />
          <div className="data-grid data-grid--3" style={{ gap: 14 }}>
            <StatBlock stamp="SESSIONS_7D" value={12480} delta="+18.4%" trend={[40, 44, 41, 52, 58, 61, 70, 82]} tone="sage" />
            <StatBlock stamp="SIGNUPS" value={392} delta="+9.1%" trend={[10, 12, 15, 14, 18, 21, 24, 28]} tone="sage" />
            <StatBlock stamp="BOUNCE" value={48} suffix="%" delta="-3.2pp" trend={[60, 58, 56, 55, 54, 52, 51, 48]} tone="ochre" />
          </div>
        </PaperCard>

        {/* Card 4 — Marketing */}
        <PaperCard interactive>
          <div className="flex items-s justify-b mb-4">
            <div>
              <Stamp>D_04 / MARKETING</Stamp>
              <h3 className="t-h2 mt-4" style={{ marginBottom: 6 }}>Drafts the campaign, not the slogan.</h3>
              <p className="t-small">Instagram, TikTok, and Google Ads writeups grounded in your brand voice and the week&rsquo;s actual data, not vibes.</p>
            </div>
          </div>
          <InkRule size="tight" />
          <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
            <VintageChip tone="pink">INSTAGRAM · 3 drafts</VintageChip>
            <VintageChip tone="ochre">TIKTOK · 2 hooks</VintageChip>
            <VintageChip tone="sage">GOOGLE ADS · keyword set</VintageChip>
            <VintageChip>BLOG · 1 longform brief</VintageChip>
          </div>
          <p className="mt-4 t-small" style={{ paddingLeft: 12, borderLeft: '2px solid var(--rg-signature)' }}>
            “Lead with the &lsquo;90-second product audit&rsquo; — your audience is showing high intent on speed and fewer clicks. Avoid claims around mobile until the iOS bug is fixed.”
            <br />
            <span className="ink-quiet mono" style={{ fontSize: 10, marginTop: 6, display: 'inline-block' }}>— editor&rsquo;s note, attached to every draft</span>
          </p>
        </PaperCard>
      </div>
    </section>
  );
}

/* ---------- PULL-QUOTE BREAK ---------- */

function PullQuoteBreak() {
  return (
    <section className="page-shell page-shell--narrow text-c" style={{ padding: '80px 24px' }}>
      <WaxStamp>EDITOR&rsquo;S NOTE</WaxStamp>
      <p className="pullquote mt-8" style={{ marginInline: 'auto' }}>
        “Most founders ship without a PM. <span className="accent-pink t-italic">Recgon writes the brief no one was going to write.</span>”
      </p>
      <p className="t-small ink-quiet mt-4" style={{ fontFamily: 'var(--font-jetbrains, monospace)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        — internal mandate · v.2026.04
      </p>
    </section>
  );
}

/* ---------- HOW IT THINKS ---------- */

function HowItThinksSection() {
  const events = [
    { date: '2026-04-30T08:00', label: 'INGEST', tone: 'quiet' as const },
    { date: '2026-04-30T08:01', label: 'CODEBASE', tone: 'ochre' as const },
    { date: '2026-04-30T08:02', label: 'FEEDBACK', tone: 'sage' as const },
    { date: '2026-04-30T08:03', label: 'ANALYTICS', tone: 'rust' as const },
    { date: '2026-04-30T08:04', label: 'SYNTHESIS', tone: 'pink' as const },
    { date: '2026-04-30T08:05', label: 'BRIEF→YOU', tone: 'ink' as const },
  ];
  return (
    <section id="how" className="page-shell">
      <header className="rg-page-header">
        <div className="rg-page-header__stamp-row">
          <Stamp>SECTION_03</Stamp>
          <span className="t-stamp ink-quiet">/</span>
          <Stamp className="ink-soft">how it thinks</Stamp>
        </div>
        <h2 className="t-display">Six steps. Five seconds. One paragraph that lands.</h2>
        <InkRule size="tight" />
      </header>

      <PaperCard recessed>
        <TimelineRibbon events={events} />
      </PaperCard>

      <div className="data-grid data-grid--3 mt-8">
        {[
          { stamp: 'STEP_01', title: 'It reads what you have.', body: 'Repos. Sheets. GA4. Feedback channels. It pulls the artifact, not the summary.' },
          { stamp: 'STEP_02', title: 'It compares to last week.', body: 'Drift, regressions, surprise wins. The mentor in your corner is the one who remembers.' },
          { stamp: 'STEP_03', title: 'It writes the brief.', body: 'Two paragraphs, three priorities, one disagreement with you. Stored, citable, reversible.' },
        ].map((s, i) => (
          <PaperCard key={i}>
            <Stamp>{s.stamp}</Stamp>
            <h3 className="t-h3 mt-4" style={{ marginBottom: 8 }}>{s.title}</h3>
            <p className="t-small">{s.body}</p>
          </PaperCard>
        ))}
      </div>
    </section>
  );
}

/* ---------- NUMBERS ---------- */

function NumbersSection() {
  return (
    <section id="numbers" className="page-shell">
      <header className="rg-page-header">
        <div className="rg-page-header__stamp-row">
          <Stamp>SECTION_04</Stamp>
          <span className="t-stamp ink-quiet">/</span>
          <Stamp className="ink-soft">what founders see</Stamp>
        </div>
        <h2 className="t-display">Numbers, set in type.</h2>
        <InkRule size="tight" />
      </header>

      <div className="data-grid data-grid--4">
        <StatBlock stamp="MEDIAN_BRIEF" value={5.2} suffix="s" delta="P95 = 9s" trend={[9, 8, 7.5, 6.8, 6.4, 6.1, 5.6, 5.2]} tone="sage" />
        <StatBlock stamp="DISAGREEMENTS" value={3.1} delta="per analysis" trend={[2, 2.4, 2.7, 2.9, 3.0, 3.1, 3.1, 3.1]} tone="ochre" />
        <StatBlock stamp="FOUNDERS" value={1284} delta="+212 this month" trend={[800, 840, 900, 1000, 1080, 1170, 1230, 1284]} tone="sage" />
        <StatBlock stamp="SIGNAL_TO_NOISE" value={84} suffix="%" delta="+6pp QoQ" trend={[68, 70, 72, 74, 76, 79, 82, 84]} tone="sage" />
      </div>
    </section>
  );
}

/* ---------- CLOSING CTA ---------- */

function ClosingCta() {
  return (
    <section className="page-shell page-shell--narrow" style={{ paddingTop: 32, paddingBottom: 96 }}>
      <PaperCard>
        <div className="flex items-c justify-b gap-6" style={{ flexWrap: 'wrap' }}>
          <div>
            <Stamp>NEXT_STEP</Stamp>
            <h3 className="t-display" style={{ marginTop: 8, marginBottom: 8, fontSize: '2rem' }}>
              Get the first brief in five seconds.
            </h3>
            <p className="t-small">Free trial. No card. The mentor is patient.</p>
          </div>
          <div className="flex items-c gap-3">
            <Link href="/register" className="rg-btn rg-btn--pink">Start →</Link>
            <Link href="/login" className="rg-btn rg-btn--paper">Sign in</Link>
          </div>
        </div>
      </PaperCard>
    </section>
  );
}

/* ---------- FOOTER ---------- */

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--rg-rule)', padding: '32px clamp(20px, 4vw, 48px)', position: 'relative', zIndex: 1 }}>
      <div className="page-shell page-shell--wide flex items-c justify-b gap-6" style={{ paddingTop: 0, paddingBottom: 0, flexWrap: 'wrap' }}>
        <div className="flex items-c gap-3">
          <RecgonMark size={28} />
          <span className="t-small">© 2026 Recgon — set in Fraunces, Inter, JetBrains Mono.</span>
        </div>
        <div className="flex items-c gap-6">
          <a href="https://recgon.app" className="t-stamp ink-quiet">PROD →</a>
          <Link href="/redesign" className="t-stamp accent-pink">PREVIEW V2</Link>
          <a href="https://github.com/" className="t-stamp ink-quiet">GH</a>
        </div>
      </div>
    </footer>
  );
}
