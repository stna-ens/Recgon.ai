import ProjectShell from '@/components/v2/ProjectShell';

export default async function V2ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="v2-project-layout">
      <ProjectShell projectId={id} />
      {children}
    </div>
  );
}
