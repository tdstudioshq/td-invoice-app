"use client";

import { useActionState, useEffect, useState } from "react";
import { TrashIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { initialActionState, type ActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
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
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
import {
  JOB_PAYMENT_METHODS,
  JOB_PAYMENT_METHOD_LABEL,
  MAX_JOB_PAYMENT_NOTE_LENGTH,
} from "@/lib/partner-jobs/types";
import type { DesignJobPayment, JobPaymentMethod } from "@/lib/types/database";

type PaymentAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * The payment log on one partner job (migration 20260930024624) — the list,
 * its total, and a form to record another.
 *
 * Shared by the partner portal and the studio's job page. Each page passes in
 * the actions that match who is signed in (`app/actions/partner-job-payments.ts`
 * or `admin-partner-job-payments.ts`), so neither bundle references the
 * other's endpoints — the same arrangement as NewJobForm's JobFormActions.
 *
 * Who may remove an entry is decided by the database (a rep's delete policy
 * matches only rows a rep recorded); `viewer` only decides whether to OFFER the
 * button, so a rep is not shown a control that would be refused.
 */
export function JobPayments({
  jobId,
  payments,
  viewer,
  companyName,
  recordAction,
  deleteAction,
}: {
  jobId: string;
  payments: DesignJobPayment[];
  viewer: "partner" | "studio";
  /** How a rep-recorded entry is attributed ("TNT"). */
  companyName: string;
  recordAction: PaymentAction;
  deleteAction: PaymentAction;
}) {
  const total = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground text-sm">Total paid</span>
        <span className="text-2xl tabular-nums">{formatCurrency(total)}</span>
      </div>

      {payments.length === 0 ? (
        <p className="border-glass-border text-muted-foreground rounded-[8px] border border-dashed px-4 py-6 text-center text-sm">
          No payments recorded on this job yet.
        </p>
      ) : (
        <ul className="divide-glass-border border-glass-border divide-y rounded-[8px] border">
          {payments.map((payment) => (
            <PaymentRow
              key={payment.id}
              jobId={jobId}
              payment={payment}
              recordedBy={payment.recorded_by_studio ? "TD Studios" : companyName}
              canDelete={viewer === "studio" || !payment.recorded_by_studio}
              deleteAction={deleteAction}
            />
          ))}
        </ul>
      )}

      <RecordPaymentForm jobId={jobId} recordAction={recordAction} />
    </div>
  );
}

function PaymentRow({
  jobId,
  payment,
  recordedBy,
  canDelete,
  deleteAction,
}: {
  jobId: string;
  payment: DesignJobPayment;
  recordedBy: string;
  canDelete: boolean;
  deleteAction: PaymentAction;
}) {
  const [state, formAction, pending] = useActionState(deleteAction, initialActionState);

  useEffect(() => {
    if (state.success) toast.success("Payment removed");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-base tabular-nums">{formatCurrency(Number(payment.amount))}</p>
        <p className="text-muted-foreground text-sm md:text-xs">
          {formatDate(payment.paid_on)} · {JOB_PAYMENT_METHOD_LABEL[payment.method]} ·
          Recorded by {recordedBy}
        </p>
        {payment.note ? (
          <p className="text-sm break-words whitespace-pre-wrap md:text-xs">{payment.note}</p>
        ) : null}
      </div>
      {canDelete ? (
        <form
          action={formAction}
          onSubmit={(event) => {
            // A misclick must not erase a money record.
            if (!window.confirm("Remove this payment?")) event.preventDefault();
          }}
        >
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="payment_id" value={payment.id} />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            disabled={pending}
            aria-label={`Remove the ${formatCurrency(Number(payment.amount))} payment`}
            className="text-muted-foreground hover:text-destructive size-11 shrink-0 md:size-8"
          >
            <TrashIcon className="size-4" />
          </Button>
        </form>
      ) : null}
    </li>
  );
}

function RecordPaymentForm({
  jobId,
  recordAction,
}: {
  jobId: string;
  recordAction: PaymentAction;
}) {
  // Controlled, so a refused submission keeps what was typed (React resets an
  // uncontrolled form after every action) and a successful one clears it.
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayISO);
  const [method, setMethod] = useState<JobPaymentMethod | "">("");
  const [note, setNote] = useState("");

  // The reset runs inside the action (a transition), not in an effect reacting
  // to its result.
  const [state, formAction] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await recordAction(prev, formData);
      if (result.success) {
        toast.success("Payment recorded");
        setAmount("");
        setNote("");
        setMethod("");
        setPaidOn(todayISO());
      } else if (result.error && !result.fieldErrors) {
        toast.error(result.error);
      }
      return result;
    },
    initialActionState,
  );

  const fieldError = (key: string) => state.fieldErrors?.[key];

  return (
    <form
      action={formAction}
      className="border-glass-border space-y-4 rounded-[8px] border p-4"
    >
      <p className="text-sm">Record a payment</p>
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="method" value={method} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`payment-amount-${jobId}`}>Amount</Label>
          <Input
            id={`payment-amount-${jobId}`}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="$0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={Boolean(fieldError("amount"))}
          />
          {fieldError("amount") ? (
            <p className="text-destructive text-sm md:text-xs">{fieldError("amount")}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`payment-date-${jobId}`}>Date paid</Label>
          <Input
            id={`payment-date-${jobId}`}
            name="paid_on"
            type="date"
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
            aria-invalid={Boolean(fieldError("paidOn"))}
          />
          {fieldError("paidOn") ? (
            <p className="text-destructive text-sm md:text-xs">{fieldError("paidOn")}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`payment-method-${jobId}`}>Method</Label>
          <Select
            value={method}
            onValueChange={(value) => setMethod(value as JobPaymentMethod)}
          >
            <SelectTrigger
              id={`payment-method-${jobId}`}
              className="w-full"
              aria-invalid={Boolean(fieldError("method"))}
            >
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {JOB_PAYMENT_METHODS.map((value) => (
                <SelectItem key={value} value={value}>
                  {JOB_PAYMENT_METHOD_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldError("method") ? (
            <p className="text-destructive text-sm md:text-xs">{fieldError("method")}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`payment-note-${jobId}`}>Note (optional)</Label>
        <Textarea
          id={`payment-note-${jobId}`}
          name="note"
          rows={2}
          maxLength={MAX_JOB_PAYMENT_NOTE_LENGTH}
          placeholder="Deposit, confirmation number…"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {fieldError("note") ? (
          <p className="text-destructive text-sm md:text-xs">{fieldError("note")}</p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <SubmitButton pendingText="Recording…" className="w-full sm:w-auto">
          Record payment
        </SubmitButton>
      </div>
    </form>
  );
}
