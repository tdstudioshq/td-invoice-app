import { Badge } from "@/components/ui/badge";
import {
  DESIGN_JOB_STATUS_LABEL,
  type DesignJobStatus,
} from "@/lib/partner-jobs/types";
import { cn } from "@/lib/utils";

/**
 * Status pill for a partner design job. Mirrors components/mylar-requests/
 * status-badge.tsx — dot plus label, colour carrying the meaning and the text
 * repeating it, so the three states stay distinguishable without relying on
 * colour alone.
 */
const STATUS_STYLES: Record<DesignJobStatus, { badge: string; dot: string }> = {
  new: {
    badge: "border-sky-300/25 bg-sky-400/10 text-sky-300",
    dot: "bg-sky-300",
  },
  in_progress: {
    badge: "border-amber-300/25 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-300",
  },
  completed: {
    badge: "border-emerald-300/25 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-300",
  },
};

export function JobStatusBadge({
  status,
  className,
}: {
  status: DesignJobStatus;
  className?: string;
}) {
  const styles = STATUS_STYLES[status] ?? STATUS_STYLES.new;

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 rounded-full px-2.5 shadow-[inset_0_1px_0_var(--glass-highlight)]",
        styles.badge,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", styles.dot)} />
      {DESIGN_JOB_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
