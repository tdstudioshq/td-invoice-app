"use client";

import Link from "next/link";

import { JobDoneCheckbox } from "@/components/partner-jobs/job-done-checkbox";
import { JobPreview } from "@/components/partner-jobs/job-preview";
import { JobStatusBadge } from "@/components/partner-jobs/job-status-badge";
import { formatRelativeTime } from "@/lib/format";
import { partnerHref } from "@/lib/partner-jobs/routing";
import { isJobDone } from "@/lib/partner-jobs/types";
import type { DesignJobListItem } from "@/lib/types/database";
import { cn } from "@/lib/utils";

/**
 * One job as a card in the grid.
 *
 * Kept to five facts — artwork, name, number, how much is on it, when it last
 * moved — plus the status pill and the done checkbox. Everything else about a
 * job (products, notes, per-product artwork) is one tap away on the detail page,
 * and putting it here would make a wall of cards unreadable at a glance, which
 * is the only thing a grid is better at than the list.
 *
 * The checkbox is a SIBLING of the link, never a child: a <button> inside an <a>
 * is invalid HTML. It is positioned over the artwork rather than beside the
 * title so it does not eat a line of the card's text.
 */
export function JobCard({
  job,
  basePath,
}: {
  job: DesignJobListItem;
  basePath: string;
}) {
  const done = isJobDone(job);

  return (
    <div
      className={cn(
        "group border-glass-border bg-glass-highlight/5 relative overflow-hidden rounded-[10px] border transition-colors",
        "hover:border-glass-border/80 hover:bg-glass-highlight/10",
        done && "opacity-75",
      )}
    >
      <Link
        href={partnerHref(basePath, `/jobs/${job.id}`)}
        className="block focus-visible:ring-metal-platinum/60 focus-visible:ring-2 focus-visible:outline-none"
      >
        <JobPreview previews={job.previews} />

        <div className="space-y-1.5 p-3">
          <p
            className={cn(
              "truncate text-sm font-medium",
              done && "line-through decoration-1",
            )}
            title={job.job_name}
          >
            {job.job_name}
          </p>
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span className="tabular-nums">{job.job_number}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {job.file_count} {job.file_count === 1 ? "file" : "files"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-muted-foreground/80 truncate text-[11px]">
              {formatRelativeTime(job.updated_at)}
            </span>
            <JobStatusBadge status={job.status} className="h-5 px-2 text-[11px]" />
          </div>
        </div>
      </Link>

      {/*
        Over the artwork, in a pill so it stays legible on a light image. Only
        the circle is clickable; the rest of the card is the link beneath it.
      */}
      <div className="absolute top-2 left-2 rounded-full bg-black/45 p-1.5 backdrop-blur-sm">
        <JobDoneCheckbox job={job} />
      </div>
    </div>
  );
}
