"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";

import { sendInvoiceAction } from "@/app/actions/invoices";
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

/**
 * Emails the invoice (as a PDF) to the client. Confirmation dialog showing the
 * recipient, since this sends real outbound mail. Rendered only when the client
 * has an email address.
 */
export function SendInvoiceDialog({
  invoiceId,
  recipientEmail,
}: {
  invoiceId: string;
  recipientEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    sendInvoiceAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(`Invoice emailed to ${state.data?.email ?? recipientEmail}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, recipientEmail]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Mail />
          Email to client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Email this invoice?</DialogTitle>
          <DialogDescription>
            A PDF copy will be sent to{" "}
            <span className="text-foreground font-medium">
              {recipientEmail}
            </span>
            . A draft invoice will be marked as sent.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="id" value={invoiceId} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <SubmitButton pendingText="Sending…">Send invoice</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
