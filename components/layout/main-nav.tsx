"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/components/layout/nav-config";
import { cn } from "@/lib/utils";

export function MainNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            data-active={active}
            className={cn(
              "flex items-center gap-2.5 rounded-[6px] px-3 py-2 text-sm transition-colors",
              "text-muted-foreground hover:bg-glass-highlight/20 hover:text-foreground",
              "data-[active=true]:bg-glass-highlight/25 data-[active=true]:text-metal-platinum data-[active=true]:font-medium",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
