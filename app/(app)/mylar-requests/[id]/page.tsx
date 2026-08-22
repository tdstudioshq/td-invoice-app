import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Eye,
  FileWarning,
  Mail,
  MessageSquare,
  Phone,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { CopyReference } from "@/components/mylar-requests/copy-reference";
import { MylarStatusBadge } from "@/components/mylar-requests/status-badge";
import { MylarStatusForm } from "@/components/mylar-requests/status-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatArtworkBytes } from "@/lib/mylar-printing/artwork";
import { getMylarInquiry } from "@/lib/mylar-printing/queries";
import { bagTypeLabel, contactMethodLabel } from "@/lib/mylar-printing/types";
import { previewKind } from "@/lib/portal";
import type {
  MylarArtworkFileRow,
  MylarDesignWithArtwork,
} from "@/lib/types/database";

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
 * Normalize a customer-typed phone number into something a dialer will accept.
 *
 * People type "(929) 752-8373", "929-752-8373", and "+1 929 752 8373". `tel:`
 * and `sms:` want digits with an optional leading +, so the punctuation goes
 * and a bare 10-digit number is assumed NANP — TD Studios is in New York, and a
 * number that long with no country code has one. Anything else is handed over
 * as digits and left to the dialer.
 */
function dialNumber(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits;
}

/**
 * One artwork slot on one design. The bytes live in a private bucket, so both
 * links point at /api/mylar-artwork/[inquiryId], which re-checks admin and
 * mints a 60-second signed URL — there is deliberately no public URL to render.
 *
 * Addressed by file id: an inquiry has one front and one back PER DESIGN, so
 * the old `?side=` alone no longer names a file.
 */
function ArtworkSlot({
  inquiryId,
  comingLater,
  side,
  file,
}: {
  inquiryId: string;
  comingLater: boolean;
  side: "front" | "back";
  file: MylarArtworkFileRow | undefined;
}) {
  const label = side === "front" ? "Front" : "Back";

  if (!file) {
    return (
      <div className="border-glass-border rounded-[8px] border border-dashed p-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 text-sm">
          {comingLater ? "Sending later" : "Not provided"}
        </p>
      </div>
    );
  }

  const href = `/api/mylar-artwork/${inquiryId}?file=${file.id}`;
  const kind = previewKind(file.mime_type);
  const canPreview = kind !== null;
  // Thumbnails only for raster images. A PDF cannot be an <img>, and AI/PSD/
  // TIFF would need server-side rasterization — deliberately not built, since
  // View/Download already gets the studio to the file in the app they will
  // open it in anyway.
  const canThumbnail = kind === "image";

  return (
    <div className="border-glass-border rounded-[8px] border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>

      {canThumbnail ? (
        <a
          href={`${href}&inline=1`}
          target="_blank"
          rel="noreferrer"
          className="border-glass-border bg-glass-highlight/5 mt-2 block overflow-hidden rounded-[6px] border"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the route
              302s to a signed, 60-second Storage URL; next/image can neither
              optimize nor cache that, and the host is deliberately not in
              images.remotePatterns because these files are private. */}
          <img
            src={`${href}&inline=1`}
            alt={`${label} artwork`}
            loading="lazy"
            className="mx-auto max-h-44 w-auto object-contain"
          />
        </a>
      ) : null}

      <p className="mt-2 truncate text-sm font-medium" title={file.file_name}>
        {file.file_name}
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {formatArtworkBytes(file.file_size)}
        {file.mime_type ? ` · ${file.mime_type}` : null}
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

/** One design: its allocation, then its artwork. */
function DesignBlock({
  inquiryId,
  comingLater,
  design,
}: {
  inquiryId: string;
  comingLater: boolean;
  design: MylarDesignWithArtwork;
}) {
  const front = design.artwork.find((file) => file.side === "front");
  const back = design.artwork.find((file) => file.side === "back");

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">
        Design {design.design_number}
        <span className="text-muted-foreground ml-2 font-normal tabular-nums">
          {design.quantity.toLocaleString()} pcs
        </span>
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <ArtworkSlot
          inquiryId={inquiryId}
          comingLater={comingLater}
          side="front"
          file={front}
        />
        <ArtworkSlot
          inquiryId={inquiryId}
          comingLater={comingLater}
          side="back"
          file={back}
        />
      </div>
    </section>
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
        <CopyReference reference={inquiry.reference_number} />
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
                  <span className="tabular-nums">
                    {inquiry.designs.length || inquiry.design_count}
                  </span>
                  {/* Pre-0024 requests recorded only the customer's stated
                      count, and the backfill collapsed their artwork into a
                      single Design 1 — so the two can legitimately disagree on
                      old rows. Surfacing both beats silently showing one. */}
                  {inquiry.designs.length > 0 &&
                  inquiry.designs.length !== inquiry.design_count ? (
                    <span className="text-muted-foreground ml-2 text-xs">
                      (customer stated {inquiry.design_count})
                    </span>
                  ) : null}
                </Detail>
                <Detail label="Needed by">
                  {/* A `date` column comes back as YYYY-MM-DD with no time or
                      zone. Parsed at midday UTC so formatting it can never roll
                      to the previous day west of Greenwich. */}
                  {inquiry.needed_by ? (
                    formatDate(`${inquiry.needed_by}T12:00:00Z`)
                  ) : (
                    <span className="text-muted-foreground">
                      No deadline given
                    </span>
                  )}
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
            <CardContent className="space-y-6">
              {inquiry.artwork_coming_later ? (
                <p className="text-muted-foreground flex items-start gap-2 text-sm">
                  <FileWarning className="mt-0.5 size-4 shrink-0" />
                  The customer chose to send artwork later — follow up before
                  quoting.
                </p>
              ) : null}

              {inquiry.designs.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No designs recorded on this request.
                </p>
              ) : (
                inquiry.designs.map((design) => (
                  <DesignBlock
                    key={design.id}
                    inquiryId={inquiry.id}
                    comingLater={inquiry.artwork_coming_later}
                    design={design}
                  />
                ))
              )}
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
                <Detail label="Brand">
                  {inquiry.brand_name ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Detail>
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
                      href={`tel:${dialNumber(inquiry.customer_phone)}`}
                      className="hover:text-metal-platinum underline-offset-4 transition-colors hover:underline"
                    >
                      {inquiry.customer_phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Detail>
                <Detail label="Prefers">
                  {/* Null on inquiries filed before the field existed — those
                      customers stated nothing, so this shows "—" rather than
                      inventing a channel for them. */}
                  {inquiry.contact_method ? (
                    contactMethodLabel(inquiry.contact_method)
                  ) : (
                    <span className="text-muted-foreground">Not stated</span>
                  )}
                </Detail>
              </dl>

              {/*
                One tap to open the conversation, in the channel the customer
                asked for. Plain mailto:/tel:/sms: links — the app sends nothing
                itself and holds no messaging integration; these just hand off
                to whatever the studio already uses. Text and Call only appear
                when there is a number behind them.
              */}
              <div className="border-glass-border mt-5 flex flex-wrap gap-2 border-t pt-4">
                <Button variant="outline" size="sm" asChild>
                  <a href={`mailto:${inquiry.customer_email}`}>
                    <Mail />
                    Email
                  </a>
                </Button>
                {inquiry.customer_phone ? (
                  <>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`tel:${dialNumber(inquiry.customer_phone)}`}>
                        <Phone />
                        Call
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`sms:${dialNumber(inquiry.customer_phone)}`}>
                        <MessageSquare />
                        Text
                      </a>
                    </Button>
                  </>
                ) : null}
              </div>
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
