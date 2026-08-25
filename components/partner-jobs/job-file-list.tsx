import { DownloadSimpleIcon, EyeIcon, FileIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { formatPartnerBytes } from "@/lib/partner-jobs/uploads";
import { previewKind } from "@/lib/portal";
import type { DesignJobFile } from "@/lib/types/database";

/**
 * The files attached to a job.
 *
 * Every link goes through /api/partner-job-files/[fileId], which authorizes the
 * request and 302s to a 60-second signed URL — the bucket is private and has no
 * public URL to render, so a storage path never reaches the browser. Shared by
 * the partner and admin detail pages; the route decides which client to
 * authorize with, so the same markup is correct for both.
 *
 * "View" appears only for `previewKind()` types (non-SVG images and PDFs).
 * Inline SVG can carry scripts, and AI/PSD/EPS have nothing to render, so those
 * download instead.
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
    <ul className="space-y-2">
      {files.map((file) => {
        const canPreview = previewKind(file.mime_type) !== null;
        return (
          <li
            key={file.id}
            className="border-glass-border flex items-center gap-3 rounded-[8px] border px-3 py-2.5"
          >
            <span className="border-glass-border bg-glass-highlight/15 text-metal-platinum flex size-9 shrink-0 items-center justify-center rounded-[8px] border">
              <FileIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{file.original_filename}</p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {formatPartnerBytes(file.file_size)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {canPreview ? (
                <Button asChild variant="ghost" size="icon" className="size-9">
                  <a
                    href={`/api/partner-job-files/${file.id}?inline=1`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View ${file.original_filename}`}
                  >
                    <EyeIcon className="size-4" />
                  </a>
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="icon" className="size-9">
                <a
                  href={`/api/partner-job-files/${file.id}`}
                  aria-label={`Download ${file.original_filename}`}
                >
                  <DownloadSimpleIcon className="size-4" />
                </a>
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
