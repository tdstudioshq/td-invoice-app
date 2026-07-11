import type { ComponentProps } from "react";
import { CalendarDays, Paperclip } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { FileList } from "@/components/portal/file-list";
import { ProjectStatusBadge } from "@/components/portal/project-status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { ClientFile, ClientProject } from "@/lib/types/database";

/**
 * Presentational project detail (header + files card), shared by the portal
 * page and the admin "view as client" preview. Pages own data fetching and
 * guards; extra FileList behavior (admin controls) rides in via fileListProps.
 */
export function ProjectDetailContent({
  project,
  files,
  clientId,
  fileListProps,
}: {
  project: ClientProject;
  files: ClientFile[];
  clientId: string;
  fileListProps?: Partial<ComponentProps<typeof FileList>>;
}) {
  return (
    <>
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
      >
        <div className="flex flex-wrap items-center gap-3">
          <ProjectStatusBadge status={project.status} />
          {project.due_date ? (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <CalendarDays className="size-3.5" />
              Due {formatDate(project.due_date)}
            </span>
          ) : null}
        </div>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Paperclip className="size-4" />
            Files
          </CardTitle>
          <CardDescription>
            {files.length === 0
              ? "No files in this project yet."
              : `${files.length} ${files.length === 1 ? "file" : "files"} in this project.`}
          </CardDescription>
        </CardHeader>
        {files.length > 0 ? (
          <CardContent>
            <FileList files={files} clientId={clientId} {...fileListProps} />
          </CardContent>
        ) : null}
      </Card>
    </>
  );
}
