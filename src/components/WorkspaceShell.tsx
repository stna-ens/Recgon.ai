import TopNavV2 from '@/components/v2/TopNavV2';
import CommandPaletteHost from '@/components/v2/CommandPaletteHost';
import CreateTaskHost from '@/components/v2/CreateTaskHost';

export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="v2-shell">
      <TopNavV2 />
      <CommandPaletteHost />
      <CreateTaskHost />
      <main className="v2-main">
        <div className="v2-container">{children}</div>
      </main>

      <style>{`
        .v2-shell {
          height: 100vh;
          overflow-y: auto;
          overflow-x: hidden;
          position: relative;
          --font-mono: 'JetBrains Mono', ui-monospace, monospace;
          --rule: rgba(255, 255, 255, 0.06);
          --rule-strong: rgba(255, 255, 255, 0.12);
          --bg-card: rgba(20, 20, 22, 0.55);
          --bg-page: rgba(0, 0, 0, 0.30);

          --v2-surface-1: oklch(17% 0.006 350);
          --v2-surface-2: oklch(20% 0.008 350);
          --v2-surface-3: oklch(24% 0.010 350);
          --v2-ink:        oklch(96% 0.005 350);
          --v2-ink-muted:  oklch(72% 0.008 350);
          --v2-ink-faint:  oklch(52% 0.010 350);
          --v2-accent:     var(--signature);
          --v2-success:    var(--success);
          --v2-warn:       var(--warning);
          --v2-danger:     var(--danger);
          --v2-info:       var(--info);

          --v2-fill-1: rgba(255, 255, 255, 0.026);
          --v2-fill-2: rgba(255, 255, 255, 0.045);
          --v2-fill-3: rgba(255, 255, 255, 0.08);
          --v2-fill-inset: rgba(255, 255, 255, 0.022);
          --v2-edge-top: rgba(255, 255, 255, 0.04);
          --v2-shadow-soft: 0 18px 40px -20px rgba(0, 0, 0, 0.38);
          --v2-shadow-strong: 0 22px 50px -22px rgba(0, 0, 0, 0.45);
          --cal-chip-bg: #111114;
        }
        .v2-shell .cal-chip { background: var(--cal-chip-bg) !important; }
        html.light .v2-shell,
        .light .v2-shell {
          --cal-chip-bg: #ffffff;
          --rule: rgba(0, 0, 0, 0.10);
          --rule-strong: rgba(0, 0, 0, 0.20);
          --bg-card: rgba(255, 255, 255, 0.86);
          --bg-page: oklch(94% 0.006 350);
          --v2-surface-1: oklch(96% 0.004 350);
          --v2-surface-2: oklch(93% 0.006 350);
          --v2-surface-3: oklch(90% 0.008 350);
          --v2-ink:        oklch(18% 0.010 350);
          --v2-ink-muted:  oklch(40% 0.012 350);
          --v2-ink-faint:  oklch(56% 0.012 350);

          --v2-fill-1: rgba(20, 18, 24, 0.028);
          --v2-fill-2: rgba(20, 18, 24, 0.05);
          --v2-fill-3: rgba(20, 18, 24, 0.075);
          --v2-fill-inset: rgba(20, 18, 24, 0.035);
          --v2-edge-top: rgba(255, 255, 255, 0.6);
          --v2-shadow-soft: 0 10px 24px -14px rgba(0, 0, 0, 0.10), 0 0 0 1px rgba(0, 0, 0, 0.04);
          --v2-shadow-strong: 0 16px 32px -18px rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.05);
        }

        .v2-main {
          padding-top: 84px;
          padding-bottom: 56px;
        }
        .v2-container {
          width: 100%;
          margin: 0;
          padding: 8px 56px 0;
        }
        @media (max-width: 1280px) {
          .v2-container { padding: 8px 36px 0; }
        }
        @media (max-width: 720px) {
          .v2-container { padding: 12px 20px 0; }
        }
        .v2-shell:has(.personal-cal-root) .v2-container {
          padding-right: 16px !important;
        }

        .v2-shell .glass-card.is-static:hover {
          transform: none;
        }

        /* Mouse focus stays chrome-free; keyboard focus keeps the global
           signature :focus-visible ring defined in globals.css. */
        .v2-shell input:focus:not(:focus-visible),
        .v2-shell textarea:focus:not(:focus-visible) {
          box-shadow: none;
          outline: none;
        }
        .v2-shell .glass-card.is-tight { padding: 18px 24px; }
        .v2-shell .glass-card.is-roomy { padding: 36px; }

        html.light .v2-shell,
        .light .v2-shell {
          --txt-faint: #78757f;
          --txt-muted: #56535e;
        }

        html.light body:has(.v2-shell) {
          background:
            radial-gradient(1100px 600px at 18% -10%, rgba(var(--signature-rgb), 0.07), transparent 60%),
            radial-gradient(900px 500px at 90% 110%, rgba(120, 140, 200, 0.05), transparent 60%),
            #ecebee;
        }

        html.light .v2-shell .glass-card,
        .light .v2-shell .glass-card {
          background:
            rgba(255, 255, 255, 0.86) padding-box,
            linear-gradient(135deg,
              rgba(var(--signature-rgb), 0.28) 0%,
              rgba(0, 0, 0, 0.06) 50%,
              rgba(var(--signature-rgb), 0.18) 100%) border-box;
          border: 1px solid transparent;
          box-shadow:
            0 14px 36px -18px rgba(20, 14, 30, 0.14),
            0 0 0 1px rgba(0, 0, 0, 0.045),
            inset 0 1px 0 rgba(255, 255, 255, 0.75);
        }
        html.light .v2-shell .glass-card:hover,
        .light .v2-shell .glass-card:hover {
          box-shadow:
            0 0 0 1px rgba(var(--signature-rgb), 0.55),
            0 18px 36px -16px rgba(var(--signature-rgb), 0.22),
            inset 0 1px 0 rgba(255, 255, 255, 0.8);
        }

        html.light .v2-topnav,
        .light .v2-shell .v2-topnav {
          box-shadow:
            0 10px 30px -12px rgba(20, 14, 30, 0.12),
            0 0 0 1px rgba(0, 0, 0, 0.06);
        }

        html.light .v2-shell .v2-fc-right,
        .light .v2-shell .v2-fc-right {
          background: #ffffff !important;
          border-color: rgba(0, 0, 0, 0.07);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
        }
        html.light .v2-shell .v2-fc-callout,
        .light .v2-shell .v2-fc-callout {
          background: rgba(255, 255, 255, 0.65);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
        }

        html.light .v2-shell .v2-home-pf-link:hover,
        .light .v2-shell .v2-home-pf-link:hover {
          background: rgba(20, 14, 30, 0.04);
        }
        html.light .v2-shell .v2-bd-dec,
        .light .v2-shell .v2-bd-dec {
          background: rgba(20, 14, 30, 0.025) !important;
        }
        html.light .v2-shell .v2-products-card,
        .light .v2-shell .v2-products-card {
          box-shadow:
            0 10px 26px -16px rgba(20, 14, 30, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.65) !important;
        }
        html.light .v2-shell .v2-products-meta,
        .light .v2-shell .v2-products-meta {
          background: rgba(20, 14, 30, 0.03) !important;
        }
        html.light .v2-shell .v2-kbd,
        .light .v2-shell .v2-kbd {
          background: rgba(20, 14, 30, 0.05) !important;
        }

        html.light .v2-shell .v2-bd-col-link:hover,
        .light .v2-shell .v2-bd-col-link:hover {
          background: rgba(20, 14, 30, 0.08) !important;
          border-color: rgba(20, 14, 30, 0.18) !important;
        }
        html.light .v2-shell .v2-bd-load-glyph,
        .light .v2-shell .v2-bd-load-glyph {
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.10) !important;
        }

        html.light .v2-shell .v2-products-card,
        .light .v2-shell .v2-products-card {
          background: rgba(255, 255, 255, 0.78) !important;
        }
        html.light .v2-shell .v2-products-mini,
        .light .v2-shell .v2-products-mini {
          background: rgba(20, 14, 30, 0.03) !important;
        }
        html.light .v2-shell .v2-products-status,
        .light .v2-shell .v2-products-status {
          background: rgba(20, 14, 30, 0.035) !important;
        }
        html.light .v2-shell .v2-products-callout,
        .light .v2-shell .v2-products-callout {
          background: rgba(20, 14, 30, 0.04) !important;
        }
        html.light .v2-shell .v2-products-section,
        .light .v2-shell .v2-products-section {
          background: rgba(20, 14, 30, 0.025) !important;
        }
        html.light .v2-shell .v2-products-avatar,
        .light .v2-shell .v2-products-avatar {
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.55),
            0 6px 14px rgba(20, 14, 30, 0.10) !important;
        }

        html.light .v2-shell .v2-pr-row,
        .light .v2-shell .v2-pr-row {
          background: rgba(20, 14, 30, 0.025) !important;
        }
        html.light .v2-shell .v2-pr-row:hover,
        .light .v2-shell .v2-pr-row:hover {
          background: rgba(20, 14, 30, 0.045) !important;
        }
        html.light .v2-shell .v2-pr-own-mine,
        .light .v2-shell .v2-pr-own-mine {
          background: rgba(20, 14, 30, 0.035) !important;
        }
        html.light .v2-shell .v2-pr-cell,
        .light .v2-shell .v2-pr-cell {
          background: rgba(20, 14, 30, 0.025) !important;
        }
        html.light .v2-shell .v2-pr-mini,
        .light .v2-shell .v2-pr-mini {
          background: rgba(20, 14, 30, 0.04) !important;
        }

        html.light .v2-shell .v2-fna-mini,
        .light .v2-shell .v2-fna-mini {
          background: rgba(20, 14, 30, 0.03) !important;
        }

        html.light .v2-shell input[type="text"],
        html.light .v2-shell input[type="search"],
        html.light .v2-shell input[type="email"],
        html.light .v2-shell input:not([type]),
        html.light .v2-shell textarea {
          background: rgba(255, 255, 255, 0.7);
          border-color: rgba(0, 0, 0, 0.10);
        }
        html.light .v2-shell input:focus,
        html.light .v2-shell textarea:focus {
          background: rgba(255, 255, 255, 0.95);
          border-color: rgba(var(--signature-rgb), 0.5);
        }

        html.light .v2-shell .v2-sec-idx-num,
        .light .v2-shell .v2-sec-idx-num {
          background: rgba(var(--signature-rgb), 0.18) !important;
          border-color: rgba(var(--signature-rgb), 0.4) !important;
          color: oklch(45% 0.16 350) !important;
        }

        html.light .v2-shell .v2-cockpit[data-home-variant='classic'] .v2-bd-dec,
        .light .v2-shell .v2-cockpit[data-home-variant='classic'] .v2-bd-dec {
          background: rgba(20, 14, 30, 0.026) !important;
        }
        html.light .v2-shell .v2-tasks-search-wrap,
        .light .v2-shell .v2-tasks-search-wrap {
          background: rgba(255, 255, 255, 0.85) !important;
          border-color: rgba(0, 0, 0, 0.10) !important;
        }
        html.light .v2-shell .v2-tasks-col,
        .light .v2-shell .v2-tasks-col {
          background:
            rgba(255, 255, 255, 0.78) padding-box,
            linear-gradient(135deg,
              rgba(0, 0, 0, 0.10) 0%,
              rgba(0, 0, 0, 0.04) 50%,
              rgba(0, 0, 0, 0.08) 100%) border-box !important;
          box-shadow:
            0 14px 32px -18px rgba(20, 14, 30, 0.14),
            0 0 0 1px rgba(0, 0, 0, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.7) !important;
        }
        html.light .v2-shell .v2-tasks-col-empty,
        .light .v2-shell .v2-tasks-col-empty {
          background: rgba(20, 14, 30, 0.025) !important;
        }

        html.light .v2-shell .v2-projects-page input,
        html.light .v2-shell .v2-settings-page input,
        .light .v2-shell .v2-projects-page input,
        .light .v2-shell .v2-settings-page input {
          background: rgba(255, 255, 255, 0.85);
          border-color: rgba(0, 0, 0, 0.10);
        }

        html.light .v2-shell [class*="-inset"],
        html.light .v2-shell [class*="-well"],
        .light .v2-shell [class*="-inset"],
        .light .v2-shell [class*="-well"] {
          background-color: rgba(20, 14, 30, 0.03);
        }

        html.light .v2-shell .week-cal-outer,
        html.light .v2-shell .week-cal-loading,
        html.light .v2-shell .personal-cal-outer,
        html.light .v2-shell .personal-cal-loading,
        .light .v2-shell .week-cal-outer,
        .light .v2-shell .week-cal-loading,
        .light .v2-shell .personal-cal-outer,
        .light .v2-shell .personal-cal-loading {
          background: rgba(255, 255, 255, 0.86) !important;
          border-color: rgba(0, 0, 0, 0.10) !important;
        }
        html.light .v2-shell .cal-chip,
        .light .v2-shell .cal-chip {
          background: transparent !important;
          border-color: rgba(0, 0, 0, 0.10) !important;
        }
        html.light .v2-shell .cal-chip:hover,
        .light .v2-shell .cal-chip:hover {
          border-color: rgba(0, 0, 0, 0.18) !important;
        }
        html.light .v2-shell .cal-lane-label,
        html.light .v2-shell .cal-day-header,
        html.light .v2-shell .cal-corner,
        html.light .v2-shell .cal-unsched-sidebar,
        .light .v2-shell .cal-lane-label,
        .light .v2-shell .cal-day-header,
        .light .v2-shell .cal-corner,
        .light .v2-shell .cal-unsched-sidebar {
          background: oklch(96% 0.005 350) !important;
        }
        html.light .v2-shell .cal-panel,
        .light .v2-shell .cal-panel {
          background: rgba(252, 252, 253, 0.96) !important;
          border-left-color: rgba(0, 0, 0, 0.10) !important;
        }
        html.light .v2-shell .cal-panel-input,
        .light .v2-shell .cal-panel-input {
          color: #1d1d1f !important;
        }
        html.light .v2-shell .cal-panel-input::placeholder,
        .light .v2-shell .cal-panel-input::placeholder {
          color: var(--txt-faint) !important;
        }

        html.light .v2-shell .v2-action-btn,
        html.light .v2-shell .v2-action-icon,
        .light .v2-shell .v2-action-btn,
        .light .v2-shell .v2-action-icon {
          background: rgba(var(--signature-rgb), 0.07) !important;
          border-color: rgba(var(--signature-rgb), 0.22) !important;
          color: oklch(38% 0.015 350) !important;
        }
        html.light .v2-shell .v2-action-btn:hover,
        html.light .v2-shell .v2-action-icon:hover,
        .light .v2-shell .v2-action-btn:hover,
        .light .v2-shell .v2-action-icon:hover {
          background: rgba(var(--signature-rgb), 0.14) !important;
          border-color: rgba(var(--signature-rgb), 0.45) !important;
          color: oklch(22% 0.020 350) !important;
        }
        html.light .v2-shell .v2-action-btn.is-loading,
        .light .v2-shell .v2-action-btn.is-loading {
          color: oklch(45% 0.16 350) !important;
        }
        html.light .v2-shell .v2-meta-divider,
        .light .v2-shell .v2-meta-divider {
          background: rgba(var(--signature-rgb), 0.28) !important;
        }

        html.light .v2-shell .v2-products-summary span,
        html.light .v2-shell .v2-products-filters button,
        .light .v2-shell .v2-products-summary span,
        .light .v2-shell .v2-products-filters button {
          background: rgba(var(--signature-rgb), 0.05) !important;
          border-color: rgba(var(--signature-rgb), 0.18) !important;
        }
        html.light .v2-shell .v2-products-filters button:hover:not(:disabled):not(.is-active),
        .light .v2-shell .v2-products-filters button:hover:not(:disabled):not(.is-active) {
          background: rgba(var(--signature-rgb), 0.10) !important;
          border-color: rgba(var(--signature-rgb), 0.34) !important;
        }
        html.light .v2-shell .v2-products-filters button.is-active,
        .light .v2-shell .v2-products-filters button.is-active {
          background: rgba(var(--signature-rgb), 0.18) !important;
          border-color: rgba(var(--signature-rgb), 0.55) !important;
        }

        html.light .v2-shell .v2-products-shell,
        html.light .v2-shell .v2-fc-shell,
        html.light .v2-shell .v2-bd-col.glass-card,
        .light .v2-shell .v2-products-shell,
        .light .v2-shell .v2-fc-shell,
        .light .v2-shell .v2-bd-col.glass-card {
          box-shadow:
            0 1px 2px rgba(20, 14, 30, 0.04),
            0 8px 22px -14px rgba(60, 30, 50, 0.10),
            0 0 0 1px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.7) !important;
        }
        html.light .v2-shell .v2-products-card,
        .light .v2-shell .v2-products-card {
          box-shadow:
            0 1px 2px rgba(20, 14, 30, 0.03),
            0 6px 16px -10px rgba(60, 30, 50, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.55) !important;
        }
        html.light .v2-shell .glass-card,
        .light .v2-shell .glass-card {
          box-shadow:
            0 1px 2px rgba(20, 14, 30, 0.04),
            0 10px 26px -16px rgba(60, 30, 50, 0.10),
            0 0 0 1px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.7);
        }
        html.light .v2-shell .glass-card:hover,
        .light .v2-shell .glass-card:hover {
          box-shadow:
            0 0 0 1px rgba(var(--signature-rgb), 0.45),
            0 14px 30px -16px rgba(var(--signature-rgb), 0.28),
            inset 0 1px 0 rgba(255, 255, 255, 0.75);
        }

        .v2-container {
          max-width: 1480px;
          margin-left: auto;
          margin-right: auto;
        }
        .v2-shell:has(.v2-tasks) .v2-container,
        .v2-shell:has(.terminal-shell) .v2-container {
          max-width: none;
        }
      `}</style>
    </div>
  );
}
