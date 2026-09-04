"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { updatePartnerJobStatusAction } from "@/app/actions/admin-partner-jobs";
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
  DESIGN_JOB_STATUSES,
  DESIGN_JOB_STATUS_LABEL,
  type DesignJobStatus,
} from "@/lib/partner-jobs/types";

/**
 * Move a partner job through its lifecycle. Same shape as
 * components/mylar-requests/status-form.tsx: a shadcn Select mirrored into a
 * hidden input (Radix's trigger isn't a form control), submitted through
 * useActionState with sonner for the result.
 *
 * This is the studio's full-size detail-page control. Partners use the compact
 * RLS-scoped dropdown on their own jobs dashboard; both write the same field.
 */
export function PartnerJobStatusForm({
  id,
  status: initialStatus,
}: {
  id: string;
  status: DesignJobStatus;
}) {
  const [status, setStatus] = useState<DesignJobStatus>(initialStatus);
  const [state, formAction] = useActionState(
    updatePartnerJobStatusAction,
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
        <Label htmlFor="partner-job-status">Status</Label>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as DesignJobStatus)}
        >
          <SelectTrigger id="partner-job-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DESIGN_JOB_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {DESIGN_JOB_STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SubmitButton
        pendingText="Saving…"
        disabled={status === initialStatus}
        className="sm:w-auto"
      >
        Save status
      </SubmitButton>
    </form>
  );
}
