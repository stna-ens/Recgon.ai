'use client';

import { useState } from 'react';
import { Modal, Button, FormField, ActionIcon } from '@/components/ui';

// Minimal shape the parent needs to toast "split into N tasks".
export type CreatedIssue = { id: string; taskCount: number };

export function NewIssueModal({
  open,
  onOpenChange,
  teamId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  onCreated: (result: CreatedIssue) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not file the issue.');
      setTitle('');
      setDescription('');
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
          <Button onClick={() => onOpenChange(false)} disabled={submitting} icon={ActionIcon.cancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={submitting || !title.trim()}
            loading={submitting}
            icon={ActionIcon.create}
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
        {error && <p className="ui-field-error">{error}</p>}
        {/* Hidden submit so Enter in a field submits the form. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
