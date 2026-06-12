'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal, Button, FormField } from '@/components/ui';

// Minimal shape the parent needs to toast "assigned to X" vs "queued".
export type CreatedTask = { id: string; assignedTo: string | null };

export function NewTaskModal({
  open,
  onOpenChange,
  teamId,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  projectId: string;
  onCreated: (task: CreatedTask) => void;
}) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (submitting || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          description: description.trim(),
          kind: 'custom',
          deadline: deadline || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || t('newTask.toast.failed'));
      setTitle('');
      setDescription('');
      setDeadline('');
      onOpenChange(false);
      onCreated(j.task as CreatedTask);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newTask.toast.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}
      title={t('newTask.title')}
      description={t('newTask.subtitle')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={submitting}>
            {tCommon('cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={submitting || !title.trim()}
            loading={submitting}
          >
            {tCommon('create')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <FormField label={t('newTask.fields.title')} htmlFor="new-task-title" required>
          <input
            id="new-task-title"
            className="ui-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            autoFocus
          />
        </FormField>
        <FormField label={t('newTask.fields.description')} htmlFor="new-task-desc">
          <textarea
            id="new-task-desc"
            className="ui-input"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <FormField
          label={t('newTask.fields.deadline')}
          htmlFor="new-task-deadline"
          hint={t('newTask.fields.deadlineHint')}
        >
          <input
            id="new-task-deadline"
            type="date"
            className="ui-input"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </FormField>
        {error && <p className="ui-field-error">{error}</p>}
        {/* Hidden submit so Enter in a field submits the form. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
