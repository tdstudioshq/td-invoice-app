"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { addPaymentAction } from "@/app/actions/invoices";
import { initialActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { todayISO } from "@/lib/format";

export function RecordPaymentDialog({
  invoiceId,
  balanceDue,
}: {
  invoiceId: string;
  balanceDue: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    addPaymentAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Payment recorded");
      // Close the dialog once the payment is saved.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus />
          Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Log a payment received against this invoice.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="invoice_id" value={invoiceId} />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">
                Amount<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={balanceDue > 0 ? balanceDue.toFixed(2) : ""}
                aria-invalid={Boolean(state.fieldErrors?.amount)}
              />
              {state.fieldErrors?.amount ? (
                <p className="text-destructive text-xs">
                  {state.fieldErrors.amount}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_date">Date</Label>
              <Input
                id="payment_date"
                name="payment_date"
                type="date"
                defaultValue={todayISO()}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="method">Method</Label>
            <Input
              id="method"
              name="method"
              placeholder="Bank transfer, card, cash…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <SubmitButton>Record payment</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
