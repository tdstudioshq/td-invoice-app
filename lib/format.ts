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

/** Today's date as an ISO date string (yyyy-MM-dd), for date input defaults. */
export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}
