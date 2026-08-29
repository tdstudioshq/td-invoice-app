import "server-only";

import { EMAIL_FROM, getResend, isResendConfigured } from "@/lib/email/client";
import { notificationEmail } from "@/lib/email/templates";
import {
  renderNotificationText,
  type NotificationChannel,
  type NotificationMessage,
  type NotificationSendResult,
} from "@/lib/notifications/types";

/**
 * Email delivery, via the Resend client the rest of the app already uses.
 *
 * Nothing here is specific to partner jobs — it takes a NotificationMessage and
 * renders it — so any future event source gets email for free.
 *
 * `isConfigured()` mirrors every other Resend call site in this repo: no key, no
 * send, no crash. A portal event is still recorded when email is off; the
 * database is the record and the email is only the announcement.
 */
export const emailChannel: NotificationChannel = {
  id: "email",

  isConfigured() {
    return isResendConfigured();
  },

  async send(
    message: NotificationMessage,
    recipients: string[],
  ): Promise<NotificationSendResult> {
    if (recipients.length === 0) return { ok: false, skipped: true };
    if (!isResendConfigured()) return { ok: false, skipped: true };

    const email = notificationEmail({
      subject: message.subject,
      heading: message.heading,
      lines: message.lines,
      body: message.body,
      actionUrl: message.actionUrl,
      actionLabel: message.actionLabel,
      text: renderNotificationText(message),
    });

    try {
      const { error } = await getResend().emails.send({
        from: EMAIL_FROM,
        to: recipients,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (error) {
        console.error("notification email", error.message);
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (err) {
      console.error("notification email", err);
      return { ok: false, error: String(err) };
    }
  },
};
