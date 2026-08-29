"use client";

import { useTransition } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

import { setPartnerJobCompleteAction } from "@/app/actions/admin-partner-jobs";
import { isJobDone, type DesignJobStatus } from "@/lib/partner-jobs/types";
import { cn } from "@/lib/utils";

/**
 * The studio's Complete checkbox on the partner jobs list.
 *
 * The admin twin of components/partner-jobs/job-done-checkbox.tsx, and a
 * separate file rather than a shared one for two reasons that both matter: the
 * admin group uses lucide icons where the partner portal uses Phosphor (see the
 * icon split in CLAUDE.md), and the two call different server actions behind
 * different auth — `requireAdmin()` here, the rep's own session there.
 *
 * They write the SAME field, though, which is the whole point: ticking here
 * marks the job complete for Zaza too, and vice versa.
 *
 * Rendered as a SIBLING of the row's link, never a child — a <button> inside an
 * <a> is invalid HTML, and keeping them apart also stops a tick from doubling as
 * navigation.
 */
export function AdminJobCompleteCheckbox({
  job,
  className,
}: {
  job: { id: string; status: DesignJobStatus };
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const complete = isJobDone(job);

  const toggle = () => {
    if (isPending) return;
    startTransition(async () => {
      const result = await setPartnerJobCompleteAction({
        id: job.id,
        complete: !complete,
      });
      if (result.error) toast.error(result.error);
    });
  };

  const label = complete ? "Mark as not complete" : "Mark as complete";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={complete}
      aria-label={label}
      title={label}
      className={cn(
        "text-metal-platinum shrink-0 transition-colors hover:text-emerald-300",
        isPending && "opacity-60",
        className,
      )}
    >
      {complete ? (
        <CheckCircle2 className="size-5 text-emerald-400" />
      ) : (
        <Circle className="size-5" />
      )}
    </button>
  );
}
