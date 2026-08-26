import Link from "next/link";
import { Package } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { MylarStatusBadge } from "@/components/mylar-requests/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getMylarInquiries } from "@/lib/mylar-printing/queries";
import { bagTypeLabel } from "@/lib/mylar-printing/types";

export const metadata = { title: "Mylar Requests" };

/**
 * Every quote request filed through the public /mylar-printing wizard.
 *
 * Read through the service-role client (see lib/mylar-printing/queries.ts):
 * inquiries have no owner_id, so the cookie-scoped client sees nothing. The
 * (app) layout already enforces requireAdmin; re-asserted here for the same
 * defense-in-depth reason /qr/history does it.
 *
 * Mobile gets the card list and sm+ the scrollable table — same treatment as
 * components/invoices/invoices-table.tsx.
 */
export default async function MylarRequestsPage() {
  await requireAdmin();
  const inquiries = await getMylarInquiries();

  return (
    <>
      <PageHeader
        title="Mylar Requests"
        description="Custom mylar printing quote requests from the public wizard, newest first."
      />

      {inquiries.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No printing requests yet"
          description="Requests submitted at /mylar-printing will land here."
        />
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {inquiries.map((inquiry) => (
              <Link
                key={inquiry.id}
                href={`/mylar-requests/${inquiry.id}`}
                className="glass active:bg-glass-highlight/20 block rounded-[8px] p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{inquiry.reference_number}</p>
                    <p className="text-muted-foreground mt-0.5 truncate text-sm">
                      {inquiry.customer_name}
                    </p>
                  </div>
                  <MylarStatusBadge status={inquiry.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div className="col-span-2">
                    <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">Bag type</dt>
                    <dd className="mt-0.5">{bagTypeLabel(inquiry.bag_type)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">Quantity</dt>
                    <dd className="mt-0.5 tabular-nums">
                      {inquiry.quantity.toLocaleString()} pcs
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">Designs</dt>
                    <dd className="mt-0.5 tabular-nums">
                      {inquiry.designCount}
                      {inquiry.statedDesignCount !== null ? (
                        <span className="text-muted-foreground ml-1.5 text-sm md:text-xs">
                          (stated {inquiry.statedDesignCount})
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div className="border-glass-border col-span-2 border-t pt-3">
                    <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">Received</dt>
                    <dd className="mt-0.5">{formatDate(inquiry.created_at)}</dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>

          <div className="glass hidden overflow-x-auto rounded-[8px] sm:block">
            <Table className="min-w-[760px]">
              <TableHeader className="bg-glass-highlight/10">
                <TableRow>
                  <TableHead className="px-4">Reference</TableHead>
                  <TableHead className="px-4">Customer</TableHead>
                  <TableHead className="px-4">Received</TableHead>
                  <TableHead className="px-4">Bag type</TableHead>
                  <TableHead className="px-4 text-right">Qty</TableHead>
                  <TableHead className="px-4 text-right">Designs</TableHead>
                  <TableHead className="px-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inquiries.map((inquiry) => (
                  <TableRow
                    key={inquiry.id}
                    className="hover:bg-glass-highlight/10 transition-colors"
                  >
                    <TableCell className="px-4 py-3.5 font-medium">
                      <Link
                        href={`/mylar-requests/${inquiry.id}`}
                        className="hover:text-metal-platinum transition-colors"
                      >
                        {inquiry.reference_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-52 truncate px-4 py-3.5">
                      {inquiry.customer_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground px-4 py-3.5 whitespace-nowrap">
                      {formatDate(inquiry.created_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground px-4 py-3.5">
                      {bagTypeLabel(inquiry.bag_type)}
                    </TableCell>
                    <TableCell className="px-4 py-3.5 text-right tabular-nums">
                      {inquiry.quantity.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-3.5 text-right tabular-nums">
                      {inquiry.designCount}
                      {inquiry.statedDesignCount !== null ? (
                        <span
                          className="text-muted-foreground ml-1.5 text-sm md:text-xs"
                          title={`Customer stated ${inquiry.statedDesignCount}`}
                        >
                          ({inquiry.statedDesignCount})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <MylarStatusBadge status={inquiry.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
