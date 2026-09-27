import "server-only";

import {
  adminCreatePartnerJobUploadTicketsAction,
  adminDeletePartnerJobAction,
  adminDiscardPartnerJobFilesAction,
  adminSubmitPartnerJobAction,
  adminUpdatePartnerJobAction,
} from "@/app/actions/admin-partner-job-writes";
import type { JobFormActions } from "@/components/partner-jobs/new-job-form";

/**
 * The studio's action set for NewJobForm, bound to one company on the server.
 * Bound arguments travel encrypted, and every action re-asserts requireAdmin()
 * and re-checks that a job belongs to that company, so the binding is a
 * convenience rather than the boundary.
 */
export function adminJobFormActions(companyId: string): JobFormActions {
  return {
    mintTickets: adminCreatePartnerJobUploadTicketsAction.bind(null, companyId),
    submit: adminSubmitPartnerJobAction.bind(null, companyId),
    update: adminUpdatePartnerJobAction.bind(null, companyId),
    remove: adminDeletePartnerJobAction.bind(null, companyId),
    discard: adminDiscardPartnerJobFilesAction.bind(null, companyId),
  };
}
