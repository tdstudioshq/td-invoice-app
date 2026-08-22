"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { updateCustomDesignRequestStatusAction } from "@/app/actions/custom-design-requests";
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
import {
  CUSTOM_DESIGN_REQUEST_STATUSES,
  CUSTOM_DESIGN_REQUEST_STATUS_LABEL,
  type CustomDesignRequestStatus,
} from "@/lib/design-requests/types";

export function CustomDesignStatusForm({
  id,
  status: initialStatus,
}: {
  id: string;
  status: CustomDesignRequestStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [state, formAction] = useActionState(
    updateCustomDesignRequestStatusAction,
    initialActionState,
  );
  useEffect(() => {
    if (state.success) toast.success("Status updated");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <div className="flex-1 space-y-2">
        <Label htmlFor="custom-design-status">Status</Label>
        <Select value={status} onValueChange={(value) => setStatus(value as CustomDesignRequestStatus)}>
          <SelectTrigger id="custom-design-status" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CUSTOM_DESIGN_REQUEST_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>{CUSTOM_DESIGN_REQUEST_STATUS_LABEL[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SubmitButton pendingText="Saving…" disabled={status === initialStatus} className="sm:w-auto">
        Save status
      </SubmitButton>
    </form>
  );
}
