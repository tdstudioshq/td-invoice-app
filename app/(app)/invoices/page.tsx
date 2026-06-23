import Link from "next/link";
import { Plus, Receipt } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { InvoicesTable } from "@/components/invoices/invoices-table";
import { Button } from "@/components/ui/button";
import { getInvoices } from "@/lib/data";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const invoices = await getInvoices();

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
