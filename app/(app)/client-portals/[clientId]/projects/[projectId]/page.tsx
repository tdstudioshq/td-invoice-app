import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { deleteProjectAction } from "@/app/actions/projects";
import { PageHeader } from "@/components/layout/page-header";
import { AdminMultiUpload } from "@/components/portal/admin-multi-upload";
import { AssignFileControl } from "@/components/portal/assign-file-control";
import { FileList } from "@/components/portal/file-list";
import { ProjectEditForm } from "@/components/portal/project-edit-form";
import { ProjectStatusBadge } from "@/components/portal/project-status-badge";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getClient,
  getClientFiles,
  getClientFolders,
  getClientProject,
  getClientProjects,
} from "@/lib/data";

export async function generateMetadata(
  props: PageProps<"/client-portals/[clientId]/projects/[projectId]">,
) {
  const { projectId } = await props.params;
  const project = await getClientProject(projectId);
  return { title: project ? `${project.name} — Project` : "Project" };
}

export default async function AdminProjectPage(
  props: PageProps<"/client-portals/[clientId]/projects/[projectId]">,
) {
  const { clientId, projectId } = await props.params;
  const [client, project] = await Promise.all([
    getClient(clientId),
    getClientProject(projectId),
  ]);
  if (!client || !project || project.client_id !== clientId) notFound();

  const [projectFiles, allFiles, folders, projects] = await Promise.all([
    getClientFiles(clientId, { projectId }),
    getClientFiles(clientId),
    getClientFolders(clientId),
    getClientProjects(clientId),
  ]);
  const unassignedFiles = allFiles.filter((f) => !f.project_id);

  return (
    <div className="mx-auto max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/client-portals/${clientId}`}>
          <ArrowLeft />
          {client.company_name}
        </Link>
      </Button>

      <PageHeader title={project.name} description={client.company_name}>
        <ProjectStatusBadge status={project.status} />
        <ConfirmDeleteDialog
          action={deleteProjectAction.bind(null, clientId)}
          id={project.id}
          title="Delete project?"
          description="Files stay in the client's library — they are just unassigned from this project."
          triggerLabel="Delete project"
        />
      </PageHeader>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Project details</CardTitle>
            <CardDescription>
              The client sees the name, description, status, and due date in
              their portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectEditForm project={project} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Files in this project</CardTitle>
            <CardDescription>
              Upload new files, attach existing ones, or archive files to hide
              them from the portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FileList
              files={projectFiles}
              clientId={clientId}
              admin
              archiveToggle
              assignableProjects={projects}
            />

            <div className="border-border space-y-4 border-t pt-6">
              <AssignFileControl
                clientId={clientId}
                projectId={project.id}
                unassignedFiles={unassignedFiles}
              />
              <div>
                <h3 className="mb-3 text-sm font-medium">Upload to this project</h3>
                <AdminMultiUpload
                  clientId={clientId}
                  folders={folders}
                  fixedProjectId={project.id}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
