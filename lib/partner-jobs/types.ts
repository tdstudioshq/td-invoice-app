import type {
  DesignJobStatus,
  PartnerJobEventType,
  PartnerProductFinish,
  PartnerProductType,
} from "@/lib/types/database";

/**
 * Domain model for the print-partner job portal (migration
 * 20260825120000_partner_job_portal.sql).
 *
 * Server- AND client-safe: no `server-only`, no Supabase imports, so the
 * submission form, the dashboards and the server actions all share one list.
 *
 * Every list here is a `check` constraint in SQL, not a pg enum — widen the two
 * together or a value the UI offers will be rejected on insert.
 */

export const PARTNER_PRODUCT_TYPES = [
  "eighth_bag",
  "seven_gram_bag",
  "two_in_one_bag",
  "pound_bag",
  "jar_100ml",
  "jar_150ml",
  "jar_250ml",
] as const satisfies readonly PartnerProductType[];

export const PARTNER_PRODUCT_TYPE_LABEL: Record<PartnerProductType, string> = {
  eighth_bag: "8th Bag",
  seven_gram_bag: "7G Bag",
  two_in_one_bag: "2-in-1 Bag",
  pound_bag: "Pound Bag",
  jar_100ml: "100ml Jar",
  jar_150ml: "150ml Jar",
  jar_250ml: "250ml Jar",
};

export const PARTNER_PRODUCT_FINISHES = [
  "matte",
  "spot_gloss",
] as const satisfies readonly PartnerProductFinish[];

export const PARTNER_PRODUCT_FINISH_LABEL: Record<PartnerProductFinish, string> =
  {
    matte: "Matte Finish",
    spot_gloss: "Spot Gloss",
  };

export const DESIGN_JOB_STATUSES = [
  "new",
  "in_progress",
  "completed",
] as const satisfies readonly DesignJobStatus[];

export const DESIGN_JOB_STATUS_LABEL: Record<DesignJobStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  completed: "Completed",
};

export function productTypeLabel(value: string): string {
  return (
    PARTNER_PRODUCT_TYPE_LABEL[value as PartnerProductType] ?? value
  );
}

export function productFinishLabel(value: string): string {
  return (
    PARTNER_PRODUCT_FINISH_LABEL[value as PartnerProductFinish] ?? value
  );
}

export function designJobStatusLabel(value: string): string {
  return DESIGN_JOB_STATUS_LABEL[value as DesignJobStatus] ?? value;
}

/**
 * "Complete" is ONE shared answer, and `status` is it.
 *
 * Both checkboxes — the studio's on /partner-jobs and the rep's in the portal —
 * write this same field, so the two views can never disagree (migration
 * 20260829180000). A rep may make only the two moves a checkbox can make
 * (`-> completed`, and `completed -> in_progress`); the `new` vs `in_progress`
 * distinction stays the studio's, behind the Status dropdown, enforced by the
 * trigger rather than by hiding a control.
 *
 * This replaced an earlier design where the rep had a separate `partner_done_at`
 * column. That column still exists and is retired — nothing reads or writes it.
 */
export function isJobDone(job: { status: DesignJobStatus }): boolean {
  return job.status === "completed";
}

/** Un-ticking lands here, never on `new`: see the migration for why. */
export const JOB_INCOMPLETE_STATUS: DesignJobStatus = "in_progress";

/**
 * The jobs list is tabbed by status, with Done pulled out in front of it.
 *
 * A PARTITION, not a set of filters: `partnerJobTab()` returns exactly one tab
 * per job, so the three counts always sum to the "All" count and a job is never
 * in two places. That is why Done wins over the job's status — a job the rep
 * ticked while the studio still has it `in_progress` belongs under Done, which
 * is the whole point of ticking it.
 */
export const PARTNER_JOB_TABS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
] as const;

export type PartnerJobTab = (typeof PARTNER_JOB_TABS)[number]["id"];

/** Coerce a `?tab=` search param to a real tab; anything unknown means All. */
export function parsePartnerJobTab(value: string | undefined): PartnerJobTab {
  return PARTNER_JOB_TABS.some((tab) => tab.id === value)
    ? (value as PartnerJobTab)
    : "all";
}

