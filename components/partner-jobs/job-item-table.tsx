import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  productFinishLabel,
  productTypeLabel,
} from "@/lib/partner-jobs/types";
import type { DesignJobItem } from "@/lib/types/database";

/**
 * The products on a job. Shared verbatim by the partner detail page and the
 * admin one — the same three columns mean the same thing to both, so a rep and
 * the studio are always reading the identical list.
 *
 * Mobile gets a definition list and sm+ a table, the treatment used throughout
 * the app (see components/invoices/invoices-table.tsx).
 */
export function JobItemTable({ items }: { items: DesignJobItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No products were listed on this job.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {items.map((item) => (
          <div
            key={item.id}
            className="border-glass-border rounded-[8px] border p-3"
          >
            <p className="text-sm font-medium">
              {productTypeLabel(item.product_type)}
            </p>
            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Finish</dt>
                <dd className="mt-0.5">{productFinishLabel(item.finish)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Quantity</dt>
                <dd className="mt-0.5 tabular-nums">
                  {item.quantity.toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <Table className="min-w-[420px]">
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Finish</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="py-3 font-medium">
                  {productTypeLabel(item.product_type)}
                </TableCell>
                <TableCell className="text-muted-foreground py-3">
                  {productFinishLabel(item.finish)}
                </TableCell>
                <TableCell className="py-3 text-right tabular-nums">
                  {item.quantity.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
