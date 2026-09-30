/* eslint-disable @next/next/no-img-element */
import { DownloadSimpleIcon, EyeIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { DownloadAllFilesButton } from "@/components/partner-jobs/download-all-files-button";
import {
  formatPartnerBytes,
  hasPartnerWebPreview,
  partnerExtensionOf,
} from "@/lib/partner-jobs/uploads";
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
 * Images and PDFs get a WEB-SIZED preview (`?preview=1`, a 1600px WebP of a
 * few hundred KB) rather than the original — production artwork runs to 13 MB,
 * which is what made this page slow. A PDF's preview is its first page,
 * rendered once on the server. AI/PSD/EPS/SVG get a labelled tile: nothing to
 * draw, and an inline SVG can carry script. "View" is offered on exactly the
 * types `previewKind()` approves: an image opens the same web-sized preview,
 * a PDF (and an .ai, which carries a PDF payload) opens the real document in a
 * new tab, since a zoomable vector original is the point of viewing one. The
 * original of anything is always one click away on Download.
 *
 * A plain `<img>` rather than `next/image`: these are short-lived signed URLs
 * behind an auth redirect, and the production image optimizer is not in this
 * app's delivery path (see the /premadedesigns note in CLAUDE.md).
 *
 * Shared by the partner and admin detail pages — the route decides which client
 * to authorize with, so the same markup is correct for both. "Download all"
 * therefore lands on both, which is intended: it zips whatever the caller was
 * already allowed to fetch one at a time.
 */
export function JobFileList({
  files,
  jobNumber,
}: {
  files: DesignJobFile[];
  jobNumber: string;
}) {
  if (files.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No files were attached to this job.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* One file is not a bundle — the per-tile download already does that. */}
      {files.length > 1 ? (
        <div className="flex justify-end">
          <DownloadAllFilesButton files={files} jobNumber={jobNumber} />
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {files.map((file) => {
        const kind = previewKind(file.mime_type);
        const hasPreview = hasPartnerWebPreview(file.original_filename, file.mime_type);
        const ext = partnerExtensionOf(file.original_filename).toUpperCase();
        const href = `/api/partner-job-files/${file.id}`;

        return (
          <li
            key={file.id}
            className="border-glass-border overflow-hidden rounded-[8px] border"
          >
            <div className="bg-glass-highlight/10 flex aspect-[4/3] items-center justify-center overflow-hidden">
              {hasPreview ? (
                <img
                  src={`${href}?preview=1`}
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
                    <Button asChild variant="ghost" size="icon" className="size-11 md:size-8">
                      <a
                        href={kind === "image" ? `${href}?preview=1` : `${href}?inline=1`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`View ${file.original_filename}`}
                      >
                        <EyeIcon className="size-4" />
                      </a>
                    </Button>
                  ) : null}
                  <Button asChild variant="ghost" size="icon" className="size-11 md:size-8">
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
    </div>
  );
}
