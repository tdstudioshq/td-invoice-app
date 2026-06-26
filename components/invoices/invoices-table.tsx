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
    <div className="glass overflow-x-auto rounded-[8px]">
      <Table className="min-w-[680px]">
        <TableHeader className="bg-glass-highlight/10">
          <TableRow>
            <TableHead className="px-4">Invoice</TableHead>
            {showClient ? <TableHead className="px-4">Client</TableHead> : null}
            <TableHead className="px-4">Status</TableHead>
            <TableHead className="px-4">Issued</TableHead>
            <TableHead className="px-4">Due</TableHead>
            <TableHead className="px-4 text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id} className="group">
              <TableCell className="px-4 py-3.5 font-medium">
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="transition-colors hover:text-metal-platinum"
                >
                  {invoice.invoice_number}
                </Link>
              </TableCell>
              {showClient ? (
                <TableCell className="text-muted-foreground px-4 py-3.5">
                  {invoice.client?.company_name ?? "—"}
                </TableCell>
              ) : null}
              <TableCell className="px-4 py-3.5">
                <StatusBadge status={effectiveStatus(invoice)} />
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3.5">
                {formatDate(invoice.issue_date)}
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3.5">
                {formatDate(invoice.due_date)}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-right font-semibold tabular-nums text-metal-platinum">
                {formatCurrency(invoice.total)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
