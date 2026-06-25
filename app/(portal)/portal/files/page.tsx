import { FolderLock } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ClientUploadForm } from "@/components/portal/client-upload-form";
import { FileList } from "@/components/portal/file-list";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePortalUser } from "@/lib/auth";
import { getClientFiles } from "@/lib/data";
import { CATEGORY_DESCRIPTION, CATEGORY_LABEL, FILE_CATEGORIES } from "@/lib/portal";

export const metadata = { title: "Files" };

export default async function PortalFilesPage() {
  const portal = await requirePortalUser();
  if (!portal) return null;

  const files = await getClientFiles(portal.clientId);

  return (
    <>
      <PageHeader
        title="Files"
        description="View and download files shared with you."
      />

      {portal.canUpload ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Share a file</CardTitle>
            <CardDescription>
              Upload a file for the TD Studios team to review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ClientUploadForm />
          </CardContent>
        </Card>
      ) : null}

      {files.length === 0 ? (
        <EmptyState
          icon={FolderLock}
          title="No files yet"
          description="Files shared with you will appear here."
        />
      ) : (
        <div className="space-y-6">
          {FILE_CATEGORIES.map((category) => {
            const inCategory = files.filter((f) => f.category === category);
            if (inCategory.length === 0) return null;
            return (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {CATEGORY_LABEL[category]}
                  </CardTitle>
                  <CardDescription>
                    {CATEGORY_DESCRIPTION[category]}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FileList files={inCategory} clientId={portal.clientId} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
