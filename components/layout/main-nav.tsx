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
              "flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "data-[active=true]:bg-muted data-[active=true]:text-foreground data-[active=true]:font-medium",
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
