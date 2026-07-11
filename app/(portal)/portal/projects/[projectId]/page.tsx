import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ProjectDetailContent } from "@/components/portal/project-detail-content";
import { Button } from "@/components/ui/button";
import { requirePortalUser } from "@/lib/auth";
import { getClientFiles, getClientProject } from "@/lib/data";

export async function generateMetadata(
  props: PageProps<"/portal/projects/[projectId]">,
) {
  const { projectId } = await props.params;
  const project = await getClientProject(projectId);
  return { title: project?.name ?? "Project" };
}

export default async function PortalProjectDetailPage(
  props: PageProps<"/portal/projects/[projectId]">,
) {
  const portal = await requirePortalUser();
  if (!portal) return null;

  const { projectId } = await props.params;
  // RLS already nulls other clients' and hidden (draft/archived) projects for
  // portal sessions; the client-id equality is defense in depth.
  const project = await getClientProject(projectId);
  if (!project || project.client_id !== portal.clientId) notFound();

  const files = await getClientFiles(portal.clientId, {
    projectId: project.id,
    activeOnly: true,
  });

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/portal/projects">
          <ArrowLeft />
          All projects
        </Link>
      </Button>
      <ProjectDetailContent
        project={project}
        files={files}
        clientId={portal.clientId}
      />
    </>
  );
}
