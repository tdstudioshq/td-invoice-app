/**
 * Channel-agnostic notification contract.
 *
 * Pure types and pure functions — no `server-only`, no Resend, no Supabase — so
 * this file is what a new channel is written against and what the dispatcher
 * depends on. The whole point of the indirection is that adding SMS later means
 * adding ONE file under channels/ and one entry in the registry; nothing that
 * produces an event has to change, because nothing that produces an event knows
 * a channel exists.
 */

export const NOTIFICATION_CHANNELS = ["email", "sms"] as const;
export type NotificationChannelId = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * What happened, described so that ANY channel can render it.
 *
 * Deliberately not HTML and not a string: an email wants a table and a button,
 * an SMS wants two lines and a link, and a future push notification wants a
 * title and a body. Each channel renders this its own way, so the thing that
 * emitted the event never has to think about the medium.
 */
export interface NotificationMessage {
  /** Email subject / SMS opening line. Keep it under ~70 characters. */
  subject: string;
  /** The one-line headline inside the message body. */
  heading: string;
  /** Label/value pairs, rendered as rows or as `Label: value` lines. */
  lines: [string, string][];
  /** Free text (a rep's note), rendered verbatim. */
  body?: string | null;
  actionUrl: string;
  actionLabel: string;
}

export interface NotificationSendResult {
  ok: boolean;
  error?: string;
  /** Channels with no recipients or no credentials report this instead of ok. */
  skipped?: boolean;
}

/**
 * One delivery mechanism.
 *
 * `isConfigured()` is separate from `send()` on purpose: the dispatcher asks
 * first and skips silently, so an unconfigured channel is a no-op rather than a
 * logged failure on every single event. That is what lets `sms_enabled` exist in
 * the database before Twilio exists in the repo.
 */
export interface NotificationChannel {
  readonly id: NotificationChannelId;
  isConfigured(): boolean;
  send(
    message: NotificationMessage,
    recipients: string[],
  ): Promise<NotificationSendResult>;
}

/**
 * The plain-text rendering, shared by every channel that isn't HTML.
 *
 * Lives here rather than in the email channel so an SMS/push channel added
 * later renders identically without copying anything.
 */
export function renderNotificationText(message: NotificationMessage): string {
  const rows = message.lines.map(([label, value]) => `${label}: ${value}`);
  return [
    message.heading,
    "",
    ...rows,
    ...(message.body ? ["", message.body] : []),
    "",
    `${message.actionLabel}: ${message.actionUrl}`,
  ].join("\n");
}

/**
 * A short rendering for length-limited channels (SMS is 160 characters a
 * segment). Not used today — it exists so the eventual SMS channel has an
 * obvious, already-written answer to "what do I send?".
 */
export function renderNotificationSms(message: NotificationMessage): string {
  return `${message.subject}\n${message.actionUrl}`;
}
