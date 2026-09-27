import {
  createPartnerJobUploadTicketsAction,
  discardPartnerJobFilesAction,
  submitPartnerJobAction,
} from "@/app/actions/partner-jobs";
import {
  deletePartnerJobAction,
  updatePartnerJobAction,
} from "@/app/actions/partner-job-edits";
import type { JobFormActions } from "@/components/partner-jobs/new-job-form";

/**
 * The rep's action set for NewJobForm — cookie-scoped, RLS-bound. The studio's
 * pages build their own from app/actions/admin-partner-job-writes.ts.
 */
export const PARTNER_JOB_FORM_ACTIONS: JobFormActions = {
  mintTickets: createPartnerJobUploadTicketsAction,
  submit: submitPartnerJobAction,
  update: updatePartnerJobAction,
  remove: deletePartnerJobAction,
  discard: discardPartnerJobFilesAction,
};
