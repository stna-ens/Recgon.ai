'use client';

import { useState } from 'react';
import * as RSelect from '@radix-ui/react-select';
import { Modal, Button, FormField } from '@/components/ui';

// Radix Select forbids an empty-string item value, so the "none" choice uses a
// sentinel and maps back to '' in state.
const NO_PROJECT = '__none__';

// Minimal shape the parent needs to toast "split into N tasks".
export type CreatedIssue = { id: string; taskCount: number };

export type ProjectOption = { id: string; name: string };

export function NewIssueModal({
  open,
  onOpenChange,
  teamId,
  projects,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  projects: ProjectOption[];
  onCreated: (result: CreatedIssue) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (submitting || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/issues`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          projectId: projectId || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not file the issue.');
      setTitle('');
      setDescription('');
      setProjectId('');
      onOpenChange(false);
      onCreated({ id: j.issue?.id, taskCount: j.taskCount ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not file the issue.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}
      title="New issue"
      description="Describe what needs doing. Recgon breaks it into the right tasks and routes them to the best-fit teammates."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={submitting || !title.trim()}
            loading={submitting}
          >
            {submitting ? 'Splitting…' : 'File issue'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <FormField label="Title" htmlFor="new-issue-title" required>
          <input
            id="new-issue-title"
            className="ui-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="e.g. Add dark mode"
            autoFocus
          />
        </FormField>
        <FormField
          label="Description"
          htmlFor="new-issue-desc"
          hint="The more detail you give, the better Recgon scopes the tasks."
        >
          <textarea
            id="new-issue-desc"
            className="ui-input"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Theme toggle in settings, persist the preference, update the docs…"
          />
        </FormField>
        <FormField
          label="Project"
          htmlFor="new-issue-project"
          hint="Tasks Recgon creates from this issue land in this project."
        >
          <RSelect.Root
            value={projectId || NO_PROJECT}
            onValueChange={(v) => setProjectId(v === NO_PROJECT ? '' : v)}
          >
            <RSelect.Trigger id="new-issue-project" type="button" className="ui-input iss-sel-trigger" aria-label="Project">
              <RSelect.Value />
              <RSelect.Icon className="iss-sel-chev">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
              </RSelect.Icon>
            </RSelect.Trigger>
            <RSelect.Portal>
              <RSelect.Content className="iss-sel-content" position="popper" sideOffset={6}>
                <RSelect.Viewport className="iss-sel-vp">
                  <RSelect.Item value={NO_PROJECT} className="iss-sel-item">
                    <RSelect.ItemText>No specific project</RSelect.ItemText>
                    <RSelect.ItemIndicator className="iss-sel-ind">✓</RSelect.ItemIndicator>
                  </RSelect.Item>
                  {projects.map((p) => (
                    <RSelect.Item key={p.id} value={p.id} className="iss-sel-item">
                      <RSelect.ItemText>{p.name}</RSelect.ItemText>
                      <RSelect.ItemIndicator className="iss-sel-ind">✓</RSelect.ItemIndicator>
                    </RSelect.Item>
                  ))}
                </RSelect.Viewport>
              </RSelect.Content>
            </RSelect.Portal>
          </RSelect.Root>
        </FormField>
        {error && <p className="ui-field-error">{error}</p>}

        <style>{`
          .iss-sel-trigger {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            cursor: pointer; text-align: left; line-height: 1.3;
          }
          .iss-sel-trigger[data-state='open'] {
            border-color: rgba(var(--signature-rgb), 0.55);
            box-shadow: 0 0 0 3px rgba(var(--signature-rgb), 0.12);
          }
          .iss-sel-trigger[data-placeholder] { color: var(--txt-faint); }
          .iss-sel-chev {
            display: inline-flex; color: var(--txt-faint); flex-shrink: 0;
            transition: transform var(--dur-fast) var(--ease-out);
          }
          .iss-sel-trigger[data-state='open'] .iss-sel-chev { transform: rotate(180deg); color: var(--signature); }
          .iss-sel-content {
            z-index: 10000; min-width: var(--radix-select-trigger-width);
            background: var(--glass-substrate);
            backdrop-filter: blur(40px) saturate(180%); -webkit-backdrop-filter: blur(40px) saturate(180%);
            border: 1px solid var(--rule-strong); border-radius: 10px;
            box-shadow: var(--shadow-float), var(--edge-highlight);
            overflow: hidden;
            animation: issSelIn 0.14s var(--ease-out);
          }
          @keyframes issSelIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
          .iss-sel-vp { padding: 5px; }
          .iss-sel-item {
            position: relative; display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding: 8px 10px; border-radius: 7px; cursor: pointer; user-select: none; outline: none;
            font-size: var(--fs-sm); color: var(--txt-muted);
            transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
          }
          .iss-sel-item[data-highlighted] { background: rgba(var(--signature-rgb), 0.08); color: var(--txt-pure); }
          .iss-sel-item[data-state='checked'] { color: var(--signature); font-weight: 600; }
          .iss-sel-ind { display: inline-flex; color: var(--signature); font-size: 11px; }
        `}</style>
        {/* Hidden submit so Enter in a field submits the form. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
