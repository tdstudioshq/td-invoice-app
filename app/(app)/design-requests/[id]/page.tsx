import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Eye } from "lucide-react";

import { CustomDesignStatusBadge } from "@/components/design-requests/status-badge";
import { CustomDesignStatusForm } from "@/components/design-requests/status-form";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { getCustomDesignRequest } from "@/lib/design-requests/queries";
import { formatDateTime } from "@/lib/format";
import { formatBytes, previewKind } from "@/lib/portal";
import type { CustomDesignRequestFileRow } from "@/lib/types/database";

export const metadata = { title: "Design Request" };

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

function AssetCard({ requestId, file }: { requestId: string; file: CustomDesignRequestFileRow }) {
  const href = `/api/design-request-assets/${requestId}?file=${file.id}`;
  const kind = previewKind(file.mime_type);
  return (
    <div className="border-glass-border rounded-[8px] border p-4">
      {kind === "image" ? (
        <a href={`${href}&inline=1`} target="_blank" rel="noreferrer" className="border-glass-border bg-glass-highlight/5 block overflow-hidden rounded-[6px] border">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private signed URL */}
          <img src={`${href}&inline=1`} alt="Uploaded reference" loading="lazy" className="mx-auto max-h-44 w-auto object-contain" />
        </a>
      ) : null}
      <p className="mt-2 truncate text-sm font-medium" title={file.file_name}>{file.file_name}</p>
      <p className="text-muted-foreground text-xs">{formatBytes(file.file_size)} · {file.mime_type}</p>
      <div className="mt-3 flex gap-2">
        {kind ? (
          <Button variant="outline" size="sm" asChild>
            <a href={`${href}&inline=1`} target="_blank" rel="noreferrer"><Eye />View</a>
          </Button>
        ) : null}
        <Button variant="outline" size="sm" asChild><a href={href}><Download />Download</a></Button>
      </div>
    </div>
  );
}

export default async function DesignRequestDetailPage(
  props: PageProps<"/design-requests/[id]">,
) {
  await requireAdmin();
  const { id } = await props.params;
  const request = await getCustomDesignRequest(id);
  if (!request) notFound();
  return (
    <>
      <PageHeader title={request.reference_number} description={`Received ${formatDateTime(request.created_at)}`}>
        <Button variant="outline" asChild><Link href="/design-requests"><ArrowLeft />Back to requests</Link></Button>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>Request</CardTitle>
              <CustomDesignStatusBadge status={request.status} />
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Design type">{request.design_type}</Detail>
                <Detail label="Last updated">{formatDateTime(request.updated_at)}</Detail>
              </dl>
              <div>
                <p className="text-muted-foreground text-xs">Project details</p>
                <p className="mt-1 text-sm break-words whitespace-pre-wrap">{request.notes}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Assets</CardTitle></CardHeader>
            <CardContent>
              {request.files.length === 0 ? (
                <p className="text-muted-foreground text-sm">No files were uploaded.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {request.files.map((file) => <AssetCard key={file.id} requestId={request.id} file={file} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-4">
                <Detail label="Name">{request.customer_name}</Detail>
                <Detail label="Email"><a className="hover:underline" href={`mailto:${request.customer_email}`}>{request.customer_email}</a></Detail>
                <Detail label="Phone"><a className="hover:underline" href={`tel:${request.customer_phone}`}>{request.customer_phone}</a></Detail>
                <Detail label="Instagram">{request.instagram_username}</Detail>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Workflow</CardTitle></CardHeader>
            <CardContent><CustomDesignStatusForm id={request.id} status={request.status} /></CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
