import Link from "next/link";

import { StatusBadge } from "@/components/invoices/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectiveStatus } from "@/lib/invoice";
import type { InvoiceWithClient } from "@/lib/types/database";

export function InvoicesTable({
  invoices,
  showClient = true,
}: {
  invoices: InvoiceWithClient[];
  showClient?: boolean;
}) {
  return (
    <div className="border-border overflow-x-auto border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            {showClient ? <TableHead>Client</TableHead> : null}
            <TableHead>Status</TableHead>
            <TableHead>Issued</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id} className="group">
              <TableCell className="font-medium">
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="hover:underline"
                >
                  {invoice.invoice_number}
                </Link>
              </TableCell>
              {showClient ? (
                <TableCell className="text-muted-foreground">
                  {invoice.client?.company_name ?? "—"}
                </TableCell>
              ) : null}
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
