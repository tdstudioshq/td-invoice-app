import Link from "next/link";
import { ArrowRight, FileText, FolderKanban } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { FileList } from "@/components/portal/file-list";
import { ProjectList } from "@/components/portal/project-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  ClientFile,
  ClientProjectWithFileCount,
} from "@/lib/types/database";

export interface PortalOverviewHrefs {
  /** Where a project card links; omit to render non-navigating previews. */
  projects?: (projectId: string) => string;
  projectsIndex?: string;
  files?: string;
  invoices?: string;
}

/**
 * Presentational portal overview (welcome, active projects, recent files,
 * invoice summary), shared by /portal and the admin "view as client" preview.
 * The caller fetches data with portal-visibility filters applied and injects
 * link targets — the preview omits hrefs it doesn't re-implement.
 */
export function PortalOverviewContent({
  welcomeName,
  projects,
  recentFiles,
  openInvoiceCount,
  totalInvoiceCount,
  clientId,
  hrefs,
}: {
  welcomeName: string | null;
  projects: ClientProjectWithFileCount[];
  recentFiles: ClientFile[];
  openInvoiceCount: number;
  totalInvoiceCount: number;
  clientId: string;
  hrefs: PortalOverviewHrefs;
}) {
  const invoiceCard = (
    <Card className="hover:border-foreground/20 h-full transition-colors">
      <CardContent className="flex items-center gap-4 pt-6">
        <div className="bg-muted flex size-10 items-center justify-center">
          <FileText className="size-5" />
        </div>
        <div className="flex-1">
          <p className="text-2xl font-semibold">{openInvoiceCount}</p>
          <p className="text-muted-foreground text-sm">
            Open {openInvoiceCount === 1 ? "invoice" : "invoices"} ·{" "}
            {totalInvoiceCount} total
          </p>
        </div>
        {hrefs.invoices ? (
          <ArrowRight className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </CardContent>
    </Card>
  );

  return (
    <>
      <PageHeader
        title={`Welcome back${welcomeName ? `, ${welcomeName}` : ""}`}
        description="Your projects, files, and invoices from TD Studios — all in one place."
      />

      <div className="space-y-8">
        {/* Active projects */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <FolderKanban className="size-4" />
              Active projects
            </h2>
            {hrefs.projectsIndex && projects.length > 0 ? (
              <Link
                href={hrefs.projectsIndex}
                className="text-muted-foreground hover:text-foreground text-xs transition-colors"
              >
                View all
              </Link>
            ) : null}
          </div>
          {projects.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No active projects right now.
            </p>
          ) : (
            <ProjectList
              projects={projects}
              hrefFor={hrefs.projects ?? (() => "#")}
            />
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Recent files */}
          <Card>
            <CardHeader>
              <CardTitle>Recent files</CardTitle>
              <CardDescription>
                The latest files shared with you.
                {hrefs.files ? (
                  <>
                    {" "}
                    <Link
                      href={hrefs.files}
                      className="hover:text-foreground underline underline-offset-2 transition-colors"
                    >
                      View all files
                    </Link>
                  </>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentFiles.length === 0 ? (
                <p className="text-muted-foreground text-sm">No files yet.</p>
              ) : (
                <FileList files={recentFiles} clientId={clientId} />
              )}
            </CardContent>
          </Card>

          {/* Invoice summary */}
          {hrefs.invoices ? (
            <Link href={hrefs.invoices} className="group">
              {invoiceCard}
            </Link>
          ) : (
            invoiceCard
          )}
        </div>
      </div>
    </>
  );
}
