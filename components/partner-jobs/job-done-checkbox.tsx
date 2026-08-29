"use client";

import { useTransition } from "react";
import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { setPartnerJobDoneAction } from "@/app/actions/partner-jobs";
import {
  isJobDone,
  isJobDoneLocked,
  type DesignJobStatus,
} from "@/lib/partner-jobs/types";
import { cn } from "@/lib/utils";

/**
 * The rep's "done" checkbox, on a job row and on the job itself.
 *
 * Same control as the dashboard task manager's toggle — a filled circle rather
 * than a square box — so ticking something off looks and means the same thing
 * in both places.
 *
 * A COMPLETED job is done and cannot be un-done from here: `status` is the
 * studio's field, so clearing `partner_done_at` would leave the job in the Done
 * tab anyway and the click would look broken. It renders ticked and disabled
 * with an explanation instead of pretending to be interactive.
 *
 * Deliberately a SIBLING of the row's link everywhere it is used, never nested
 * inside it: a <button> inside an <a> is invalid HTML, and keeping them apart is
 * also what stops a tick from doubling as navigation.
 */
export function JobDoneCheckbox({
  job,
  labelled = false,
  className,
}: {
  job: { id: string; status: DesignJobStatus; partner_done_at: string | null };
  /** Show the word "Done" next to the circle (the detail page; not the list). */
  labelled?: boolean;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const done = isJobDone(job);
  const locked = isJobDoneLocked(job);

  const toggle = () => {
    if (locked || isPending) return;
    startTransition(async () => {
      const result = await setPartnerJobDoneAction({
        jobId: job.id,
        done: !done,
      });
      if ("error" in result) toast.error(result.error);
    });
  };

  const label = locked
    ? "Marked completed by TD Studios"
    : done
      ? "Mark as not done"
      : "Mark as done";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={locked || isPending}
      aria-pressed={done}
      // The visible word is the accessible name when there is one; otherwise the
      // circle needs to say what it does.
      aria-label={labelled ? undefined : label}
      title={label}
      className={cn(
        "shrink-0 transition-colors",
        // min-h-9 is the portal's tap-target floor, applied only to the labelled
        // variant. The bare circle matches the task manager's toggle exactly —
        // no padding — because padding it out would push it off the baseline of
        // the row it sits beside.
        labelled && "inline-flex min-h-9 items-center gap-2 text-sm",
        locked
          ? "cursor-default text-emerald-400"
          : "text-metal-platinum hover:text-emerald-300",
        isPending && "opacity-60",
        className,
      )}
    >
      {done ? (
        <CheckCircleIcon weight="fill" className="size-5 text-emerald-400" />
      ) : (
        <CircleIcon className="size-5" />
      )}
      {labelled ? (
        <span className={cn(done ? "text-emerald-300" : "text-muted-foreground")}>
          {done ? "Done" : "Mark done"}
        </span>
      ) : null}
    </button>
  );
}
