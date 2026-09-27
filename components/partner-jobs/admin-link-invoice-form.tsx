"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { linkInvoiceToJobAction } from "@/app/actions/partner-job-invoices";
import { initialActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";

/**
 * Attach an existing invoice to a partner job. Same Select-mirrored-into-a-
 * hidden-input shape as PartnerJobStatusForm. The server re-checks that the
 * invoice bills this job's company, so the options here are a convenience.
 */
export function AdminLinkInvoiceForm({
  jobId,
  invoices,
}: {
  jobId: string;
  invoices: { id: string; invoice_number: string; total: number }[];
}) {
  const [invoiceId, setInvoiceId] = useState("");
  const [state, formAction] = useActionState(linkInvoiceToJobAction, initialActionState);

  useEffect(() => {
    if (state.success) toast.success("Invoice attached");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="flex-1 space-y-2">
        <Label htmlFor="link-invoice">Attach an existing invoice</Label>
        <Select value={invoiceId} onValueChange={setInvoiceId}>
          <SelectTrigger id="link-invoice" className="w-full">
            <SelectValue placeholder="Choose an invoice" />
          </SelectTrigger>
          <SelectContent>
            {invoices.map((invoice) => (
              <SelectItem key={invoice.id} value={invoice.id}>
                {invoice.invoice_number} · {formatCurrency(invoice.total)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SubmitButton pendingText="Attaching…" disabled={!invoiceId} className="sm:w-auto">
        Attach
      </SubmitButton>
    </form>
  );
}
