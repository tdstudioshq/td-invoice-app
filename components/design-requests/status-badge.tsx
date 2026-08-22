import { Badge } from "@/components/ui/badge";
import {
  CUSTOM_DESIGN_REQUEST_STATUS_LABEL,
  type CustomDesignRequestStatus,
} from "@/lib/design-requests/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<CustomDesignRequestStatus, string> = {
  new: "border-sky-300/25 bg-sky-400/10 text-sky-300",
  reviewing: "border-violet-300/25 bg-violet-400/10 text-violet-300",
  quoted: "border-amber-300/25 bg-amber-400/10 text-amber-300",
  in_progress: "border-indigo-300/25 bg-indigo-400/10 text-indigo-300",
  completed: "border-emerald-300/25 bg-emerald-400/10 text-emerald-300",
  cancelled: "border-zinc-400/20 bg-zinc-400/10 text-zinc-400",
};

export function CustomDesignStatusBadge({
  status,
  className,
}: {
  status: CustomDesignRequestStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("h-6 rounded-full px-2.5", STATUS_STYLES[status], className)}>
      {CUSTOM_DESIGN_REQUEST_STATUS_LABEL[status]}
    </Badge>
  );
}
