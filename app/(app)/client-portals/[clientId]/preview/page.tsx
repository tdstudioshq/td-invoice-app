import { notFound } from "next/navigation";

import { PortalOverviewContent } from "@/components/portal/portal-overview-content";
import { PreviewBanner } from "@/components/portal/preview-banner";
import {
  getClient,
  getClientFiles,
  getClientProjects,
  getInvoicesForClient,
  getProjectFileCounts,
} from "@/lib/data";
import { effectiveStatus } from "@/lib/invoice";

// Admin "view as client" — no impersonation, no RLS bypass. The page runs on
// the ADMIN's session (guarded by requireAdmin in the (app) layout) and
// re-applies in code exactly the visibility filters the portal RLS enforces
// for real portal sessions: no draft invoices, no draft/archived projects, no
// archived files. Keep these filters in sync with migration 0016 /
// lib/projects.ts.
export async function generateMetadata(
  props: PageProps<"/client-portals/[clientId]/preview">,
) {
  const { clientId } = await props.params;
  const client = await getClient(clientId);
  return {
    title: client ? `Preview — ${client.company_name}` : "Portal preview",
  };
}

export default async function ClientPortalPreviewPage(
  props: PageProps<"/client-portals/[clientId]/preview">,
) {
  const { clientId } = await props.params;
  const client = await getClient(clientId);
  if (!client) notFound();

  const [projects, fileCounts, recentFiles, invoices] = await Promise.all([
    getClientProjects(clientId, { visibleOnly: true }),
    getProjectFileCounts(clientId, { activeOnly: true }),
    getClientFiles(clientId, { limit: 5, activeOnly: true }),
    getInvoicesForClient(clientId),
  ]);

  const visibleInvoices = invoices.filter((i) => i.status !== "draft");
  const openInvoices = visibleInvoices.filter(
    (i) => effectiveStatus(i) !== "paid",
  );

  // Parity with the portal RLS: hide files attached to a hidden (draft/archived)
  // project. `projects` is already fetched with visibleOnly, so its ids are the
  // visible set. (getClientFiles activeOnly only drops archived files.)
  const visibleProjectIds = new Set(projects.map((p) => p.id));
  const visibleRecentFiles = recentFiles.filter(
    (f) => !f.project_id || visibleProjectIds.has(f.project_id),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PreviewBanner
        clientName={client.company_name}
        backHref={`/client-portals/${clientId}`}
      />
      <PortalOverviewContent
        welcomeName={client.contact_name ?? client.company_name}
        projects={projects.map((p) => ({
          ...p,
          file_count: fileCounts[p.id] ?? 0,
        }))}
        recentFiles={visibleRecentFiles}
        openInvoiceCount={openInvoices.length}
        totalInvoiceCount={visibleInvoices.length}
        clientId={clientId}
        hrefs={{
          projectsIndex: `/client-portals/${clientId}/preview/projects`,
          projects: (id) =>
            `/client-portals/${clientId}/preview/projects/${id}`,
        }}
      />
    </div>
  );
}
