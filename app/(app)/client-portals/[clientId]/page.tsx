import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ActivePortalControls } from "@/components/portal/active-portal-controls";
import { AdminUploadForm } from "@/components/portal/admin-upload-form";
import { CreatePortalUserDialog } from "@/components/portal/create-portal-user-dialog";
import { FileList } from "@/components/portal/file-list";
import { FolderManager } from "@/components/portal/folder-manager";
import { Badge } from "@/components/ui/badge";
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
  getPortalUserForClient,
} from "@/lib/data";
import { CATEGORY_DESCRIPTION, CATEGORY_LABEL, FILE_CATEGORIES } from "@/lib/portal";
import { formatDate } from "@/lib/format";

export async function generateMetadata(
  props: PageProps<"/client-portals/[clientId]">,
) {
  const { clientId } = await props.params;
  const client = await getClient(clientId);
  return { title: client ? `${client.company_name} — Portal` : "Client Portal" };
}

export default async function ClientPortalDetailPage(
  props: PageProps<"/client-portals/[clientId]">,
) {
  const { clientId } = await props.params;
  const client = await getClient(clientId);
  if (!client) notFound();

  const [portalUser, files, folders] = await Promise.all([
    getPortalUserForClient(clientId),
    getClientFiles(clientId),
    getClientFolders(clientId),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/client-portals">
          <ArrowLeft />
          Back to portals
        </Link>
      </Button>

      <PageHeader
        title={client.company_name}
        description={client.email ?? undefined}
      />

      <div className="space-y-8">
        {/* Portal access */}
        <Card>
          <CardHeader>
            <CardTitle>Portal access</CardTitle>
            <CardDescription>
              {portalUser
                ? "This client can sign in to view their files and invoices."
                : "Create a secure login so this client can access their portal."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {portalUser ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">{portalUser.email}</span>
                  <Badge className="border-transparent bg-emerald-500/15 text-emerald-400">
                    Active
                  </Badge>
                  <Badge
                    className={
                      portalUser.can_upload
                        ? "border-transparent bg-sky-500/15 text-sky-400"
                        : "border-transparent bg-muted text-muted-foreground"
                    }
                  >
                    {portalUser.can_upload ? "Uploads enabled" : "Uploads off"}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    Since {formatDate(portalUser.created_at)}
                  </span>
                </div>
                <ActivePortalControls
                  clientId={clientId}
                  canUpload={portalUser.can_upload}
                />
              </div>
            ) : (
              <CreatePortalUserDialog
                clientId={clientId}
                defaultEmail={client.email}
              />
            )}
          </CardContent>
        </Card>

        {/* Files */}
        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
            <CardDescription>
              Upload deliverables, share invoices, and review client uploads.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FolderManager clientId={clientId} folders={folders} />

            <div className="border-border border-t pt-6">
              <h3 className="mb-3 text-sm font-medium">Upload a file</h3>
              <AdminUploadForm clientId={clientId} folders={folders} />
            </div>

            <div className="border-border space-y-6 border-t pt-6">
              {FILE_CATEGORIES.map((category) => {
                const inCategory = files.filter((f) => f.category === category);
                return (
                  <div key={category}>
                    <div className="mb-1">
                      <h3 className="text-sm font-medium">
                        {CATEGORY_LABEL[category]}
                      </h3>
                      <p className="text-muted-foreground text-xs">
                        {CATEGORY_DESCRIPTION[category]}
                      </p>
                    </div>
                    <FileList files={inCategory} clientId={clientId} admin />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