/** The ONE tab a job belongs to. */
export function partnerJobTab(job: {
  status: DesignJobStatus;
}): Exclude<PartnerJobTab, "all"> {
  if (isJobDone(job)) return "done";
  return job.status === "in_progress" ? "in_progress" : "new";
}

export function filterPartnerJobsByTab<T extends { status: DesignJobStatus }>(
  jobs: T[],
  tab: PartnerJobTab,
): T[] {
  return tab === "all" ? jobs : jobs.filter((job) => partnerJobTab(job) === tab);
}

/** Counts for the tab chips. Derived from the same partition, so they agree. */
export function countPartnerJobsByTab(
  jobs: { status: DesignJobStatus }[],
): Record<PartnerJobTab, number> {
  const counts: Record<PartnerJobTab, number> = {
    all: jobs.length,
    new: 0,
    in_progress: 0,
    done: 0,
  };
  for (const job of jobs) counts[partnerJobTab(job)] += 1;
  return counts;
}

/**
 * Form bounds. These are the numbers the browser enforces for UX; the server
 * action re-checks all of them with zod, and the table's check constraints are
 * the final word (see the migration).
 */
export const MAX_JOB_ITEMS = 25;
/**
 * Across the WHOLE job, not per product. A job's files are downloaded as one
 * zip and live in one bucket prefix, so the total is the number that matters;
 * a per-product cap would only add an error message without bounding anything
 * the job-wide one does not already bound.
 */
export const MAX_JOB_FILES = 20;
export const MAX_JOB_NAME_LENGTH = 160;
export const MAX_JOB_NOTES_LENGTH = 4000;
/**
 * Per-product notes are an instruction about one product ("darker green, matte
 * on the lid"), not the job's brief — shorter than MAX_JOB_NOTES_LENGTH on
 * purpose. Mirrors the `check` on design_job_items.notes in migration
 * 20260827000000; widen the two together.
 */
export const MAX_ITEM_NOTES_LENGTH = 2000;
export const MAX_ITEM_QUANTITY = 10_000_000;

export type {
  DesignJobStatus,
  PartnerJobEventType,
  PartnerProductFinish,
  PartnerProductType,
};

// ---------------------------------------------------------------------------
// Jobs grid — previews, view mode, search and sort
// ---------------------------------------------------------------------------

/**
 * How many images a card's slideshow may cycle through.
 *
 * A hard cap, applied server-side in summarizeJobFiles(), because it bounds
 * REQUESTS and not just pixels: a 20-file job would otherwise become 20 thumb
 * requests the moment its card scrolled into view. Four is enough to read as a
 * slideshow and keeps a fully-scrolled 200-job page under a thousand images
 * even in the worst case.
 */
export const PREVIEWS_PER_JOB = 4;

/** Milliseconds a slideshow holds on each image. Slow on purpose — a grid of
 *  these should read as ambient, not as something demanding attention. */
export const PREVIEW_SLIDE_MS = 3800;

export const PARTNER_JOB_VIEWS = ["grid", "list"] as const;
export type PartnerJobView = (typeof PARTNER_JOB_VIEWS)[number];

/**
 * The chosen view rides in a COOKIE rather than localStorage, so the server
 * component renders the right one on the first paint. localStorage would mean
 * shipping grid markup, hydrating, reading storage and swapping to list — a
 * visible flash on every navigation for anyone who prefers the list.
 *
 * Not httpOnly: it is written by the toggle with document.cookie and carries no
 * security meaning whatsoever, so a forged value can only change how the
 * forger's own page looks.
 */
export const PARTNER_JOB_VIEW_COOKIE = "zaza_jobs_view";

export function parsePartnerJobView(
  value: string | undefined,
): PartnerJobView {
  return (PARTNER_JOB_VIEWS as readonly string[]).includes(value ?? "")
    ? (value as PartnerJobView)
    : "grid";
}

export const PARTNER_JOB_SORTS = [
  { id: "recent", label: "Recently updated" },
  { id: "newest", label: "Newest" },
  { id: "name", label: "Name (A–Z)" },
] as const;

export type PartnerJobSort = (typeof PARTNER_JOB_SORTS)[number]["id"];

/**
 * Default is "recently updated", not "newest".
 *
 * These two only diverge because migration 20260829000000 made `updated_at`
 * honest — a trigger on design_job_files bumps it, so adding artwork counts as
 * activity. Without that, "recently updated" would silently mean "recently
 * renamed" and the default would be a lie.
 */
