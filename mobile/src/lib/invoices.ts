import { supabase } from "@/src/lib/supabase";
import type {
  InvoiceStatus,
  InvoiceWithRelations,
} from "@/src/types/database";

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface InvoiceWriteInput {
  client_id: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  tax_rate: number;
  discount_rate: number;
  notes: string | null;
  items: InvoiceLineInput[];
}

export type InvoiceFieldErrors = Partial<
  Record<
    | "client_id"
    | "status"
    | "issue_date"
    | "due_date"
    | "tax_rate"
    | "discount_rate"
    | "items",
    string
  >
>;

export const INVOICE_STATUSES: InvoiceStatus[] = [
  "draft",
  "sent",
  "paid",
  "overdue",
];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isValidISODate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateInvoiceInput(
  input: InvoiceWriteInput,
): InvoiceFieldErrors {
  const errors: InvoiceFieldErrors = {};

  if (!input.client_id) errors.client_id = "Select an existing client.";
  if (!INVOICE_STATUSES.includes(input.status)) {
    errors.status = "Select a valid status.";
  }
  if (!isValidISODate(input.issue_date)) {
    errors.issue_date = "Use a valid date in YYYY-MM-DD format.";
  }
  if (input.due_date && !isValidISODate(input.due_date)) {
    errors.due_date = "Use a valid date in YYYY-MM-DD format.";
  }
  if (
    !Number.isFinite(input.tax_rate) ||
    input.tax_rate < 0 ||
    input.tax_rate > 100
  ) {
    errors.tax_rate = "Tax must be between 0 and 100.";
  }
  if (
    !Number.isFinite(input.discount_rate) ||
    input.discount_rate < 0 ||
    input.discount_rate > 100
  ) {
    errors.discount_rate = "Discount must be between 0 and 100.";
  }

  const invalidItem = input.items.some(
    (item) =>
      !Number.isFinite(item.quantity) ||
      item.quantity < 0 ||
      !Number.isFinite(item.unit_price) ||
      item.unit_price < 0,
  );
  const meaningfulItems = input.items.filter(
    (item) => item.description.trim() !== "" || item.unit_price > 0,
  );
  if (invalidItem) {
    errors.items = "Quantities and prices must be zero or greater.";
  } else if (meaningfulItems.length === 0) {
    errors.items = "Add at least one line item.";
  }

  return errors;
}

export function calculateInvoiceTotals(
  items: InvoiceLineInput[],
  taxRate: number,
  discountRate: number,
) {
  const subtotal = round2(
    items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0,
    ),
  );
  const discountAmount = round2((subtotal * (discountRate || 0)) / 100);
  const taxAmount = round2(
    ((subtotal - discountAmount) * (taxRate || 0)) / 100,
  );

  return {
    subtotal,
    discountAmount,
    taxAmount,
    total: round2(subtotal - discountAmount + taxAmount),
  };
}

function firstError(errors: InvoiceFieldErrors) {
  return Object.values(errors)[0];
}

async function getOwnerId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!user) throw new Error("You must be signed in.");
  return user.id;
}

async function assertOwnedClient(clientId: string, ownerId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The selected client is no longer available.");
}

function invoiceRow(input: InvoiceWriteInput) {
  return {
    client_id: input.client_id,
    status: input.status,
    issue_date: input.issue_date,
    due_date: input.due_date,
    tax_rate: input.tax_rate,
    discount_rate: input.discount_rate,
    notes: input.notes,
  };
}

function itemRows(
  invoiceId: string,
  ownerId: string,
  items: InvoiceLineInput[],
) {
  return items
    .filter((item) => item.description.trim() !== "" || item.unit_price > 0)
    .map((item, position) => ({
      invoice_id: invoiceId,
      owner_id: ownerId,
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price: item.unit_price,
      position,
    }));
}

function assertValidInput(input: InvoiceWriteInput) {
  const error = firstError(validateInvoiceInput(input));
  if (error) throw new Error(error);
}

export async function createInvoice(input: InvoiceWriteInput) {
  assertValidInput(input);
  const ownerId = await getOwnerId();
  await assertOwnedClient(input.client_id, ownerId);

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({ ...invoiceRow(input), owner_id: ownerId })
    .select("id")
    .single();
  if (invoiceError || !invoice) {
    throw new Error(invoiceError?.message ?? "Could not create invoice.");
  }

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(itemRows(invoice.id, ownerId, input.items));
  if (itemsError) {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    throw new Error(itemsError.message);
  }

  return invoice.id;
}

export async function updateInvoice(
  invoice: InvoiceWithRelations,
  input: InvoiceWriteInput,
) {
  assertValidInput(input);
  const ownerId = await getOwnerId();
  await assertOwnedClient(input.client_id, ownerId);

  const { data: updated, error: invoiceError } = await supabase
    .from("invoices")
    .update(invoiceRow(input))
    .eq("id", invoice.id)
    .select("id")
    .maybeSingle();
  if (invoiceError) throw new Error(invoiceError.message);
  if (!updated) throw new Error("The invoice is no longer available.");

  const previousInvoiceRow = {
    client_id: invoice.client_id,
    status: invoice.status,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    tax_rate: invoice.tax_rate,
    discount_rate: invoice.discount_rate,
    notes: invoice.notes,
  };
  const previousItems = invoice.invoice_items.map((item) => ({
    invoice_id: invoice.id,
    owner_id: ownerId,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    position: item.position,
  }));

  const { error: deleteError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", invoice.id);
  if (deleteError) {
    await supabase
      .from("invoices")
      .update(previousInvoiceRow)
      .eq("id", invoice.id);
    throw new Error(deleteError.message);
  }

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(itemRows(invoice.id, ownerId, input.items));
  if (itemsError) {
    if (previousItems.length > 0) {
      await supabase.from("invoice_items").insert(previousItems);
    }
    await supabase
      .from("invoices")
      .update(previousInvoiceRow)
      .eq("id", invoice.id);
    throw new Error(itemsError.message);
  }
}
