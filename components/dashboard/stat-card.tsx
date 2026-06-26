import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: "default" | "warning";
}) {
  return (
    <Card className="relative min-h-32">
      <CardContent className="relative pt-6">
        <div className="flex items-start justify-between">
          <span className="text-muted-foreground text-xs tracking-wide uppercase">
            {label}
          </span>
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-[6px] border",
              accent === "warning"
                ? "border-red-300/20 bg-red-400/10 text-red-300"
                : "border-glass-border bg-glass-highlight/15 text-metal-platinum",
            )}
          >
            <Icon className="size-4" />
          </span>
        </div>
        <p
          className={cn(
            "mt-4 text-2xl font-semibold tracking-tight tabular-nums",
            accent === "warning" ? "text-red-300" : "text-metal-platinum",
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
