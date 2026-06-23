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
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <span className="text-muted-foreground text-xs tracking-wide uppercase">
            {label}
          </span>
          <Icon
            className={cn(
              "size-4",
              accent === "warning"
                ? "text-red-400"
                : "text-muted-foreground",
            )}
          />
        </div>
        <p
          className={cn(
            "mt-3 text-2xl font-semibold tracking-tight tabular-nums",
            accent === "warning" ? "text-red-400" : undefined,
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
