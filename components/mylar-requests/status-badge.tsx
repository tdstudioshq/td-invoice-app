import { Badge } from "@/components/ui/badge";
import {
  MYLAR_INQUIRY_STATUS_LABEL,
  type MylarInquiryStatus,
} from "@/lib/mylar-printing/types";
import { cn } from "@/lib/utils";

/** Mirrors components/invoices/status-badge.tsx for the inquiry lifecycle. */
const STATUS_STYLES: Record<MylarInquiryStatus, { badge: string; dot: string }> = {
  new: {
    badge: "border-sky-300/25 bg-sky-400/10 text-sky-300",
    dot: "bg-sky-300",
  },
  reviewing: {
    badge: "border-violet-300/25 bg-violet-400/10 text-violet-300",
    dot: "bg-violet-300",
  },
  quoted: {
    badge: "border-amber-300/25 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-300",
  },
  approved: {
    badge: "border-teal-300/25 bg-teal-400/10 text-teal-300",
    dot: "bg-teal-300",
  },
  printing: {
    badge: "border-indigo-300/25 bg-indigo-400/10 text-indigo-300",
    dot: "bg-indigo-300",
  },
  completed: {
    badge: "border-emerald-300/25 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-300",
  },
  cancelled: {
    badge: "border-zinc-400/20 bg-zinc-400/10 text-zinc-400",
    dot: "bg-zinc-400",
  },
};

export function MylarStatusBadge({
  status,
  className,
}: {
  status: MylarInquiryStatus;
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
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", styles.dot)} />
      {MYLAR_INQUIRY_STATUS_LABEL[status]}
    </Badge>
  );
}
