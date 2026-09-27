import Link from "next/link";

import { StatusBadge } from "@/components/invoices/status-badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectiveStatus, summarizePayments } from "@/lib/invoice";
import type { InvoiceWithPayments } from "@/lib/types/database";

/**
 * The invoices on a partner job (or across a company), as money: total, what
 * has come in, what is still owed.
 *
 * Shared by the studio's job page and the partner portal, which is why it
 * carries no icons (lucide there, Phosphor here) and no controls of its own —
 * the studio's page passes its per-row actions through `rowAction`. What each
 * side sees is decided by RLS in the query, not here.
 */
export function JobInvoiceList({
  invoices,
  invoiceHref,
  jobLabels,
  rowAction,
  emptyNote,
}: {
  invoices: InvoiceWithPayments[];
  /** Base the invoice links are built on: `${invoiceHref}/<id>`. */
  invoiceHref: string;
  /** Job number per job id, shown when the list spans several jobs. */
  jobLabels?: Map<string, string>;
  rowAction?: (invoice: InvoiceWithPayments) => React.ReactNode;
  emptyNote: string;
}) {
  if (invoices.length === 0) {
    return (
      <p className="border-glass-border text-muted-foreground rounded-[8px] border border-dashed px-4 py-6 text-center text-sm">
        {emptyNote}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {invoices.map((invoice) => {
        const money = summarizePayments(invoice.total, invoice.payments);
        const jobLabel =
          jobLabels && invoice.design_job_id
            ? jobLabels.get(invoice.design_job_id)
            : undefined;
        return (
          <li
            key={invoice.id}
            className="border-glass-border rounded-[8px] border px-4 py-3.5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`${invoiceHref}/${invoice.id}`}
                  className="hover:text-metal-platinum font-medium transition-colors"
                >
                  {invoice.invoice_number}
                </Link>
                <p className="text-muted-foreground mt-0.5 text-sm md:text-xs">
                  {jobLabel ? `${jobLabel} · ` : ""}
                  Issued {formatDate(invoice.issue_date)}
                  {invoice.due_date ? ` · Due ${formatDate(invoice.due_date)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={effectiveStatus(invoice)} />
                {rowAction ? rowAction(invoice) : null}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-sm md:text-xs">Total</dt>
                <dd className="mt-0.5 tabular-nums">{formatCurrency(invoice.total)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm md:text-xs">Paid</dt>
                <dd className="mt-0.5 tabular-nums">
                  {formatCurrency(money.paid)}
                  {money.deposits > 0 ? (
                    <span className="text-muted-foreground block text-xs">
                      incl. {formatCurrency(money.deposits)} deposit
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm md:text-xs">Balance</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {formatCurrency(money.balance)}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
