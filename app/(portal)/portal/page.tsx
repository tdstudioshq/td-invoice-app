import Link from "next/link";
import { ArrowRight, FileText, FolderLock } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requirePortalUser } from "@/lib/auth";
import { getClient, getClientFiles, getInvoicesForClient } from "@/lib/data";
import { effectiveStatus } from "@/lib/invoice";

export const metadata = { title: "Portal" };

export default async function PortalHomePage() {
  const portal = await requirePortalUser();
  if (!portal) return null;

  const [client, files, invoices] = await Promise.all([
    getClient(portal.clientId),
    getClientFiles(portal.clientId),
    getInvoicesForClient(portal.clientId),
  ]);

  const visibleInvoices = invoices.filter((i) => i.status !== "draft");
  const openInvoices = visibleInvoices.filter(
    (i) => effectiveStatus(i) !== "paid",
  );

  return (
    <>
      <PageHeader
        title={`Welcome${client ? `, ${client.company_name}` : ""}`}
        description="Your files and invoices from TD Studios, all in one place."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/portal/files" className="group">
          <Card className="hover:border-foreground/20 h-full transition-colors">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="bg-muted flex size-10 items-center justify-center">
                <FolderLock className="size-5" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-semibold">{files.length}</p>
                <p className="text-muted-foreground text-sm">
                  {files.length === 1 ? "File" : "Files"} available
                </p>
              </div>
              <ArrowRight className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/invoices" className="group">
          <Card className="hover:border-foreground/20 h-full transition-colors">
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="bg-muted flex size-10 items-center justify-center">
                <FileText className="size-5" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-semibold">{openInvoices.length}</p>
                <p className="text-muted-foreground text-sm">
                  Open{" "}
                  {openInvoices.length === 1 ? "invoice" : "invoices"} ·{" "}
                  {visibleInvoices.length} total
                </p>
              </div>
              <ArrowRight className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </>
  );
}
