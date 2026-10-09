"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { initialActionState, type ActionState } from "@/app/actions/types";
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
  MYLAR_INQUIRY_STATUSES,
  MYLAR_INQUIRY_STATUS_LABEL,
  type MylarInquiryStatus,
} from "@/lib/mylar-printing/types";

/**
 * Move an inquiry through its lifecycle. Same shape as
 * components/portal/project-edit-form.tsx: a shadcn Select mirrored into a
 * hidden input (Radix's trigger isn't a form control), submitted through
 * useActionState with sonner for the result.
 *
 * The action is a prop, not an import: the admin page passes the requireAdmin()
 * action and the emailed share page passes the signed-key one (with the key as
 * a hidden field), so neither bundle references the other's endpoint.
 */
export function MylarStatusForm({
  id,
  status: initialStatus,
  action,
  hiddenFields,
}: {
  id: string;
  status: MylarInquiryStatus;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  hiddenFields?: Record<string, string>;
}) {
  const [status, setStatus] = useState<MylarInquiryStatus>(initialStatus);
  const [state, formAction] = useActionState(
    action,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) toast.success("Status updated");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="id" value={id} />
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="status" value={status} />
      <div className="flex-1 space-y-2">
        <Label htmlFor="mylar-status">Status</Label>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as MylarInquiryStatus)}
        >
          <SelectTrigger id="mylar-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MYLAR_INQUIRY_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {MYLAR_INQUIRY_STATUS_LABEL[value]}
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
