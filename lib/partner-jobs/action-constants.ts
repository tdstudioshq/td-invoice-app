import "server-only";

/**
 * Constants shared by the two partner-job Server Action modules
 * (`app/actions/partner-jobs.ts` for the create flow, `partner-job-edits.ts`
 * for the edit flow). They live here rather than in either action file because
 * a `"use server"` module may only export async functions.
 */

export const PARTNER_JOB_BUCKET = "partner-job-files";

export const NOT_A_PARTNER =
  "Your account doesn't have access to this partner portal.";

export const NOT_CONFIGURED =
  "Ordering isn't available right now. Please try again shortly.";
