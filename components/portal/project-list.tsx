import Link from "next/link";
import { ArrowRight, CalendarDays, Paperclip } from "lucide-react";

import { ProjectStatusBadge } from "@/components/portal/project-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { ClientProjectWithFileCount } from "@/lib/types/database";

/**
 * Presentational project card grid, shared by the portal pages and the admin
 * "view as client" preview — the caller decides where each card links.
 */
export function ProjectList({
  projects,
  hrefFor,
}: {
  projects: ClientProjectWithFileCount[];
  hrefFor: (projectId: string) => string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {projects.map((project) => (
        <Link key={project.id} href={hrefFor(project.id)} className="group">
          <Card className="hover:border-foreground/20 h-full transition-colors">
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate font-medium">{project.name}</p>
                <ArrowRight className="text-muted-foreground mt-1 size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {project.due_date ? (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3.5" />
                    Due {formatDate(project.due_date)}
                  </span>
                ) : null}
                <span className="flex items-center gap-1">
                  <Paperclip className="size-3.5" />
                  {project.file_count}{" "}
                  {project.file_count === 1 ? "file" : "files"}
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
