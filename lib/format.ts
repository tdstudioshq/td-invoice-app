import { format, isValid, parseISO } from "date-fns";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Format a number as USD currency, e.g. 1234.5 -> "$1,234.50". */
export function formatCurrency(value: number | null | undefined): string {
  return currencyFormatter.format(Number(value ?? 0));
}

/** Format a percentage value, e.g. 8.875 -> "8.875%". */
export function formatPercent(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  // Trim trailing zeros while keeping meaningful precision.
  return `${parseFloat(n.toFixed(3))}%`;
}

/** Format an ISO date string (or Date) as "MMM d, yyyy". Returns "—" when absent. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  return isValid(date) ? format(date, "MMM d, yyyy") : "—";
}

/** Format an ISO timestamp as "MMM d, yyyy at h:mm a". */
export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  return isValid(date) ? format(date, "MMM d, yyyy 'at' h:mm a") : "—";
}

/** Today's date as an ISO date string (yyyy-MM-dd), for date input defaults. */
export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * "12m ago", "3d ago", "2mo ago" — the "last updated" line on a job card.
 *
 * Strict (no "about"/"almost") and abbreviated, because it sits under a job name
 * in an 11px line where "about 2 months ago" would wrap. Falls back to an empty
 * string rather than throwing on a malformed date, so one bad row cannot take a
 * whole grid down.
 */
export function formatRelativeTime(
  value: string | Date | null | undefined,
): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}
