import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/lib/invoice";
import type { InvoiceStatus } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<
  InvoiceStatus,
  { badge: string; dot: string }
> = {
  draft: {
    badge: "border-zinc-400/20 bg-zinc-400/10 text-zinc-300",
    dot: "bg-zinc-300",
  },
  sent: {
    badge: "border-sky-300/25 bg-sky-400/10 text-sky-300",
    dot: "bg-sky-300",
  },
  paid: {
    badge: "border-emerald-300/25 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-300",
  },
  overdue: {
    badge: "border-red-300/30 bg-red-400/10 text-red-300",
    dot: "bg-red-300",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: InvoiceStatus;
  className?: string;
}) {
  const styles = STATUS_STYLES[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 rounded-full px-2.5 shadow-[inset_0_1px_0_var(--glass-highlight)]",
        styles.badge,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", styles.dot)}
      />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
