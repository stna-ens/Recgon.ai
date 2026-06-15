'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal, Button, FormField } from '@/components/ui';
import { useToast } from '@/components/Toast';

// Owner manual task-create modal. Reachable from three surfaces — the global
// "+ New Task" top-bar button, the command-palette action, and the command
// center header — all of which open this one component.
//
// Per-task the owner chooses:
//   - Assignee: "Auto" (Recgon picks the best-fit teammate) OR a specific one.
//   - Schedule: empty (Recgon schedules) OR a pinned day.
// Both choices map to the optional assigneeId / scheduledDate fields on
// POST /api/teams/[id]/tasks.

type Teammate = { id: string; displayName: string };
type Project = { id: string; name: string };

const KINDS = ['next_step', 'dev_prompt', 'marketing', 'analytics', 'research', 'custom'] as const;

export function CreateTaskModal({
  open,
  onOpenChange,
  teamId,
  defaultProjectId,
  teammates: teammatesProp,
  projects: projectsProp,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  defaultProjectId?: string;
  teammates?: Teammate[];
  projects?: Project[];
  onCreated: () => void;
}) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const { addToast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [kind, setKind] = useState<string>('custom');
  const [assignee, setAssignee] = useState('auto');
  const [priority, setPriority] = useState('2');
  const [scheduledDate, setScheduledDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the caller passes lists, use them; otherwise self-fetch on open.
  const [teammates, setTeammates] = useState<Teammate[]>(teammatesProp ?? []);
  const [projects, setProjects] = useState<Project[]>(projectsProp ?? []);

  // Re-seed the form on each open.
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setProjectId(defaultProjectId ?? '');
    setKind('custom');
    setAssignee('auto');
    setPriority('2');
    setScheduledDate('');
    setDeadline('');
    setError(null);
  }, [open, defaultProjectId]);

  // Self-fetch teammates + projects when the caller didn't supply them.
  useEffect(() => {
    if (!open) return;
    if (teammatesProp !== undefined && projectsProp !== undefined) {
      setTeammates(teammatesProp);
      setProjects(projectsProp);
      return;
    }
    let cancelled = false;
    if (teammatesProp === undefined) {
      fetch(`/api/teams/${teamId}/teammates`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { teammates: [] }))
        .then((data: { teammates?: Array<{ id: string; displayName: string }> }) => {
          if (cancelled) return;
          setTeammates((data.teammates ?? []).map((tm) => ({ id: tm.id, displayName: tm.displayName })));
        })
        .catch(() => {});
    }
    if (projectsProp === undefined) {
      fetch(`/api/projects?teamId=${teamId}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (cancelled) return;
          const list: Project[] = Array.isArray(data)
            ? data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
            : [];
          setProjects(list);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [open, teamId, teammatesProp, projectsProp]);

  const submit = async () => {
    if (submitting || !title.trim()) return;
    const body: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim(),
      kind,
      projectId: projectId || null,
      priority: Number(priority),
      deadline: deadline || null,
    };
    if (assignee !== 'auto') body.assigneeId = assignee;
    if (scheduledDate) body.scheduledDate = scheduledDate;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || t('createTask.failed'));
      if (assignee !== 'auto') {
        const name = teammates.find((tm) => tm.id === assignee)?.displayName ?? '';
        addToast(t('createTask.assignedTo', { name }), 'success');
      } else {
        addToast(t('createTask.queued'), 'success');
      }
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createTask.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v);
      }}
      title={t('createTask.title')}
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
            {t('createTask.newButton')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <FormField label={t('createTask.fields.title')} htmlFor="create-task-title" required>
          <input
            id="create-task-title"
            className="ui-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            autoFocus
          />
        </FormField>

        <FormField label={t('createTask.fields.description')} htmlFor="create-task-desc">
          <textarea
            id="create-task-desc"
            className="ui-input"
            rows={4}
            value={description}
            maxLength={4000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label={t('createTask.fields.project')} htmlFor="create-task-project">
            <select
              id="create-task-project"
              className="ui-input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">{t('createTask.fields.noProject')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('createTask.fields.kind')} htmlFor="create-task-kind">
            <select
              id="create-task-kind"
              className="ui-input"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`createTask.kindOptions.${k}`)}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label={t('createTask.fields.assignee')} htmlFor="create-task-assignee">
            <select
              id="create-task-assignee"
              className="ui-input"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="auto">{t('createTask.autoAssignee')}</option>
              {teammates.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.displayName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('createTask.fields.priority')} htmlFor="create-task-priority">
            <select
              id="create-task-priority"
              className="ui-input"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="1">{t('createTask.priorityOptions.low')}</option>
              <option value="2">{t('createTask.priorityOptions.normal')}</option>
              <option value="3">{t('createTask.priorityOptions.high')}</option>
            </select>
          </FormField>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField
            label={t('createTask.fields.schedule')}
            htmlFor="create-task-schedule"
            hint={t('createTask.autoSchedule')}
          >
            <input
              id="create-task-schedule"
              type="date"
              className="ui-input"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </FormField>
          <FormField label={t('createTask.fields.deadline')} htmlFor="create-task-deadline">
            <input
              id="create-task-deadline"
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
