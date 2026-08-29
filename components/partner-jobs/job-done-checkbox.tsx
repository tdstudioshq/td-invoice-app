"use client";

import { useTransition } from "react";
import { CheckCircleIcon, CircleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { setPartnerJobDoneAction } from "@/app/actions/partner-jobs";
import { isJobDone, type DesignJobStatus } from "@/lib/partner-jobs/types";
import { cn } from "@/lib/utils";

/**
 * The rep's "done" checkbox, on a job row and on the job itself.
 *
 * Same control as the dashboard task manager's toggle — a filled circle rather
 * than a square box — so ticking something off looks and means the same thing
 * in both places.
 *
 * It writes the job's `status` — the SAME field the studio's Complete checkbox
 * on /partner-jobs writes — so the two views are one answer and can never
 * disagree. A rep may make only the two moves this control offers
 * (`-> completed`, and `completed -> in_progress`); a trigger reverts anything
 * else, so the `new` vs `in_progress` distinction stays the studio's without
 * this component having to know about it.
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
  job: { id: string; status: DesignJobStatus };
  /** Show the word "Done" next to the circle (the detail page; not the list). */
  labelled?: boolean;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const done = isJobDone(job);

  const toggle = () => {
    if (isPending) return;
    startTransition(async () => {
      const result = await setPartnerJobDoneAction({
        jobId: job.id,
        done: !done,
      });
      if ("error" in result) toast.error(result.error);
    });
  };

  const label = done ? "Mark as not done" : "Mark as done";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
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
        "text-metal-platinum hover:text-emerald-300",
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
