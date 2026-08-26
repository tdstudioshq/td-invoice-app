/* eslint-disable @next/next/no-img-element */
import { DownloadSimpleIcon, EyeIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { formatPartnerBytes, partnerExtensionOf } from "@/lib/partner-jobs/uploads";
import { previewKind } from "@/lib/portal";
import type { DesignJobFile } from "@/lib/types/database";

/**
 * The files attached to a job, as preview tiles.
 *
 * Every URL goes through /api/partner-job-files/[fileId], which authorizes the
 * request and 302s to a 60-second signed URL — the bucket is private and has no
 * public URL to render, so a storage path never reaches the browser. That holds
 * for the thumbnails too: the `<img>` follows the same authorized redirect.
 *
 * Raster images get a real thumbnail; PDF/AI/PSD/EPS/SVG get a labelled tile,
 * because there is no document conversion anywhere in this app and an inline
 * SVG can carry script. `previewKind()` draws that line, and "View" is offered
 * on exactly the types it approves — for a PDF (and an .ai, which carries a PDF
 * payload) that opens the real thing in a new tab, which is the preview.
 *
 * A plain `<img>` rather than `next/image`: these are short-lived signed URLs
 * behind an auth redirect, and the production image optimizer is not in this
 * app's delivery path (see the /premadedesigns note in CLAUDE.md).
 *
 * Shared by the partner and admin detail pages — the route decides which client
 * to authorize with, so the same markup is correct for both.
 */
export function JobFileList({ files }: { files: DesignJobFile[] }) {
  if (files.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No files were attached to this job.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {files.map((file) => {
        const kind = previewKind(file.mime_type);
        const isImage = kind === "image";
        const ext = partnerExtensionOf(file.original_filename).toUpperCase();
        const href = `/api/partner-job-files/${file.id}`;

        return (
          <li
            key={file.id}
            className="border-glass-border overflow-hidden rounded-[8px] border"
          >
            <div className="bg-glass-highlight/10 flex aspect-[4/3] items-center justify-center overflow-hidden">
              {isImage ? (
                <img
                  src={`${href}?inline=1`}
                  alt={file.original_filename}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-contain"
                />
              ) : (
                <span className="text-metal-platinum text-sm tracking-[0.14em]">
                  {ext || "FILE"}
                </span>
              )}
            </div>

            <div className="space-y-1.5 p-2.5">
              <p
                className="truncate text-sm md:text-xs"
                title={file.original_filename}
              >
                {file.original_filename}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs tabular-nums md:text-[11px]">
                  {formatPartnerBytes(file.file_size)}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  {kind !== null ? (
                    <Button asChild variant="ghost" size="icon" className="size-8">
                      <a
                        href={`${href}?inline=1`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`View ${file.original_filename}`}
                      >
                        <EyeIcon className="size-4" />
                      </a>
                    </Button>
                  ) : null}
                  <Button asChild variant="ghost" size="icon" className="size-8">
                    <a href={href} aria-label={`Download ${file.original_filename}`}>
                      <DownloadSimpleIcon className="size-4" />
                    </a>
                  </Button>
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
