"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { MainNav } from "@/components/layout/main-nav";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AppShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ambient-bg subtle-grid flex min-h-svh w-full bg-background print:bg-white">
      {/* Desktop sidebar */}
      <aside className="glass hidden w-60 shrink-0 flex-col border-y-0 border-l-0 border-r border-glass-border bg-sidebar/70 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:flex print:!hidden">
        <div className="border-glass-border flex h-16 items-center border-b px-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <MainNav />
        </div>
        <div className="border-glass-border border-t px-5 py-4">
          {userEmail ? (
            <p className="text-muted-foreground mb-2 truncate text-[11px]">
              {userEmail}
            </p>
          ) : null}
          <SignOutButton />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="glass sticky top-0 z-30 flex min-h-16 items-center gap-3 border-x-0 border-t-0 border-b border-glass-border px-4 pt-[env(safe-area-inset-top)] md:hidden print:hidden">
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
            <SheetContent side="left" className="glass w-64 border-glass-border p-0">
              <SheetHeader className="border-glass-border border-b">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <Brand />
              </SheetHeader>
              <div className="p-3">
                <MainNav onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <Brand />
        </header>

        <main className="min-w-0 flex-1 py-5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(env(safe-area-inset-bottom)_+_1.5rem)] md:px-8 md:py-8 print:p-0">
          <div className="mx-auto w-full max-w-6xl print:max-w-none">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
