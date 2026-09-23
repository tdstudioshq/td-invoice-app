import { effectiveStatus } from "@/lib/invoice";
import type {
  InvoiceWithClient,
} from "@/lib/types/database";

/**
 * Dashboard aggregate reads.
 *
 * Split out of the former lib/data.ts, which had grown to hold nine
 * unrelated domains in one module.
 */

export interface DashboardStats {
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  overdueCount: number;
  overdueAmount: number;
  invoiceCount: number;
}

export async function getDashboardStats(
  invoices: InvoiceWithClient[],
): Promise<DashboardStats> {
  let totalInvoiced = 0;
  let totalPaid = 0;
  let outstanding = 0;
  let overdueCount = 0;
  let overdueAmount = 0;

  for (const invoice of invoices) {
    // Drafts are not yet "invoiced" revenue.
    if (invoice.status === "draft") continue;

    const total = Number(invoice.total);
    totalInvoiced += total;

    if (invoice.status === "paid") {
      totalPaid += total;
    } else {
      outstanding += total;
      if (effectiveStatus(invoice) === "overdue") {
        overdueCount += 1;
        overdueAmount += total;
      }
    }
  }

  return {
    totalInvoiced,
    totalPaid,
    outstanding,
    overdueCount,
    overdueAmount,
    invoiceCount: invoices.length,
  };
}

// ---------------------------------------------------------------------------
// Portfolio Gallery (public)
// ---------------------------------------------------------------------------
