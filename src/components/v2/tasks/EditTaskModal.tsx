'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal, Button, FormField } from '@/components/ui';

// Phase C — owner/creator task edit. PATCHes { action: 'edit' } with only
// the fields that actually changed; the server invalidates + re-reframes
// the personalized text when the description moves.

export interface EditableTask {
  id: string;
  teamId: string;
  title: string;
  description: string;
  priority: number;
  deadline: string | null;
}

export function EditTaskModal({
  open,
  onOpenChange,
  task,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: EditableTask;
  onSaved: () => void;
}) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState(String(task.priority));
  const [deadline, setDeadline] = useState(task.deadline ? task.deadline.slice(0, 10) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever a different task is opened.
  useEffect(() => {
    if (!open) return;
    setTitle(task.title);
    setDescription(task.description);
    setPriority(String(task.priority));
    setDeadline(task.deadline ? task.deadline.slice(0, 10) : '');
    setError(null);
  }, [open, task.id, task.title, task.description, task.priority, task.deadline]);

  const submit = async () => {
    if (submitting || !title.trim()) return;
    const body: Record<string, unknown> = { action: 'edit' };
    if (title.trim() !== task.title) body.title = title.trim();
    if (description.trim() !== task.description) body.description = description.trim();
    if (Number(priority) !== task.priority) body.priority = Number(priority);
    const originalDeadline = task.deadline ? task.deadline.slice(0, 10) : '';
    if (deadline !== originalDeadline) body.deadline = deadline || null;
    if (Object.keys(body).length === 1) {
      onOpenChange(false);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || t('editTask.failed'));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('editTask.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}
      title={t('editTask.title')}
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
            {t('editTask.save')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <FormField label={t('editTask.fields.title')} htmlFor="edit-task-title" required>
          <input
            id="edit-task-title"
            className="ui-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            autoFocus
          />
        </FormField>
        <FormField
          label={t('editTask.fields.description')}
          htmlFor="edit-task-desc"
          hint={t('editTask.reframeNote')}
        >
          <textarea
            id="edit-task-desc"
            className="ui-input"
            rows={4}
            value={description}
            maxLength={4000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label={t('editTask.fields.priority')} htmlFor="edit-task-prio">
            <select
              id="edit-task-prio"
              className="ui-input"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="1">{t('editTask.priorityOptions.low')}</option>
              <option value="2">{t('editTask.priorityOptions.normal')}</option>
              <option value="3">{t('editTask.priorityOptions.high')}</option>
            </select>
          </FormField>
          <FormField label={t('editTask.fields.deadline')} htmlFor="edit-task-deadline">
            <input
              id="edit-task-deadline"
              type="date"
              className="ui-input"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </FormField>
        </div>
        {error && <p className="ui-field-error">{error}</p>}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
