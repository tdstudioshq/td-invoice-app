import { mintMylarArtworkUploadAction } from "@/app/actions/mylar-printing";
import {
  resolveArtworkContentType,
  validateArtworkFile,
} from "@/lib/mylar-printing/artwork";
import type { MylarArtworkFile, MylarArtworkSide } from "@/lib/mylar-printing/types";

/**
 * Browser-side half of the mylar artwork upload pipeline. Mirrors
 * lib/design-request-upload.ts and components/portal/admin-multi-upload.tsx:
 * the server mints a one-shot signed upload URL, the browser PUTs the bytes
 * straight to Supabase Storage, and only the resulting object key comes back.
 *
 * Bytes never travel through a Server Action, so a 40 MB layered PSD is fine —
 * neither Next's ~4 MB Server Action body limit nor Vercel's request cap is in
 * the path. Progress is reported through XMLHttpRequest, which (unlike fetch)
 * exposes upload progress events.
 *
 * Each side uploads independently, so a failed BACK never invalidates a
 * succeeded FRONT — the caller just retries the one that failed.
 */

export type UploadArtworkResult =
  | { ok: true; inquiryId: string; file: MylarArtworkFile }
  | { ok: false; error: string };

function putWithProgress(
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey) xhr.setRequestHeader("apikey", anonKey);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true });
        return;
      }
      // Storage returns 413 once the bucket's file_size_limit is exceeded —
      // worth naming, since it is the one failure the customer can act on.
      if (xhr.status === 413) {
        resolve({ ok: false, error: "That file is too large to upload." });
        return;
      }
      let message = `Upload failed (${xhr.status}).`;
      try {
        message = JSON.parse(xhr.responseText).message || message;
      } catch {
        /* keep the status-code default */
      }
      resolve({ ok: false, error: message });
    };
    xhr.onerror = () =>
      resolve({ ok: false, error: "Network error while uploading." });
    xhr.onabort = () => resolve({ ok: false, error: "Upload cancelled." });

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(file);
  });
}

export async function uploadArtwork(params: {
  file: File;
  side: MylarArtworkSide;
  /** null on the very first upload; the server mints and returns one. */
  inquiryId: string | null;
  onProgress: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<UploadArtworkResult> {
  const { file, side, inquiryId, onProgress, signal } = params;

  // Fail fast client-side for UX. The server re-runs the identical check —
  // this pre-check saves a round trip, it does not grant anything.
  const invalid = validateArtworkFile(file.name, file.size, file.type || null);
  if (invalid) return { ok: false, error: invalid };

  const minted = await mintMylarArtworkUploadAction({
    inquiryId,
    side,
    name: file.name,
    size: file.size,
    type: file.type || null,
  });
  if ("error" in minted) return { ok: false, error: minted.error };

  const { ticket } = minted;
  const put = await putWithProgress(
    ticket.signedUrl,
    file,
    ticket.contentType,
    onProgress,
    signal,
  );
  if (!put.ok) return { ok: false, error: put.error };

  return {
    ok: true,
    inquiryId: ticket.inquiryId,
    file: {
      path: ticket.path,
      name: file.name,
      size: file.size,
      mimeType: resolveArtworkContentType(file.name, file.type || null),
    },
  };
}
