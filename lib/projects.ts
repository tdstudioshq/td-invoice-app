import type { ClientProject, ProjectStatus } from "@/lib/types/database";

// Lifecycle order of a client project, from staging to retirement.
export const PROJECT_STATUSES: ProjectStatus[] = [
  "draft",
  "in_progress",
  "awaiting_review",
  "revision_requested",
  "approved",
  "completed",
  "archived",
];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  awaiting_review: "Awaiting Review",
  revision_requested: "Revision Requested",
  approved: "Approved",
  completed: "Completed",
  archived: "Archived",
};

// Statuses the portal never sees. Must stay in sync with the
// client_projects_portal_select / client_files_portal_select policies in
// supabase/migrations/0016_client_projects.sql — the admin "view as client"
// preview filters with these in code, mirroring what RLS enforces for real
// portal sessions.
export const PORTAL_HIDDEN_PROJECT_STATUSES: ProjectStatus[] = [
  "draft",
  "archived",
];

export function isPortalVisibleProject(
  project: Pick<ClientProject, "status">,
): boolean {
  return !PORTAL_HIDDEN_PROJECT_STATUSES.includes(project.status);
}
