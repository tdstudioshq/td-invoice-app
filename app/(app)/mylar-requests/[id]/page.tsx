import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Eye, FileWarning } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { MylarStatusBadge } from "@/components/mylar-requests/status-badge";
import { MylarStatusForm } from "@/components/mylar-requests/status-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { formatArtworkBytes } from "@/lib/mylar-printing/artwork";
import { getMylarInquiry } from "@/lib/mylar-printing/queries";
import { bagTypeLabel } from "@/lib/mylar-printing/types";
import { previewKind } from "@/lib/portal";
import type { MylarPrintingInquiry } from "@/lib/types/database";

export const metadata = { title: "Mylar Request" };

/** One labelled value in the detail cards. */
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

/**
 * One artwork slot. The bytes live in a private bucket, so both links point at
 * /api/mylar-artwork/[inquiryId], which re-checks admin and mints a 60-second
 * signed URL — there is deliberately no public URL to render.
 */
function ArtworkSlot({
  inquiry,
  side,
}: {
  inquiry: MylarPrintingInquiry;
  side: "front" | "back";
}) {
  const label = side === "front" ? "Front" : "Back";
  const name =
    side === "front" ? inquiry.front_artwork_name : inquiry.back_artwork_name;
  const size =
    side === "front" ? inquiry.front_artwork_size : inquiry.back_artwork_size;
  const mimeType =
    side === "front"
      ? inquiry.front_artwork_mime_type
      : inquiry.back_artwork_mime_type;

  if (!name) {
    return (
      <div className="border-glass-border rounded-[8px] border border-dashed p-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 text-sm">
          {inquiry.artwork_coming_later ? "Sending later" : "Not provided"}
        </p>
      </div>
    );
  }

  const href = `/api/mylar-artwork/${inquiry.id}?side=${side}`;
  const canPreview = previewKind(mimeType) !== null;

  return (
    <div className="border-glass-border rounded-[8px] border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 truncate text-sm font-medium" title={name}>
        {name}
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {formatArtworkBytes(size)}
        {mimeType ? ` · ${mimeType}` : null}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canPreview ? (
          <Button variant="outline" size="sm" asChild>
            <a href={`${href}&inline=1`} target="_blank" rel="noreferrer">
              <Eye />
              View
            </a>
          </Button>
        ) : null}
        <Button variant="outline" size="sm" asChild>
          <a href={href}>
            <Download />
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}

export default async function MylarRequestDetailPage(
  props: PageProps<"/mylar-requests/[id]">,
) {
  await requireAdmin();
  const { id } = await props.params;
  const inquiry = await getMylarInquiry(id);
  if (!inquiry) notFound();

  return (
    <>
      <PageHeader
        title={inquiry.reference_number}
        description={`Received ${formatDateTime(inquiry.created_at)}`}
      >
        <Button variant="outline" asChild>
          <Link href="/mylar-requests">
            <ArrowLeft />
            Back to requests
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>Request</CardTitle>
              <MylarStatusBadge status={inquiry.status} />
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Bag type">{bagTypeLabel(inquiry.bag_type)}</Detail>
                <Detail label="Quantity">
                  <span className="tabular-nums">
                    {inquiry.quantity.toLocaleString()} pieces
                  </span>
                </Detail>
                <Detail label="Designs">
                  <span className="tabular-nums">{inquiry.design_count}</span>
                </Detail>
                <Detail label="Last updated">
                  {formatDateTime(inquiry.updated_at)}
                </Detail>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Artwork</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {inquiry.artwork_coming_later ? (
                <p className="text-muted-foreground flex items-start gap-2 text-sm">
                  <FileWarning className="mt-0.5 size-4 shrink-0" />
                  The customer chose to send artwork later — follow up before
                  quoting.
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <ArtworkSlot inquiry={inquiry} side="front" />
                <ArtworkSlot inquiry={inquiry} side="back" />
              </div>
            </CardContent>
          </Card>

          {inquiry.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Customer-authored text: rendered as plain wrapped text, never
                    as markup or a link. */}
                <p className="text-sm break-words whitespace-pre-wrap">
                  {inquiry.notes}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4">
                <Detail label="Name">{inquiry.customer_name}</Detail>
                <Detail label="Email">
                  <a
                    href={`mailto:${inquiry.customer_email}`}
                    className="hover:text-metal-platinum underline-offset-4 transition-colors hover:underline"
                  >
                    {inquiry.customer_email}
                  </a>
                </Detail>
                <Detail label="Phone">
                  {inquiry.customer_phone ? (
                    <a
                      href={`tel:${inquiry.customer_phone}`}
                      className="hover:text-metal-platinum underline-offset-4 transition-colors hover:underline"
                    >
                      {inquiry.customer_phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </Detail>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Update</CardTitle>
            </CardHeader>
            <CardContent>
              <MylarStatusForm id={inquiry.id} status={inquiry.status} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
