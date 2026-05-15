// Phase 3.5 / Plan 03.5-02 — Triage Dock pinned above the owner workload grid.
//
// Two states (UI-SPEC §6):
//   - count = 0: collapsed pill (~40px), centered "TRIAGE · CLEAR" with a
//     faint signature glow. No list rendered.
//   - count > 0: expanded glass-card with header "TRIAGE · {n} NEEDS YOUR
//     EYES" (mono 10px UPPER, signature pink) + a <ul> of TriageDockRow items.
//
// `count = triaged.length + deferred.length`. Triaged rows render first,
// deferred rows after — they belong in the same surface (D-13: dock is the
// "needs your eyes" stack regardless of source).
//
// Uses Radix Collapsible only for the toggle scaffold. The dock isn't actually
// user-collapsible this plan (the toggle is implicit on count == 0 vs > 0);
// `defaultOpen={false}` ensures the collapsed pill is the resting state when
// the team is clear.

'use client';

import * as Collapsible from '@radix-ui/react-collapsible';
import type { AgentTask } from '@/lib/recgon/types';
import { TriageDockRow } from './TriageDockRow';

type Props = {
  triaged: AgentTask[];
  deferred: AgentTask[];
  onAssignClick?: (taskId: string) => void;
  onDismissClick?: (taskId: string) => void;
};

export function TriageDock({ triaged, deferred, onAssignClick, onDismissClick }: Props) {
  const count = triaged.length + deferred.length;
  const isCollapsed = count === 0;

  if (isCollapsed) {
    return (
      <Collapsible.Root open={false} data-testid="triage-dock" className="triage-dock is-collapsed">
        <div className="triage-dock-pill">
          <span className="triage-dock-pill-text">TRIAGE · CLEAR</span>
        </div>
        <style>{css}</style>
      </Collapsible.Root>
    );
  }

  return (
    <Collapsible.Root open={true} data-testid="triage-dock" className="triage-dock glass-card">
      <header className="triage-dock-header">
        <span className="triage-dock-header-text">
          TRIAGE · {count} NEEDS YOUR EYES
        </span>
      </header>
      <ul className="triage-dock-list" role="list">
        {triaged.map((task) => (
          <TriageDockRow
            key={task.id}
            task={task}
            isDeferred={false}
            onAssignClick={onAssignClick}
          />
        ))}
        {deferred.map((task) => (
          <TriageDockRow
            key={task.id}
            task={task}
            isDeferred={true}
            onAssignClick={onAssignClick}
            onDismissClick={onDismissClick}
          />
        ))}
      </ul>
      <style>{css}</style>
    </Collapsible.Root>
  );
}

const css = `
.triage-dock {
  display: block;
  border-radius: 20px;
}

.triage-dock.is-collapsed {
  /* Collapsed pill — 40px tall (UI-SPEC §6). Faint signature glow on the
     border to signal "all clear" without competing with the grid below. */
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--signature-rgb), 0.04);
  border: 1px solid rgba(var(--signature-rgb), 0.18);
  box-shadow: 0 0 12px rgba(var(--signature-rgb), 0.05);
}
.triage-dock-pill {
  display: flex;
  align-items: center;
  justify-content: center;
}
.triage-dock-pill-text {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.6px;
  color: var(--signature);
  text-transform: uppercase;
}

.triage-dock.glass-card {
  /* Inherit the .glass-card class from the design system — DO NOT stack
     another translucent layer here (per feedback_glass_treatment). */
  padding: 16px 18px;
}
.triage-dock-header {
  display: flex;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--rule);
  margin-bottom: 12px;
}
.triage-dock-header-text {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.6px;
  color: var(--signature);
  text-transform: uppercase;
}
.triage-dock-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
`;
