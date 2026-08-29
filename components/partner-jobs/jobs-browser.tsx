"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  MagnifyingGlassIcon,
  RowsIcon,
  SquaresFourIcon,
  XIcon,
} from "@phosphor-icons/react";

import { JobCard } from "@/components/partner-jobs/job-card";
import { JobDoneCheckbox } from "@/components/partner-jobs/job-done-checkbox";
import { JobStatusBadge } from "@/components/partner-jobs/job-status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { partnerHref } from "@/lib/partner-jobs/routing";
import {
  PARTNER_JOB_SORTS,
  PARTNER_JOB_VIEW_COOKIE,
  isJobDone,
  searchPartnerJobs,
  sortPartnerJobs,
  type PartnerJobSort,
  type PartnerJobView,
} from "@/lib/partner-jobs/types";
import type { DesignJobListItem } from "@/lib/types/database";
import { cn } from "@/lib/utils";

/**
 * Search, sort, and the grid/list switch for the rep's jobs.
 *
 * WHY THIS IS CLIENT-SIDE WHILE THE TABS ARE NOT. The status tabs are a PLACE —
 * you can link to "Done", and it belongs in the URL. Search and sort are how you
 * are looking at that place right now: they should be instant, they should not
 * push history entries, and nobody wants to share a link to "sorted by name".
 * The list is already capped at 200 rows server-side, so filtering it here is a
 * keystroke, not a round trip.
 *
 * The VIEW rides in a cookie rather than in state or localStorage so the server
 * renders the right one on the first paint — see PARTNER_JOB_VIEW_COOKIE. It is
 * written here with document.cookie because it carries no security meaning at
 * all; the worst a forged value can do is show its author the other layout.
 */
export function JobsBrowser({
  jobs,
  basePath,
  initialView,
}: {
  jobs: DesignJobListItem[];
  basePath: string;
  initialView: PartnerJobView;
}) {
  const [view, setView] = useState<PartnerJobView>(initialView);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PartnerJobSort>("recent");

  const visible = useMemo(
    () => sortPartnerJobs(searchPartnerJobs(jobs, query), sort),
    [jobs, query, sort],
  );

  function chooseView(next: PartnerJobView) {
    setView(next);
    // Path-scoped to the portal and a year long. Not httpOnly by design: the
    // server only ever reads it to pick a layout.
    document.cookie = `${PARTNER_JOB_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search jobs by name or number"
            aria-label="Search jobs"
            className="border-glass-border bg-glass-highlight/5 placeholder:text-muted-foreground/70 focus-visible:ring-metal-platinum/50 h-10 w-full rounded-[8px] border pr-9 pl-9 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 p-1"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="jobs-sort">
            Sort jobs
          </label>
          {/*
            A native <select>, not the shadcn one: it sits beside a search box in
            a toolbar, and the OS picker is the better control on a phone.
          */}
          <select
            id="jobs-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as PartnerJobSort)}
            className="border-glass-border bg-glass-highlight/5 focus-visible:ring-metal-platinum/50 h-10 flex-1 rounded-[8px] border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none sm:flex-none"
          >
            {PARTNER_JOB_SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          <div
            role="group"
            aria-label="View"
            className="border-glass-border flex h-10 shrink-0 items-center gap-1 rounded-[8px] border p-1"
          >
            <ViewButton
              active={view === "grid"}
              onClick={() => chooseView("grid")}
              label="Grid view"
            >
              <SquaresFourIcon className="size-4" weight={view === "grid" ? "fill" : "regular"} />
            </ViewButton>
            <ViewButton
              active={view === "list"}
              onClick={() => chooseView("list")}
              label="List view"
            >
              <RowsIcon className="size-4" weight={view === "list" ? "fill" : "regular"} />
            </ViewButton>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="border-glass-border rounded-[10px] border border-dashed px-6 py-14 text-center">
          <p className="text-sm font-medium">No jobs match “{query}”</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Try part of the job name, or its ZA number.
          </p>
        </div>
      ) : view === "grid" ? (
        // Columns come from available width, not from device guesses: two up on
        // a phone, four on the 5xl shell the portal is capped at.
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
          {visible.map((job) => (
            <JobCard key={job.id} job={job} basePath={basePath} />
          ))}
        </div>
      ) : (
        <JobList jobs={visible} basePath={basePath} />
      )}
    </>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-[6px] transition-colors",
        active
          ? "bg-glass-highlight/25 text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The original list view, unchanged in substance — mobile cards below `sm`, a
 * table above it. Kept because a rep scanning for one ZA number reads a table
 * far faster than a wall of artwork, which is exactly why the toggle exists
 * rather than the grid simply replacing this.
 */
function JobList({
  jobs,
  basePath,
}: {
  jobs: DesignJobListItem[];
  basePath: string;
}) {
  return (
    <>
      <div className="space-y-3 sm:hidden">
        {jobs.map((job) => (
          <div
            key={job.id}
            className={cn(
              "glass flex items-start gap-3 rounded-[8px] p-4",
              isJobDone(job) && "opacity-70",
            )}
          >
            <JobDoneCheckbox job={job} className="mt-0.5" />
            <Link
              href={partnerHref(basePath, `/jobs/${job.id}`)}
              className="min-w-0 flex-1"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{job.job_number}</p>
                  <p
                    className={cn(
                      "text-muted-foreground mt-0.5 truncate text-sm",
                      isJobDone(job) && "line-through",
                    )}
                  >
                    {job.job_name}
                  </p>
                </div>
                <JobStatusBadge status={job.status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">
                    Products
                  </dt>
                  <dd className="mt-0.5 tabular-nums">
                    {job.item_count}
                    {job.item_count === 1 ? " item" : " items"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">
                    Updated
                  </dt>
                  <dd className="mt-0.5">{formatRelativeTime(job.updated_at)}</dd>
                </div>
              </dl>
            </Link>
          </div>
        ))}
      </div>

      <div className="glass hidden overflow-x-auto rounded-[8px] sm:block">
        <Table className="min-w-[760px]">
          <TableHeader className="bg-glass-highlight/10">
            <TableRow>
              <TableHead className="w-10 pl-4">
                <span className="sr-only">Done</span>
              </TableHead>
              <TableHead className="px-4">Job</TableHead>
              <TableHead className="px-4">Name</TableHead>
              <TableHead className="px-4 text-right">Products</TableHead>
              <TableHead className="px-4 text-right">Files</TableHead>
              <TableHead className="px-4">Updated</TableHead>
              <TableHead className="px-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const done = isJobDone(job);
              return (
                <TableRow
                  key={job.id}
                  className="hover:bg-glass-highlight/10 transition-colors"
                >
                  <TableCell className="w-10 py-3.5 pl-4">
                    <JobDoneCheckbox job={job} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "px-4 py-3.5 font-medium",
                      done && "text-muted-foreground",
                    )}
                  >
                    <Link
                      href={partnerHref(basePath, `/jobs/${job.id}`)}
                      className="hover:text-metal-platinum transition-colors"
                    >
                      {job.job_number}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-72 truncate px-4 py-3.5">
                    <Link
                      href={partnerHref(basePath, `/jobs/${job.id}`)}
                      className={cn(
                        "text-muted-foreground hover:text-foreground transition-colors",
                        done && "line-through",
                      )}
                    >
                      {job.job_name}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-right tabular-nums">
                    {job.item_count}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-right tabular-nums">
                    {job.file_count}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground px-4 py-3.5 whitespace-nowrap"
                    title={formatDate(job.updated_at)}
                  >
                    {formatRelativeTime(job.updated_at)}
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    <JobStatusBadge status={job.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
