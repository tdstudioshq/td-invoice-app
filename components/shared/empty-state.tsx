import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-glass-border flex flex-col items-center justify-center rounded-[10px] border border-dashed px-6 py-16 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="border-glass-border bg-glass-highlight/15 text-metal-platinum mb-4 flex size-12 items-center justify-center rounded-[10px] border">
          <Icon className="size-5" />
        </div>
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
