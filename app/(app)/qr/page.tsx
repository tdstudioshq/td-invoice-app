import Link from "next/link";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";

import { PageHeader } from "@/components/layout/page-header";
import { QrCodeList } from "@/components/qr/qr-code-list";
import { QrGenerator } from "@/components/qr/qr-generator";
import { Button } from "@/components/ui/button";
import { getQrCodes, getQrScanCounts } from "@/lib/data";
import { getSiteUrl } from "@/lib/email/client";

export const metadata = { title: "QR Codes" };

export default async function QrPage() {
  const [codes, scanCounts] = await Promise.all([
    getQrCodes(),
    getQrScanCounts(),
  ]);
  const baseUrl = getSiteUrl();

  return (
    <>
      <PageHeader
        title="QR Codes"
        description="Generate a static QR code, or save a dynamic short link you can reprint and repoint anytime."
      >
        <Button asChild variant="outline">
          <Link href="/qr/history">
            <ClockCounterClockwiseIcon />
            Generation history
          </Link>
        </Button>
      </PageHeader>
      <div className="space-y-8">
        <QrGenerator source="admin" />

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-metal-platinum">
              Saved dynamic QR codes
            </h2>
            <p className="text-muted-foreground text-xs">
              Each code encodes a short /q/… link that redirects to its
              destination — change the target without reprinting.
            </p>
          </div>
          <QrCodeList
            codes={codes}
            baseUrl={baseUrl}
            scanCounts={scanCounts}
          />
        </section>
      </div>
    </>
  );
}
