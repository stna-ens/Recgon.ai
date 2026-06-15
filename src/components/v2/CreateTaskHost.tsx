'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTeam } from '@/components/TeamProvider';
import { CreateTaskModal } from '@/components/v2/tasks/CreateTaskModal';

// Global host for the "+ New Task" flow. Mounted once in WorkspaceShell, it
// listens for the window event 'v2:open-create-task' (dispatched by the
// top-bar button and the command-palette action) and opens a self-fetching
// CreateTaskModal. When the current page is a project page, it seeds the
// modal's project picker with that project id.

export default function CreateTaskHost() {
  const { currentTeam } = useTeam();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('v2:open-create-task', onOpen);
    return () => window.removeEventListener('v2:open-create-task', onOpen);
  }, []);

  if (!currentTeam) return null;

  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const defaultProjectId = projectMatch ? projectMatch[1] : undefined;

  return (
    <CreateTaskModal
      open={open}
      onOpenChange={setOpen}
      teamId={currentTeam.id}
      defaultProjectId={defaultProjectId}
      onCreated={() => window.dispatchEvent(new CustomEvent('v2:task-created'))}
    />
  );
}
