import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/lib/invoice";
import type { InvoiceStatus } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-sky-500/15 text-sky-400",
  paid: "bg-emerald-500/15 text-emerald-400",
  overdue: "bg-red-500/15 text-red-400",
};

export function StatusBadge({
  status,
  className,
}: {
  status: InvoiceStatus;
  className?: string;
}) {
  return (
    <Badge className={cn("border-transparent", STATUS_STYLES[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
