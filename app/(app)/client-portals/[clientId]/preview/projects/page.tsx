import { notFound } from "next/navigation";
import { FolderKanban } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { PreviewBanner } from "@/components/portal/preview-banner";
import { ProjectList } from "@/components/portal/project-list";
import { EmptyState } from "@/components/shared/empty-state";
import {
  getClient,
  getClientProjects,
  getProjectFileCounts,
} from "@/lib/data";

// Admin "view as client" project list — same visibility filters the portal
// RLS applies (see the preview overview page for the security note).
export const metadata = { title: "Preview — Projects" };

export default async function ClientPortalPreviewProjectsPage(
  props: PageProps<"/client-portals/[clientId]/preview/projects">,
) {
  const { clientId } = await props.params;
  const client = await getClient(clientId);
  if (!client) notFound();

  const [projects, fileCounts] = await Promise.all([
    getClientProjects(clientId, { visibleOnly: true }),
    getProjectFileCounts(clientId, { activeOnly: true }),
  ]);
  const visible = projects.map((p) => ({
    ...p,
    file_count: fileCounts[p.id] ?? 0,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <PreviewBanner
        clientName={client.company_name}
        backHref={`/client-portals/${clientId}`}
      />
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
          hrefFor={(id) => `/client-portals/${clientId}/preview/projects/${id}`}
        />
      )}
    </div>
  );
}
