"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { FileText, FolderLock, LayoutDashboard, Menu } from "lucide-react";

import { SignOutButton } from "@/components/layout/sign-out-button";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const PORTAL_NAV = [
  { href: "/portal", label: "Overview", icon: LayoutDashboard },
  { href: "/portal/files", label: "Files", icon: FolderLock },
  { href: "/portal/invoices", label: "Invoices", icon: FileText },
];

function PortalBrand({ companyName }: { companyName?: string | null }) {
  return (
    <Link href="/portal" className="flex items-center gap-2.5 select-none">
      <Image
        src="/logo.png"
        alt="TD Studios"
        width={36}
        height={36}
        className="size-9 shrink-0"
      />
      <span className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-tight">TD Studios</span>
        <span className="text-muted-foreground text-[10px] tracking-[0.18em] uppercase">
          {companyName ? "Client Portal" : "Portal"}
        </span>
      </span>
    </Link>
  );
}

function PortalNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {PORTAL_NAV.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/portal" && pathname.startsWith(`${item.href}/`));
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

export function PortalShell({
  children,
  companyName,
  userEmail,
}: {
  children: React.ReactNode;
  companyName?: string | null;
  userEmail?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-svh w-full">
      <aside className="bg-sidebar border-border hidden w-60 shrink-0 flex-col border-r pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:flex">
        <div className="border-border flex h-16 items-center border-b px-5">
          <PortalBrand companyName={companyName} />
        </div>
        {companyName ? (
          <div className="border-border border-b px-5 py-3">
            <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
              Signed in as
            </p>
            <p className="truncate text-sm font-medium">{companyName}</p>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto p-3">
          <PortalNav />
        </div>
        <div className="border-border border-t px-5 py-4">
          {userEmail ? (
            <p className="text-muted-foreground mb-2 truncate text-[11px]">
              {userEmail}
            </p>
          ) : null}
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/80 border-border sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="border-border border-b">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <PortalBrand companyName={companyName} />
              </SheetHeader>
              <div className="p-3">
                <PortalNav onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <PortalBrand companyName={companyName} />
        </header>

        <main className="min-w-0 flex-1 py-5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(env(safe-area-inset-bottom)_+_1.5rem)] md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
