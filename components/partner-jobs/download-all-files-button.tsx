"use client";

import { useCallback, useMemo, useState } from "react";
import { DownloadSimpleIcon, SpinnerIcon } from "@phosphor-icons/react";
import JSZip from "jszip";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatPartnerBytes } from "@/lib/partner-jobs/uploads";
import type { DesignJobFile } from "@/lib/types/database";

/**
 * "Download all" — one ZIP of every file on a job.
 *
 * THE BYTES NEVER TOUCH A SERVER ACTION OR A FUNCTION. Each file is fetched
 * from the SAME authorized route the per-file download button uses
 * (/api/partner-job-files/[fileId]), which 302s to a 60-second signed URL, and
 * the browser follows that redirect straight to Supabase Storage. So:
 *
 *   * Authorization is not re-implemented here. A rep's fetch is RLS-scoped and
 *     an admin's goes through the service role, exactly as for one file — there
 *     is no second predicate that could drift out of step with the route's.
 *   * No file bytes are proxied through Vercel, which a server-side zip route
 *     would have done at up to 20 x 50 MB per click.
 *
 * This works because Supabase Storage answers with `access-control-allow-origin: *`,
 * so the cross-origin hop after the redirect is readable by fetch. Zipping in
 * the browser is also the established pattern here — see the Cutline Generator's
 * "Download All ZIP".
 *
 * Each fetch mints its own signed URL, so the 60-second expiry applies per file
 * and a slow batch can never outrun it.
 */

const CONCURRENCY = 3;

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Zip entries must be unique: `logo.png` twice would otherwise clobber itself. */
function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  let candidate = `${stem}-${n}${ext}`;
  while (used.has(candidate)) candidate = `${stem}-${++n}${ext}`;
  used.add(candidate);
  return candidate;
}

export function DownloadAllFilesButton({
  files,
  jobNumber,
  label = "Download all",
}: {
  files: DesignJobFile[];
  jobNumber: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  const totalBytes = useMemo(
    () => files.reduce((sum, f) => sum + Number(f.file_size ?? 0), 0),
    [files],
  );

  const run = useCallback(async () => {
    setBusy(true);
    setDone(0);
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      const failed: string[] = [];

      // Fixed-size worker pool over a shared cursor — same shape as the Cutline
      // Generator's queue. Bounded so a 20-file job doesn't open 20 sockets.
      let cursor = 0;
      const worker = async () => {
        for (;;) {
          const i = cursor++;
          if (i >= files.length) return;
          const file = files[i];
          try {
            const res = await fetch(`/api/partner-job-files/${file.id}`);
            if (!res.ok) throw new Error(String(res.status));
            zip.file(
              uniqueName(file.original_filename, used),
              await res.blob(),
            );
          } catch {
            failed.push(file.original_filename);
          } finally {
            setDone((d) => d + 1);
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker),
      );

      if (failed.length === files.length) {
        toast.error("Could not download these files. Please try again.");
        return;
      }

      // STORE, not DEFLATE: these are already-compressed print sources (JPEG,
      // PNG, PDF), so deflating them burns time and memory for ~no saving. The
      // job here is bundling, not compression.
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${jobNumber}-files.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      if (failed.length > 0) {
        toast.warning(
          `Downloaded ${files.length - failed.length} of ${files.length}. Missing: ${failed.join(", ")}`,
        );
      }
    } catch {
      toast.error("Could not build the ZIP.");
    } finally {
      setBusy(false);
    }
  }, [files, jobNumber]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={run}
      disabled={busy}
      title={`${files.length} files · ${formatPartnerBytes(totalBytes)}`}
    >
      {busy ? (
        <SpinnerIcon className="size-4 animate-spin" />
      ) : (
        <DownloadSimpleIcon className="size-4" />
      )}
      {busy ? `Preparing ${done}/${files.length}…` : label}
    </Button>
  );
}
