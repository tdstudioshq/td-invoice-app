import "server-only";

import { getAdminEmails } from "@/lib/auth";
import { getNotificationChannel } from "@/lib/notifications/channels";
import type {
  NotificationChannelId,
  NotificationMessage,
} from "@/lib/notifications/types";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import type { PartnerNotificationSettings } from "@/lib/types/database";

/**
 * Resolve who should hear about a partner-portal event, and tell them.
 *
 * The ONLY consumer of partner_notification_settings, and the only place that
 * decides a notification is not worth sending. Event producers call this and
 * move on; they never inspect settings, never know a channel exists, and never
 * see a failure — which is what keeps notification logic out of the actions and
 * out of components entirely.
 *
 * SERVICE ROLE, ALWAYS, AND NOT AS A SHORTCUT. partner_notification_settings
 * runs RLS with no policies and an explicit revoke (migration 20260829000000),
 * so a rep's cookie-scoped client cannot read it — deliberately, because a
 * company must not be able to see or change who is told about its own activity.
 * That also means this module must never be imported by a client component; the
 * `server-only` import above is what enforces it.
 *
 * NOTHING HERE THROWS. A notification is an announcement about something that
 * has already been committed, so a bad address, a Resend outage or a missing
 * settings row must never surface to the person whose action triggered it.
 */

/** What the system does for a company with no settings row — and most have none. */
const DEFAULTS = {
  email_enabled: true,
  // No SMS channel is registered yet, so this is inert either way. It is the
  // switch the eventual Twilio channel reads, kept here so the default is
  // stated in one place rather than assumed.
  sms_enabled: false,
  muted_events: [] as string[],
} as const;

async function loadSettings(
  companyId: string,
): Promise<PartnerNotificationSettings | null> {
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("partner_notification_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) {
      console.error("notification settings", error.message);
      return null;
    }
    return data;
  } catch (error) {
    console.error("notification settings", error);
    return null;
  }
}

/**
 * `null` recipients means "fall back to ADMIN_EMAILS"; an EMPTY ARRAY means
 * "nobody", which is a different and deliberate answer. Distinguishing the two
 * is the only reason the column is nullable.
 */
function resolveRecipients(
  configured: string[] | null | undefined,
  fallback: string[],
): string[] {
  if (configured === null || configured === undefined) return fallback;
  return configured.filter(Boolean);
}

export interface DispatchInput {
  companyId: string;
  /** Used only to decide muting — the message is already rendered. */
  eventType: string;
  message: NotificationMessage;
}

export async function dispatchPartnerNotification({
  companyId,
  eventType,
  message,
}: DispatchInput): Promise<void> {
  try {
    const settings = await loadSettings(companyId);

    const muted = settings?.muted_events ?? DEFAULTS.muted_events;
    if (muted.includes(eventType)) return;

    // Which channels this company wants. A channel that is enabled but not
    // registered (sms, today) resolves to null below and is skipped.
    const wanted: NotificationChannelId[] = [];
    if (settings?.email_enabled ?? DEFAULTS.email_enabled) wanted.push("email");
    if (settings?.sms_enabled ?? DEFAULTS.sms_enabled) wanted.push("sms");
    if (wanted.length === 0) return;

    const adminEmails = getAdminEmails();

    await Promise.all(
      wanted.map(async (id) => {
        const channel = getNotificationChannel(id);
        if (!channel || !channel.isConfigured()) return;

        const recipients =
          id === "email"
            ? resolveRecipients(settings?.email_recipients, adminEmails)
            : resolveRecipients(settings?.sms_recipients, []);
        if (recipients.length === 0) return;

        const result = await channel.send(message, recipients);
        if (!result.ok && !result.skipped) {
          console.error(`notification ${id}`, result.error);
        }
      }),
    );
  } catch (error) {
    // Deliberately swallowed: see the module header.
    console.error("dispatchPartnerNotification", error);
  }
}
