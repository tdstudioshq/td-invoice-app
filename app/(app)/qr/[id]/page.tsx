import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { QrDetailEditor } from "@/components/qr/qr-detail-editor";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getQrCodeById,
  getQrScansForQrCode,
  getQrScanSummary,
} from "@/lib/data";
import { getSiteUrl } from "@/lib/email/client";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "QR analytics" };

// "2026-06-26" → "Fri" (UTC, matching the summary's UTC buckets).
function weekdayLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export default async function QrDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const code = await getQrCodeById(id);
  if (!code) notFound();

  const [summary, scans] = await Promise.all([
    getQrScanSummary(id),
    getQrScansForQrCode(id),
  ]);
  const shortUrl = `${getSiteUrl()}/q/${code.slug}`;
  const maxDaily = Math.max(1, ...summary.daily.map((day) => day.count));

  return (
    <>
      <PageHeader
        title={code.name}
        description={`Dynamic QR · ${summary.total.toLocaleString()} total ${
          summary.total === 1 ? "scan" : "scans"
        }`}
      >
        <Button variant="outline" asChild>
          <Link href="/qr">
            <ArrowLeft />
            Back to QR codes
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>QR code</CardTitle>
          </CardHeader>
          <CardContent>
            <QrDetailEditor code={code} shortUrl={shortUrl} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2 sm:gap-4">
              {summary.daily.map((day) => (
                <div
                  key={day.date}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {day.count}
                  </span>
                  <div
                    className="flex h-28 w-full items-end"
                    title={`${day.count} on ${day.date} (UTC)`}
                  >
                    <div
                      className="bg-metal-platinum/70 w-full rounded-t-[3px]"
                      style={{
                        height: `${Math.max(2, (day.count / maxDaily) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {weekdayLabel(day.date)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent scans</CardTitle>
          </CardHeader>
          <CardContent>
            {scans.length === 0 ? (
              <EmptyState
                title="No scans yet"
                description="Scans of this code's public link will appear here."
              />
            ) : (
              <div className="border-border overflow-hidden border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Referrer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scans.map((scan) => (
                      <TableRow key={scan.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(scan.scanned_at)}
                        </TableCell>
                        <TableCell className="capitalize">
                          {scan.device ?? "—"}
                        </TableCell>
                        <TableCell>{scan.country ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground max-w-64 truncate">
                          {scan.referrer ?? "Direct"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
