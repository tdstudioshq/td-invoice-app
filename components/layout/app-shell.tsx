"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { MainNav } from "@/components/layout/main-nav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-svh w-full">
      {/* Desktop sidebar */}
      <aside className="bg-sidebar border-border hidden w-60 shrink-0 flex-col border-r md:flex">
        <div className="border-border flex h-16 items-center border-b px-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <MainNav />
        </div>
        <div className="border-border text-muted-foreground border-t px-5 py-4 text-[11px]">
          © {new Date().getFullYear()} TD Studios
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="bg-background/80 border-border sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="border-border border-b">
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

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
