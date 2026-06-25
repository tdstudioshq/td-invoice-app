import { Download, FileText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/invoices/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePortalUser } from "@/lib/auth";
import { getInvoicesForClient } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectiveStatus } from "@/lib/invoice";

export const metadata = { title: "Invoices" };

export default async function PortalInvoicesPage() {
  const portal = await requirePortalUser();
  if (!portal) return null;

  // RLS already hides drafts from portal users, but filter defensively too.
  const invoices = (await getInvoicesForClient(portal.clientId)).filter(
    (i) => i.status !== "draft",
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Review and download your invoices."
      />

      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Your invoices from TD Studios will appear here."
        />
      ) : (
        <div className="border-border overflow-x-auto border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">
                    {invoice.invoice_number}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={effectiveStatus(invoice)} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(invoice.issue_date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(invoice.due_date)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(invoice.total)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Download ${invoice.invoice_number} PDF`}
                    >
                      <a href={`/api/invoices/${invoice.id}/pdf`} download>
                        <Download />
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
