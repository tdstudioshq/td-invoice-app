import { JobFileList } from "@/components/partner-jobs/job-file-list";
import {
  productFinishLabel,
  productTypeLabel,
} from "@/lib/partner-jobs/types";
import type { DesignJobFile, DesignJobItem } from "@/lib/types/database";

/**
 * The products on a job, each with its own notes and its own artwork.
 *
 * Replaces the old flat three-column table, which listed the products in one
 * place and every file in another and left the studio to work out which file
 * was for which product. That pairing is the reason this portal exists, so it
 * is the layout: one card per product, its spec, its instructions, its files.
 *
 * Shared verbatim by the partner detail page and the admin one — the same card
 * means the same thing to both, so a rep and the studio are always reading the
 * identical list. Files come in as the job's whole set and are grouped here, so
 * both pages fetch the same way.
 *
 * Mobile stacks the spec as a definition list and sm+ lays it on one row, the
 * treatment used throughout the app.
 */
export function JobProductList({
  items,
  files,
  jobNumber,
}: {
  items: DesignJobItem[];
  files: DesignJobFile[];
  jobNumber: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No products were listed on this job.
      </p>
    );
  }

  const byItem = new Map<string, DesignJobFile[]>();
  for (const file of files) {
    if (!file.item_id) continue;
    const list = byItem.get(file.item_id);
    if (list) list.push(file);
    else byItem.set(file.item_id, [file]);
  }

  return (
    <ul className="space-y-4">
      {items.map((item, index) => {
        const itemFiles = byItem.get(item.id) ?? [];
        return (
          <li
            key={item.id}
            className="border-glass-border space-y-4 rounded-[8px] border p-3 sm:p-4"
          >
            <div>
              <p className="text-muted-foreground text-[13px] tracking-wide uppercase md:text-xs">
                {/* item_number is stored, so this label survives an edit that
                    adds or removes another product. */}
                Item {item.item_number || index + 1}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">
                    Product
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium break-words">
                    {productTypeLabel(item.product_type)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">
                    Finish
                  </dt>
                  <dd className="mt-0.5 text-sm">
                    {productFinishLabel(item.finish)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">
                    Quantity
                  </dt>
                  <dd className="mt-0.5 text-sm tabular-nums">
                    {item.quantity.toLocaleString()}
                  </dd>
                </div>
              </dl>
            </div>

            {item.notes ? (
              <div>
                <p className="text-muted-foreground text-sm leading-relaxed md:text-xs">
                  Notes
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{item.notes}</p>
              </div>
            ) : null}

            <div>
              <p className="text-muted-foreground text-sm leading-relaxed md:text-xs">
                Artwork
                <span className="ml-1.5 tabular-nums">{itemFiles.length}</span>
              </p>
              <div className="mt-2">
                {itemFiles.length > 0 ? (
                  <JobFileList
                    files={itemFiles}
                    // Only the zip's filename, so each product's bundle is
                    // distinguishable once several are downloaded.
                    jobNumber={`${jobNumber}-item-${item.item_number || index + 1}`}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No artwork was attached to this product.
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
