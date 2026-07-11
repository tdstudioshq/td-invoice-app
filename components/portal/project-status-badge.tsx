import { Badge } from "@/components/ui/badge";
import { PROJECT_STATUS_LABEL } from "@/lib/projects";
import type { ProjectStatus } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<ProjectStatus, { badge: string; dot: string }> = {
  draft: {
    badge: "border-zinc-400/20 bg-zinc-400/10 text-zinc-300",
    dot: "bg-zinc-300",
  },
  in_progress: {
    badge: "border-sky-300/25 bg-sky-400/10 text-sky-300",
    dot: "bg-sky-300",
  },
  awaiting_review: {
    badge: "border-amber-300/25 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-300",
  },
  revision_requested: {
    badge: "border-orange-300/25 bg-orange-400/10 text-orange-300",
    dot: "bg-orange-300",
  },
  approved: {
    badge: "border-emerald-300/25 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-300",
  },
  completed: {
    badge: "border-teal-300/25 bg-teal-400/10 text-teal-300",
    dot: "bg-teal-300",
  },
  archived: {
    badge: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
    dot: "bg-zinc-400",
  },
};

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
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
      {PROJECT_STATUS_LABEL[status]}
    </Badge>
  );
}
