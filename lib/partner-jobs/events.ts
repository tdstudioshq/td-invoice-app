import "server-only";

import { after } from "next/server";

import { getSiteUrl } from "@/lib/email/client";
import { dispatchPartnerNotification } from "@/lib/notifications/dispatch";
import type { NotificationMessage } from "@/lib/notifications/types";
import {
  isNotifiableEvent,
  partnerJobEventLabel,
  type PartnerJobEventType,
} from "@/lib/partner-jobs/types";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";

/**
 * The single seam between "something happened in the portal" and "somebody is
 * told about it".
 *
 * THE WHOLE PIPELINE, IN ORDER:
 *
 *   server action  ->  database/storage write (already committed)
 *   ->  recordPartnerJobEvent()   — normalizes it and logs one row
 *   ->  dispatchPartnerNotification()  — resolves per-company settings
 *   ->  a channel (email today, SMS later)
 *
 * Every step after the first is deliberately unaware of the ones around it. An
 * action names WHAT happened and knows nothing about email; the dispatcher
 * decides WHETHER to tell anyone and knows nothing about jobs; a channel decides
 * HOW and knows nothing about either. That is why adding SMS touches one
 * directory and no action, and why no component anywhere imports any of this.
 *
 * TWO CLIENTS, AND THE SPLIT IS THE ATTRIBUTION MODEL:
 *
 *   * a REP's event goes through the COOKIE-SCOPED client, so the RPC's
 *     auth.uid() is theirs and it DERIVES the company, the actor and the job's
 *     identity rather than believing any of them. A rep therefore cannot log an
 *     event against another company, or under somebody else's name.
 *   * the STUDIO's event goes through the SERVICE ROLE, which has no auth.uid()
 *     — the same arrangement as every other admin write against these tables,
 *     since they carry no `owner_id`. Only that path may set `actorLabel`.
 *
 * TIMING. The event row is written INLINE, because it is the record and losing
 * it would be losing the audit trail. The notification is handed to `after()`,
 * so a rep filing a job never waits on Resend — the response is already sent by
 * the time the email is attempted. Neither can fail the action: everything here
 * is caught and logged.
 */

export type PartnerEventActor =
  | { kind: "partner" }
  /** Only the service role may name itself; a rep's label is derived, not sent. */
  | { kind: "studio"; label?: string };

export interface PartnerJobEventInput {
  /** Null only for `job.deleted`, where the row is already gone. */
  jobId: string | null;
  jobNumber: string;
  jobName: string;
  companyId: string;
  companyName: string;
  eventType: PartnerJobEventType;
  actor: PartnerEventActor;
  /** Rendered into the notification as extra rows, and stored verbatim. */
  metadata?: Record<string, string | number | boolean | null>;
  /** One human sentence for the notification, e.g. "New → In Progress". */
  summary?: string;
  /** Who it reads as in the notification ("Marty", "Zaza", "TD Studios"). */
  actorDisplay: string;
}

/**
 * Where the STUDIO reads a job. Notifications go to TD Studios, so they link to
 * the admin view on the main site — never to the partner subdomain, which an
 * admin has no session on.
 */
function adminJobUrl(jobId: string | null): string {
  const base = getSiteUrl();
  return jobId ? `${base}/partner-jobs/${jobId}` : `${base}/partner-jobs`;
}

function buildMessage(input: PartnerJobEventInput): NotificationMessage {
  const label = partnerJobEventLabel(input.eventType);
  const lines: [string, string][] = [
    ["Job", `${input.jobNumber} — ${input.jobName}`],
    ["Partner", input.companyName],
    ["Event", input.summary ? `${label} — ${input.summary}` : label],
    ["Updated by", input.actorDisplay],
    ["Time", new Date().toLocaleString("en-US", { timeZone: "America/New_York" })],
  ];
  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    if (value === null || value === "" || value === false) continue;
    lines.push([humanizeKey(key), String(value)]);
  }

  return {
    // "ZAZA Orders — New Job". The company leads because the studio may run
    // several portals, and it is the first thing they need to triage on.
    subject: `${input.companyName.toUpperCase()} Orders — ${label}`,
    heading: label,
    lines,
    actionUrl: adminJobUrl(input.jobId),
    actionLabel: "View job",
  };
}

/** `filesAdded` -> `Files added`. Keeps metadata keys readable in an email. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export async function recordPartnerJobEvent(
  input: PartnerJobEventInput,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const actor = input.actor;
    const studio = actor.kind === "studio";
    if (studio && !isSupabaseAdminConfigured()) return;

    const supabase = studio ? createAdminClient() : await createClient();

    const { error } = await supabase.rpc("log_partner_job_event", {
      p_job_id: input.jobId,
      p_event_type: input.eventType,
      p_metadata: {
        ...(input.metadata ?? {}),
        ...(input.summary ? { summary: input.summary } : {}),
      } as Json,
      // Only consulted when the job row is gone; the RPC prefers the live job.
      p_job_number: input.jobNumber,
      p_job_name: input.jobName,
      // Ignored for a rep — the RPC reads their name from partner_users itself.
      p_actor_label:
        actor.kind === "studio" ? (actor.label ?? "TD Studios") : null,
    });
    if (error) console.error("log_partner_job_event", error.message);
  } catch (error) {
    console.error("recordPartnerJobEvent", error);
  }

  // Off the critical path: the rep's response is already on its way by the time
  // this runs. Wrapped because after() throws if it is ever reached outside a
  // request scope, and a notification must never be the thing that breaks a
  // write that has already committed.
  if (!isNotifiableEvent(input.eventType)) return;
  try {
    const message = buildMessage(input);
    after(() =>
      dispatchPartnerNotification({
        companyId: input.companyId,
        eventType: input.eventType,
        message,
      }),
    );
  } catch (error) {
    console.error("recordPartnerJobEvent dispatch", error);
  }
}
