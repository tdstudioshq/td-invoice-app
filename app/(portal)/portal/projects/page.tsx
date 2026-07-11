import { FolderKanban } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectList } from "@/components/portal/project-list";
import { EmptyState } from "@/components/shared/empty-state";
import { requirePortalUser } from "@/lib/auth";
import { getClientProjects, getProjectFileCounts } from "@/lib/data";
import { isPortalVisibleProject } from "@/lib/projects";

export const metadata = { title: "Projects" };

export default async function PortalProjectsPage() {
  const portal = await requirePortalUser();
  if (!portal) return null;

  const [projects, fileCounts] = await Promise.all([
    getClientProjects(portal.clientId),
    getProjectFileCounts(portal.clientId),
  ]);

  // RLS already hides drafts/archived; defense in depth.
  const visible = projects
    .filter(isPortalVisibleProject)
    .map((p) => ({ ...p, file_count: fileCounts[p.id] ?? 0 }));

  return (
    <>
      <PageHeader
        title="Projects"
        description="Track the work TD Studios is doing for you."
      />
      {visible.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Projects will appear here once work begins."
        />
      ) : (
        <ProjectList
          projects={visible}
          hrefFor={(id) => `/portal/projects/${id}`}
        />
      )}
    </>
  );
}
