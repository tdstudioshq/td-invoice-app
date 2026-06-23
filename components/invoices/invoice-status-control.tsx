"use client";

import { useTransition } from "react";

import { updateInvoiceStatusAction } from "@/app/actions/invoices";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INVOICE_STATUSES, STATUS_LABEL } from "@/lib/invoice";
import type { InvoiceStatus } from "@/lib/types/database";

/** Inline status changer on the invoice detail page. */
export function InvoiceStatusControl({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: InvoiceStatus;
}) {
  const [isPending, startTransition] = useTransition();

  function onChange(next: string) {
    const formData = new FormData();
    formData.set("id", invoiceId);
    formData.set("status", next);
    startTransition(() => {
      void updateInvoiceStatusAction(formData);
    });
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger size="sm" className="w-36">
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
  );
}
