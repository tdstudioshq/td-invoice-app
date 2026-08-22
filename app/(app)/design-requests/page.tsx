import Link from "next/link";
import { Palette } from "lucide-react";

import { CustomDesignStatusBadge } from "@/components/design-requests/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { getCustomDesignRequests } from "@/lib/design-requests/queries";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Design Requests" };

export default async function DesignRequestsPage() {
  await requireAdmin();
  const requests = await getCustomDesignRequests();
  return (
    <>
      <PageHeader
        title="Design Requests"
        description="Custom design requests from the public form, newest first."
      />
      {requests.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No design requests yet"
          description="Requests submitted at /custom-design-request will land here."
        />
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {requests.map((request) => (
              <Link
                key={request.id}
                href={`/design-requests/${request.id}`}
                className="glass block rounded-[8px] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{request.reference_number}</p>
                    <p className="text-muted-foreground truncate text-sm">{request.customer_name}</p>
                  </div>
                  <CustomDesignStatusBadge status={request.status} />
                </div>
                <div className="text-muted-foreground mt-3 flex justify-between gap-3 text-xs">
                  <span>{request.design_type}</span>
                  <span>{formatDate(request.created_at)}</span>
                </div>
              </Link>
            ))}
          </div>
          <div className="glass hidden overflow-x-auto rounded-[8px] sm:block">
            <Table>
              <TableHeader className="bg-glass-highlight/10">
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Design type</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">
                      <Link href={`/design-requests/${request.id}`} className="hover:text-metal-platinum">
                        {request.reference_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{request.customer_name}</TableCell>
                    <TableCell className="text-muted-foreground">{request.design_type}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(request.created_at)}</TableCell>
                    <TableCell><CustomDesignStatusBadge status={request.status} /></TableCell>
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
