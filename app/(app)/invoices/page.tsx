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
import { EmptyState } from "@/components/shared/empty-state";
import { InvoicesTable } from "@/components/invoices/invoices-table";
import { Button } from "@/components/ui/button";
import { getDashboardStats, getInvoices } from "@/lib/data";
import { formatCurrency } from "@/lib/format";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const invoices = await getInvoices();
  const stats = await getDashboardStats(invoices);

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Create, send, and track every invoice."
      >
        <Button asChild>
          <Link href="/invoices/new">
            <Plus />
            New invoice
          </Link>
        </Button>
      </PageHeader>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Your invoices will show up here once you create one."
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
        <InvoicesTable invoices={invoices} />
      )}
    </>
  );
}
