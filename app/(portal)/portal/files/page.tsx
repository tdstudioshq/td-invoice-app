import { PageHeader } from "@/components/layout/page-header";
import { FileBrowser } from "@/components/portal/file-browser";
import { requirePortalUser } from "@/lib/auth";
import {
  getClientFiles,
  getClientProjects,
  getFavoriteFileIds,
  getFileActivity,
} from "@/lib/data";

export const metadata = { title: "Files" };

/**
 * The portal's Drive-style asset browser. Every dataset here is fetched with
 * the cookie-scoped client, so RLS confines it to the signed-in portal user's
 * client: active files only (archived / hidden-project files are filtered by
 * the 0016 policies), visible projects, the user's own favorites, and the
 * client's activity log (0019 portal SELECT policy).
 */
export default async function PortalFilesPage() {
  const portal = await requirePortalUser();
  if (!portal) return null;

  const [files, projects, favoriteIds, activity] = await Promise.all([
    getClientFiles(portal.clientId),
    getClientProjects(portal.clientId, { visibleOnly: true }),
    getFavoriteFileIds(portal.clientId),
    getFileActivity(portal.clientId, 40),
  ]);

  return (
    <>
      <PageHeader
        title="Your files"
        description="Every design, mockup, and print-ready asset TD Studios has created for you."
      />
      <FileBrowser
        files={files}
        projects={projects.map(({ id, name, status }) => ({
          id,
          name,
          status,
        }))}
        favoriteIds={favoriteIds}
        activity={activity}
        canUpload={portal.canUpload}
      />
    </>
  );
}
