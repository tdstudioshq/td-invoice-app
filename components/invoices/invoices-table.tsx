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
    <>
      <div className="space-y-3 sm:hidden">
        {invoices.map((invoice) => (
          <Link
            key={invoice.id}
            href={`/invoices/${invoice.id}`}
            className="glass block rounded-[8px] p-4 transition-colors active:bg-glass-highlight/20"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{invoice.invoice_number}</p>
                {showClient ? (
                  <p className="text-muted-foreground mt-0.5 truncate text-sm">
                    {invoice.client?.company_name ?? "—"}
                  </p>
                ) : null}
              </div>
              <StatusBadge status={effectiveStatus(invoice)} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Issued</dt>
                <dd className="mt-0.5">{formatDate(invoice.issue_date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Due</dt>
                <dd className="mt-0.5">{formatDate(invoice.due_date)}</dd>
              </div>
              <div className="col-span-2 border-t border-glass-border pt-3">
                <dt className="text-muted-foreground text-xs">Total</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-metal-platinum">
                  {formatCurrency(invoice.total)}
                </dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>

      <div className="glass hidden overflow-x-auto rounded-[8px] sm:block">
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
              <TableRow
                key={invoice.id}
                className="group transition-colors hover:bg-glass-highlight/10"
              >
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
    </>
  );
}
