import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PreviewBanner } from "@/components/portal/preview-banner";
import { ProjectDetailContent } from "@/components/portal/project-detail-content";
import { Button } from "@/components/ui/button";
import { getClient, getClientFiles, getClientProject } from "@/lib/data";
import { isPortalVisibleProject } from "@/lib/projects";

// Admin "view as client" project detail. A draft/archived project 404s here
// exactly as it would for the real portal user (there RLS hides the row).
export async function generateMetadata(
  props: PageProps<"/client-portals/[clientId]/preview/projects/[projectId]">,
) {
  const { projectId } = await props.params;
  const project = await getClientProject(projectId);
  return { title: project ? `Preview — ${project.name}` : "Preview" };
}

export default async function ClientPortalPreviewProjectPage(
  props: PageProps<"/client-portals/[clientId]/preview/projects/[projectId]">,
) {
  const { clientId, projectId } = await props.params;
  const [client, project] = await Promise.all([
    getClient(clientId),
    getClientProject(projectId),
  ]);
  if (
    !client ||
    !project ||
    project.client_id !== clientId ||
    !isPortalVisibleProject(project)
  ) {
    notFound();
  }

  const files = await getClientFiles(clientId, {
    projectId: project.id,
    activeOnly: true,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PreviewBanner
        clientName={client.company_name}
        backHref={`/client-portals/${clientId}/projects/${project.id}`}
      />
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/client-portals/${clientId}/preview/projects`}>
          <ArrowLeft />
          All projects
        </Link>
      </Button>
      <ProjectDetailContent
        project={project}
        files={files}
        clientId={clientId}
      />
    </div>
  );
}
