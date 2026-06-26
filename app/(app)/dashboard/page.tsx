import Link from "next/link";
import {
  AlertTriangle,
  FileText,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { InvoicesTable } from "@/components/invoices/invoices-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboardStats, getInvoices } from "@/lib/data";
import { formatCurrency } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const invoices = await getInvoices();
  const stats = await getDashboardStats(invoices);
  const recent = invoices.slice(0, 8);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="An overview of your invoicing activity."
      >
        <Button asChild>
          <Link href="/invoices/new">
            <Plus />
            New invoice
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total invoiced"
          value={formatCurrency(stats.totalInvoiced)}
          hint="Excludes drafts"
          icon={Receipt}
        />
        <StatCard
          label="Total paid"
          value={formatCurrency(stats.totalPaid)}
          icon={Wallet}
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(stats.outstanding)}
          hint="Awaiting payment"
          icon={FileText}
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(stats.overdueAmount)}
          hint={`${stats.overdueCount} invoice${stats.overdueCount === 1 ? "" : "s"} past due`}
          icon={AlertTriangle}
          accent={stats.overdueCount > 0 ? "warning" : "default"}
        />
      </div>

      <Card className="mt-8">
        <CardHeader className="flex-row items-center justify-between border-b border-glass-border">
          <CardTitle>Recent invoices</CardTitle>
          {invoices.length > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/invoices">View all</Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices yet"
              description="Create your first invoice to start tracking revenue."
              action={
                <Button asChild>
                  <Link href="/invoices/new">
                    <Plus />
                    New invoice
                  </Link>
                </Button>
              }
            />
          ) : (
            <InvoicesTable invoices={recent} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
