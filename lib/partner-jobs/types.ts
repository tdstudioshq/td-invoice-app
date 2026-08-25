import type {
  DesignJobStatus,
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
] as const satisfies readonly PartnerProductType[];

export const PARTNER_PRODUCT_TYPE_LABEL: Record<PartnerProductType, string> = {
  eighth_bag: "8th Bag",
  seven_gram_bag: "7G Bag",
  two_in_one_bag: "2-in-1 Bag",
  pound_bag: "Pound Bag",
  jar_100ml: "100ml Jar",
  jar_150ml: "150ml Jar",
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
 * Form bounds. These are the numbers the browser enforces for UX; the server
 * action re-checks all of them with zod, and the table's check constraints are
 * the final word (see the migration).
 */
export const MAX_JOB_ITEMS = 25;
export const MAX_JOB_FILES = 20;
export const MAX_JOB_NAME_LENGTH = 160;
export const MAX_JOB_NOTES_LENGTH = 4000;
export const MAX_ITEM_QUANTITY = 10_000_000;

export type { DesignJobStatus, PartnerProductFinish, PartnerProductType };
