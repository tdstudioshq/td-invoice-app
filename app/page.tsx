import Link from "next/link";
import { ArrowRight, FileText, Users, Wallet } from "lucide-react";

import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Users,
    title: "Client management",
    body: "Keep every client's contact details, address, and notes in one place.",
  },
  {
    icon: FileText,
    title: "Professional invoices",
    body: "Auto-numbered invoices with line items, tax, and discounts.",
  },
  {
    icon: Wallet,
    title: "Payment tracking",
    body: "See what's paid, outstanding, and overdue at a glance.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-border flex h-16 items-center justify-between border-b px-5 md:px-8">
        <Brand />
        <Button asChild size="sm">
          <Link href="/dashboard">
            Open app
            <ArrowRight />
          </Link>
        </Button>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-16 md:px-8">
          <p className="text-muted-foreground mb-4 text-xs tracking-[0.2em] uppercase">
            TD Studios · Invoicing
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Invoicing built for the studio.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl text-sm md:text-base">
            Create polished invoices, manage clients, and stay on top of
            payments — a focused, dark, no-nonsense workspace for TD Studios.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/dashboard">
                Go to dashboard
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/invoices/new">Create an invoice</Link>
            </Button>
          </div>

          <div className="mt-16 grid gap-px md:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-card border-border border p-6"
                >
                  <Icon className="text-muted-foreground size-5" />
                  <h2 className="mt-4 text-sm font-medium">{feature.title}</h2>
                  <p className="text-muted-foreground mt-1.5 text-sm">
                    {feature.body}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="border-border text-muted-foreground border-t px-5 py-6 text-xs md:px-8">
          © {new Date().getFullYear()} TD Studios. All rights reserved.
        </footer>
      </main>
    </div>
  );
}
