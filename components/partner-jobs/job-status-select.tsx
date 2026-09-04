"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setPartnerJobStatusAction } from "@/app/actions/partner-jobs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DesignJobStatus } from "@/lib/partner-jobs/types";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: {
  value: DesignJobStatus;
  label: string;
  triggerLabel: string;
  dot: string;
}[] = [
  {
    value: "new",
    label: "New / Untouched",
    triggerLabel: "New",
    dot: "bg-sky-300",
  },
  {
    value: "in_progress",
    label: "In Progress",
    triggerLabel: "In Progress",
    dot: "bg-amber-300",
  },
  {
    value: "completed",
    label: "Complete",
    triggerLabel: "Complete",
    dot: "bg-emerald-300",
  },
];

const STATUS_TRIGGER_STYLES: Record<DesignJobStatus, string> = {
  new: "border-sky-300/25 bg-sky-400/10 text-sky-300",
  in_progress: "border-amber-300/25 bg-amber-400/10 text-amber-300",
  completed: "border-emerald-300/25 bg-emerald-400/10 text-emerald-300",
};

/**
 * Compact status editor shared by the grid card and both list layouts.
 *
 * The selection updates immediately, then the server action writes through the
 * caller's cookie-scoped Supabase client. A failed write rolls the control back;
 * a successful one refreshes the page so tab counts, sorting, strike-throughs,
 * and the quick Done checkbox all reconcile to the same stored status.
 */
export function JobStatusSelect({
  job,
  className,
}: {
  job: { id: string; job_number: string; status: DesignJobStatus };
  className?: string;
}) {
  // A changed server status remounts the stateful control. This keeps a quick
  // Done click or another tab's update in sync without mirroring props through
  // an effect (and still lets the inner control update optimistically).
  return (
    <JobStatusSelectState
      key={`${job.id}:${job.status}`}
      job={job}
      className={className}
    />
  );
}

function JobStatusSelectState({
  job,
  className,
}: {
  job: { id: string; job_number: string; status: DesignJobStatus };
  className?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(job.status);
  const [isPending, startTransition] = useTransition();

  const chooseStatus = (value: string) => {
    const next = value as DesignJobStatus;
    if (isPending || next === status) return;

    const previous = status;
    setStatus(next);
    startTransition(async () => {
      const result = await setPartnerJobStatusAction({
        jobId: job.id,
        status: next,
      });
      if ("error" in result) {
        setStatus(previous);
        toast.error(result.error);
        return;
      }

      setStatus(result.status);
      toast.success(
        `Status changed to ${STATUS_OPTIONS.find((option) => option.value === result.status)?.triggerLabel ?? result.status}.`,
      );
      router.refresh();
    });
  };

  const selected =
    STATUS_OPTIONS.find((option) => option.value === status) ?? STATUS_OPTIONS[0];

  return (
    <Select value={status} onValueChange={chooseStatus} disabled={isPending}>
      <SelectTrigger
        size="sm"
        aria-label={`Status for ${job.job_number}`}
        aria-busy={isPending}
        title={`Change status for ${job.job_number}`}
        className={cn(
          "rounded-full px-2.5 shadow-[inset_0_1px_0_var(--glass-highlight)]",
          STATUS_TRIGGER_STYLES[status],
          isPending && "opacity-60",
          className,
        )}
      >
        <SelectValue>{selected.triggerLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", option.dot)}
            />
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
