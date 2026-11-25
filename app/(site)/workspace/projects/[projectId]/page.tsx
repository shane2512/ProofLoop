import type { Metadata } from "next";
import { ProjectView } from "@/components/workspace/ProjectView";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Project",
  description: "Acceptance criteria, Kane runs and results for one project.",
};

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <WorkspaceShell>
      <ProjectView projectId={projectId} />
    </WorkspaceShell>
  );
}
