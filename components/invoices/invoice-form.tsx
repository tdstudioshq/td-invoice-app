"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { initialActionState, type ActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { calculateTotals } from "@/lib/invoice";
import { formatCurrency, todayISO } from "@/lib/format";
import { INVOICE_STATUSES, STATUS_LABEL } from "@/lib/invoice";
import type {
  Client,
  InvoiceStatus,
  InvoiceWithRelations,
} from "@/lib/types/database";

type FormAction = (
  state: ActionState,
  formData: FormData,
) => Promise<ActionState>;

interface LineRow {
  key: string;
  description: string;
  quantity: string;
  unit_price: string;
}

let rowCounter = 0;
function newRow(partial?: Partial<LineRow>): LineRow {
  rowCounter += 1;
  return {
    key: `row-${rowCounter}`,
    description: partial?.description ?? "",
    quantity: partial?.quantity ?? "1",
    unit_price: partial?.unit_price ?? "0",
  };
}

export function InvoiceForm({
  action,
  clients,
  invoice,
  defaultClientName = "",
  defaultTaxRate = 0,
  submitLabel = "Create invoice",
}: {
  action: FormAction;
  clients: Client[];
  invoice?: InvoiceWithRelations | null;
  defaultClientName?: string;
  defaultTaxRate?: number;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  const [clientName, setClientName] = useState<string>(
    invoice?.client?.company_name ?? defaultClientName,
  );
  const [status, setStatus] = useState<InvoiceStatus>(
    invoice?.status ?? "draft",
  );
  const [issueDate, setIssueDate] = useState<string>(
    invoice?.issue_date ?? todayISO(),
  );
  const [dueDate, setDueDate] = useState<string>(invoice?.due_date ?? "");
  const [taxRate, setTaxRate] = useState<string>(
    invoice ? String(invoice.tax_rate) : String(defaultTaxRate),
  );
  const [discountRate, setDiscountRate] = useState<string>(
    invoice ? String(invoice.discount_rate) : "0",
  );
  const [notes, setNotes] = useState<string>(invoice?.notes ?? "");

  const [rows, setRows] = useState<LineRow[]>(() => {
    if (invoice?.invoice_items?.length) {
      return invoice.invoice_items
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((item) =>
          newRow({
            description: item.description,
            quantity: String(item.quantity),
            unit_price: String(item.unit_price),
          }),
        );
    }
    return [newRow()];
  });

  const totals = useMemo(
    () =>
      calculateTotals(
        rows.map((r) => ({
          description: r.description,
          quantity: Number(r.quantity) || 0,
          unit_price: Number(r.unit_price) || 0,
        })),
        Number(taxRate) || 0,
        Number(discountRate) || 0,
      ),
    [rows, taxRate, discountRate],
  );

  const itemsJson = JSON.stringify(
    rows.map((r) => ({
      description: r.description,
      quantity: Number(r.quantity) || 0,
      unit_price: Number(r.unit_price) || 0,
    })),
  );

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(key: string) {
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((row) => row.key !== key),
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {/* Hidden inputs mirror controlled state for submission. */}
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="issue_date" value={issueDate} />
      <input type="hidden" name="due_date" value={dueDate} />
      <input type="hidden" name="tax_rate" value={taxRate} />
      <input type="hidden" name="discount_rate" value={discountRate} />
      <input type="hidden" name="notes" value={notes} />
      <input type="hidden" name="items" value={itemsJson} />

      {state.error ? (
        <p className="bg-destructive/10 text-destructive border-destructive/30 border px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: details + line items */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="client_name_input">
                  Client<span className="text-destructive"> *</span>
                </Label>
                <Input
                  id="client_name_input"
                  name="client_name"
                  list="client-options"
                  autoComplete="off"
                  placeholder="Type a client name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  aria-invalid={Boolean(state.fieldErrors?.client_name)}
                />
                <datalist id="client-options">
                  {clients.map((client) => (
                    <option key={client.id} value={client.company_name} />
                  ))}
                </datalist>
                <p className="text-muted-foreground text-xs">
                  Pick an existing client or type a new name — it’ll be saved
                  automatically.
                </p>
                {state.fieldErrors?.client_name ? (
                  <p className="text-destructive text-xs">
                    {state.fieldErrors.client_name}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as InvoiceStatus)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVOICE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="issue_date_input">Issue date</Label>
                <Input
                  id="issue_date_input"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="due_date_input">Due date</Label>
                <Input
                  id="due_date_input"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Line items</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRows((prev) => [...prev, newRow()])}
              >
                <Plus />
                Add item
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {state.fieldErrors?.items ? (
                <p className="text-destructive text-xs">
                  {state.fieldErrors.items}
                </p>
              ) : null}

              <div className="text-muted-foreground hidden grid-cols-[1fr_5rem_7rem_7rem_2rem] gap-2 px-1 text-xs sm:grid">
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit price</span>
                <span className="text-right">Amount</span>
                <span />
              </div>

              {rows.map((row) => {
                const amount =
                  (Number(row.quantity) || 0) * (Number(row.unit_price) || 0);
                return (
                  <div
                    key={row.key}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_5rem_7rem_7rem_2rem] sm:items-center"
                  >
                    <Input
                      aria-label="Description"
                      placeholder="Design services"
                      value={row.description}
                      onChange={(e) =>
                        updateRow(row.key, { description: e.target.value })
                      }
                    />
                    <Input
                      aria-label="Quantity"
                      type="number"
                      min="0"
                      step="any"
                      className="sm:text-right"
                      value={row.quantity}
                      onChange={(e) =>
                        updateRow(row.key, { quantity: e.target.value })
                      }
                    />
                    <Input
                      aria-label="Unit price"
                      type="number"
                      min="0"
                      step="0.01"
                      className="sm:text-right"
                      value={row.unit_price}
                      onChange={(e) =>
                        updateRow(row.key, { unit_price: e.target.value })
                      }
                    />
                    <div className="text-right text-sm tabular-nums">
                      {formatCurrency(amount)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove item"
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length === 1}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms, thank-you note, etc."
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right: summary */}
        <div className="space-y-5">
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="tax_rate_input">Tax %</Label>
                  <Input
                    id="tax_rate_input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.001"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discount_rate_input">Discount %</Label>
                  <Input
                    id="discount_rate_input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.001"
                    value={discountRate}
                    onChange={(e) => setDiscountRate(e.target.value)}
                  />
                </div>
              </div>

              <dl className="space-y-2 text-sm">
                <SummaryRow label="Subtotal" value={totals.subtotal} />
                <SummaryRow
                  label={`Discount (${Number(discountRate) || 0}%)`}
                  value={-totals.discountAmount}
                />
                <SummaryRow
                  label={`Tax (${Number(taxRate) || 0}%)`}
                  value={totals.taxAmount}
                />
                <div className="border-border mt-2 flex items-center justify-between border-t pt-3 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">
                    {formatCurrency(totals.total)}
                  </dd>
                </div>
              </dl>

              <SubmitButton className="w-full" size="lg">
                {submitLabel}
              </SubmitButton>
              <Button asChild variant="outline" className="w-full">
                <Link href="/invoices">Cancel</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{formatCurrency(value)}</dd>
    </div>
  );
}
