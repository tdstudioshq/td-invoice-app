import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { partnerJobEventLabel } from "@/lib/partner-jobs/types";
import type { PartnerJobEvent } from "@/lib/types/database";

/**
 * A job's activity, newest first.
 *
 * Shared verbatim by the partner detail page and the admin one, which is why it
 * carries NO icons: the two areas use different icon sets (Phosphor in the
 * portal, lucide in the admin app) and a component that renders in both cannot
 * pick one. A dot and a label say the same thing in either place.
 *
 * A server component holding no state. The rows it renders come from
 * partner_job_events, which reps may only SELECT — so a rep reads the record of
 * what they did and cannot edit it, and the studio reads the same rows through
 * the service role.
 *
 * `summary` is pulled out of the event's metadata rather than being a column:
 * the phrasing of "artwork 3 added, 1 removed" belongs to the action that
 * emitted it, and baking it into the schema would mean a migration every time a
 * sentence changes.
 */
function summaryOf(event: PartnerJobEvent): string | null {
  const meta = event.metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const summary = (meta as Record<string, unknown>).summary;
  return typeof summary === "string" && summary.trim() ? summary : null;
}

export function JobActivity({ events }: { events: PartnerJobEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing has happened on this job yet. Edits, artwork changes and status
        moves will appear here.
      </p>
    );
  }

  return (
    <ol className="space-y-0">
      {events.map((event, index) => (
        <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
          {/* The rail is drawn per row and skipped on the last one, so it never
              trails off past the final event. */}
          {index < events.length - 1 ? (
            <span
              aria-hidden="true"
              className="bg-glass-border absolute top-4 bottom-0 left-[3px] w-px"
            />
          ) : null}
          <span
            aria-hidden="true"
            className="bg-metal-platinum/60 relative mt-1.5 size-[7px] shrink-0 rounded-full"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              {partnerJobEventLabel(event.event_type)}
              {summaryOf(event) ? (
                <span className="text-muted-foreground"> — {summaryOf(event)}</span>
              ) : null}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {event.actor_label ?? "Someone"}
              <span aria-hidden="true"> · </span>
              <time dateTime={event.created_at} title={formatDateTime(event.created_at)}>
                {formatRelativeTime(event.created_at)}
              </time>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
