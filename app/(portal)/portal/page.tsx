import { PortalOverviewContent } from "@/components/portal/portal-overview-content";
import { requirePortalUser } from "@/lib/auth";
import {
  getClient,
  getClientFiles,
  getClientProjects,
  getInvoicesForClient,
  getProjectFileCounts,
} from "@/lib/data";
import { effectiveStatus } from "@/lib/invoice";
import { isPortalVisibleProject } from "@/lib/projects";

export const metadata = { title: "Portal" };

export default async function PortalHomePage() {
  const portal = await requirePortalUser();
  if (!portal) return null;

  const [client, projects, fileCounts, recentFiles, invoices] =
    await Promise.all([
      getClient(portal.clientId),
      getClientProjects(portal.clientId),
      getProjectFileCounts(portal.clientId),
      getClientFiles(portal.clientId, { limit: 5 }),
      getInvoicesForClient(portal.clientId),
    ]);

  // RLS already hides drafts/hidden projects from portal sessions; these
  // filters are defense in depth (and keep parity with the admin preview).
  const visibleInvoices = invoices.filter((i) => i.status !== "draft");
  const openInvoices = visibleInvoices.filter(
    (i) => effectiveStatus(i) !== "paid",
  );
  const visibleProjects = projects
    .filter(isPortalVisibleProject)
    .map((p) => ({ ...p, file_count: fileCounts[p.id] ?? 0 }));

  return (
    <PortalOverviewContent
      welcomeName={client?.contact_name ?? client?.company_name ?? null}
      projects={visibleProjects}
      recentFiles={recentFiles}
      openInvoiceCount={openInvoices.length}
      totalInvoiceCount={visibleInvoices.length}
      clientId={portal.clientId}
      hrefs={{
        projectsIndex: "/portal/projects",
        projects: (id) => `/portal/projects/${id}`,
        files: "/portal/files",
        invoices: "/portal/invoices",
      }}
    />
  );
}
