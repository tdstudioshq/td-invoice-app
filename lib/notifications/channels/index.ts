import "server-only";

import { emailChannel } from "@/lib/notifications/channels/email";
import type {
  NotificationChannel,
  NotificationChannelId,
} from "@/lib/notifications/types";

/**
 * The channel registry — the ONE place a delivery mechanism is wired in.
 *
 * ADDING SMS IS THIS FILE PLUS ONE SIBLING. Write `channels/sms.ts` exporting a
 * `NotificationChannel` (Twilio, or whatever), add `sms: smsChannel` below, and
 * every existing event starts flowing to it for any company whose
 * `partner_notification_settings.sms_enabled` is true. No event producer, no
 * server action, no database migration and no message shape changes — which is
 * the entire reason this indirection exists.
 *
 * `sms` is absent rather than stubbed on purpose: a stub that silently succeeds
 * is indistinguishable from a channel that works, and the dispatcher already
 * handles a missing channel by skipping it.
 */
const CHANNELS: Partial<Record<NotificationChannelId, NotificationChannel>> = {
  email: emailChannel,
};

export function getNotificationChannel(
  id: NotificationChannelId,
): NotificationChannel | null {
  return CHANNELS[id] ?? null;
}