export const DEFAULT_PARTNER_JOB_SORT: PartnerJobSort = "recent";

export function parsePartnerJobSort(value: string | undefined): PartnerJobSort {
  return PARTNER_JOB_SORTS.some((sort) => sort.id === value)
    ? (value as PartnerJobSort)
    : DEFAULT_PARTNER_JOB_SORT;
}

interface SortableJob {
  job_name: string;
  job_number: string;
  created_at: string;
  updated_at: string;
}

/** Pure, and total — never mutates its input, so it is safe to call in render. */
export function sortPartnerJobs<T extends SortableJob>(
  jobs: T[],
  sort: PartnerJobSort,
): T[] {
  const copy = [...jobs];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "name":
      return copy.sort((a, b) =>
        a.job_name.localeCompare(b.job_name, undefined, { sensitivity: "base" }),
      );
    case "recent":
    default:
      return copy.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
}

/**
 * Search over the two things a rep actually remembers about a job: what they
 * called it, and its ZA-#### number. Deliberately not a fuzzy matcher — a
 * substring match on ≤200 rows is instant and never surprises anyone by
 * "helpfully" matching something they did not type.
 */
export function searchPartnerJobs<
  T extends { job_name: string; job_number: string },
>(jobs: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return jobs;
  return jobs.filter(
    (job) =>
      job.job_name.toLowerCase().includes(q) ||
      job.job_number.toLowerCase().includes(q),
  );
}

// ---------------------------------------------------------------------------
// Activity events (migration 20260829000000)
// ---------------------------------------------------------------------------

/**
 * Every event type the log accepts. Mirrors the `check` constraint on
 * partner_job_events.event_type and `PartnerJobEventType` in
 * lib/types/database.ts — widen all three together.
 */
export const PARTNER_JOB_EVENT_TYPES = [
  "job.created",
  "job.updated",
  "job.status_changed",
  "job.done_changed",
  "file.added",
  "file.removed",
  "job.deleted",
] as const satisfies readonly PartnerJobEventType[];

/** Short label for a timeline row. The detail sits in the event's metadata. */
export const PARTNER_JOB_EVENT_LABEL: Record<PartnerJobEventType, string> = {
  "job.created": "Job submitted",
  "job.updated": "Job details changed",
  "job.status_changed": "Status changed",
  "job.done_changed": "Marked done",
  "file.added": "Artwork added",
  "file.removed": "Artwork removed",
  "job.deleted": "Job deleted",
};

export function partnerJobEventLabel(value: string): string {
  return PARTNER_JOB_EVENT_LABEL[value as PartnerJobEventType] ?? value;
}

/**
 * Which events are worth telling a human about, as opposed to merely worth
 * recording.
 *
 * `job.done_changed` is deliberately absent: a rep ticking their own checkbox is
 * their own bookkeeping, and emailing the studio every time someone tidies their
 * list is exactly the noise this set exists to prevent. It is still logged, so
 * it shows on the timeline and can be un-muted later by removing it from here.
 *
 * A per-company `muted_events` array subtracts from this set; nothing adds to
 * it, so a company can only ever be told less than this.
 */
export const NOTIFIABLE_PARTNER_JOB_EVENTS = [
  "job.created",
  "job.updated",
  "job.status_changed",
  "file.added",
  "file.removed",
  "job.deleted",
] as const satisfies readonly PartnerJobEventType[];

export function isNotifiableEvent(type: PartnerJobEventType): boolean {
  return (NOTIFIABLE_PARTNER_JOB_EVENTS as readonly string[]).includes(type);
}

/**
 * The admin list's two sections.
 *
 * The same split the checkbox makes, from the same field, which is what stops a
 * ticked box and its section from ever disagreeing: "Complete" is
 * `status === "completed"` and "In progress" is everything else — `new` and
 * `in_progress` together, since from the studio's point of view both mean the
 * job is still on the pile.
 */
export function splitJobsByCompletion<T extends { status: DesignJobStatus }>(
  jobs: T[],
): { inProgress: T[]; complete: T[] } {
  const inProgress: T[] = [];
  const complete: T[] = [];
  for (const job of jobs) (isJobDone(job) ? complete : inProgress).push(job);
  return { inProgress, complete };
}
