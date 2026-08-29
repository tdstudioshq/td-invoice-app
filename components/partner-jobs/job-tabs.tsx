import Link from "next/link";

import { partnerHref } from "@/lib/partner-jobs/routing";
import {
  PARTNER_JOB_TABS,
  type PartnerJobTab,
} from "@/lib/partner-jobs/types";
import { cn } from "@/lib/utils";

/**
 * The jobs list's filter chips.
 *
 * Plain links carrying `?tab=`, not client state: filtering happens in the
 * server component, so a tab is bookmarkable, survives a refresh, and the page
 * ships no JavaScript for it. The only interactive thing on this list is the
 * done checkbox itself.
 *
 * Counts come from the same partition the filter uses
 * (countPartnerJobsByTab), so the three status counts always sum to All.
 */
export function JobTabs({
  basePath,
  active,
  counts,
}: {
  basePath: string;
  active: PartnerJobTab;
  counts: Record<PartnerJobTab, number>;
}) {
  return (
    <nav
      aria-label="Filter jobs"
      // Scrolls rather than wraps on a narrow phone, so the four chips stay on
      // one line and the list below never shifts down a row.
      className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      {PARTNER_JOB_TABS.map((tab) => {
        const current = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={partnerHref(
              basePath,
              tab.id === "all" ? "/jobs" : `/jobs?tab=${tab.id}`,
            )}
            aria-current={current ? "page" : undefined}
            className={cn(
              "border-glass-border inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors",
              current
                ? "bg-glass-highlight/25 text-foreground"
                : "text-muted-foreground hover:bg-glass-highlight/10 hover:text-foreground",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "tabular-nums",
                current ? "text-metal-platinum" : "text-muted-foreground/70",
              )}
            >
              {counts[tab.id]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
