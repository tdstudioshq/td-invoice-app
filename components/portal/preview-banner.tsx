import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Shown on every admin "view as client" preview page. The preview never
 * impersonates the client — it renders the same components from admin-scoped
 * queries with the portal's visibility filters applied in code.
 */
export function PreviewBanner({
  clientName,
  backHref,
}: {
  clientName: string;
  backHref: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border border-sky-500/40 bg-sky-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Eye className="size-5 shrink-0 text-sky-400" />
        <p className="text-sm">
          Previewing as <span className="font-medium">{clientName}</span> —
          this is what the client sees in their portal.
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="sm:shrink-0">
        <Link href={backHref}>
          <ArrowLeft />
          Back to admin
        </Link>
      </Button>
    </div>
  );
}
