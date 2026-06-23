import { isBefore, parseISO, startOfDay } from "date-fns";

import type { Invoice, InvoiceStatus } from "@/lib/types/database";

export interface LineItemInput {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Compute invoice totals on the client for live preview. The database recomputes
 * the same values via trigger on save (see the migration), so this is the single
 * source of truth for display while editing.
 */
export function calculateTotals(
  items: LineItemInput[],
  taxRate: number,
  discountRate: number,
): InvoiceTotals {
  const subtotal = round2(
    items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
      0,
    ),
  );
  const discountAmount = round2((subtotal * (discountRate || 0)) / 100);
  const taxAmount = round2(
    ((subtotal - discountAmount) * (taxRate || 0)) / 100,
  );
  const total = round2(subtotal - discountAmount + taxAmount);

  return { subtotal, discountAmount, taxAmount, total };
}

export const INVOICE_STATUSES: InvoiceStatus[] = [
  "draft",
  "sent",
  "paid",
  "overdue",
];

/**
 * The status shown to the user. An invoice that is "sent" but past its due date
 * is treated as "overdue" even if the stored status hasn't been updated yet.
 */
export function effectiveStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.status === "sent" && isOverdue(invoice)) {
    return "overdue";
  }
  return invoice.status;
}

export function isOverdue(invoice: Invoice): boolean {
  if (invoice.status === "paid" || invoice.status === "draft") return false;
  if (!invoice.due_date) return false;
  return isBefore(
    startOfDay(parseISO(invoice.due_date)),
    startOfDay(new Date()),
  );
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
};
