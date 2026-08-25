import {
  createPartnerJobUploadTicketsAction,
  type PartnerUploadTicket,
} from "@/app/actions/partner-jobs";
import { validatePartnerUploadFile } from "@/lib/partner-jobs/uploads";

/**
 * Browser-side half of the partner job upload pipeline. Mirrors
 * lib/mylar-printing/upload-client.ts and components/portal/admin-multi-upload:
 * the server mints one-shot signed upload URLs, the browser PUTs bytes straight
 * to Supabase Storage, and only the resulting object keys come back.
 *
 * Bytes never travel through a Server Action, so a 40 MB layered PSD is fine —
 * neither Next's ~4 MB Server Action body limit nor Vercel's request cap is in
 * the path. Progress comes from XMLHttpRequest, which (unlike fetch) exposes
 * upload progress events.
 */

export interface UploadedJobFile {
  path: string;
  name: string;
}

export type UploadJobFilesResult =
  | { ok: true; jobId: string | null; files: UploadedJobFile[] }
  | { ok: false; error: string; jobId: string | null; files: UploadedJobFile[] };

function putWithProgress(
  ticket: PartnerUploadTicket,
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.signedUrl);
    xhr.setRequestHeader("Content-Type", ticket.contentType);
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
      // Storage answers 413 once the bucket's file_size_limit is exceeded — the
      // one failure the rep can actually act on, so it is named.
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

/**
 * Upload every file for one job and return the object keys the submission will
 * claim.
 *
 * Sequential rather than parallel: a rep on a phone sending several 30 MB print
 * sources gets a truthful per-file progress bar and does not saturate their
 * uplink. Files already uploaded (a retry after a failed submit) are passed
 * through untouched, so nothing is ever sent twice.
 *
 * On failure it still returns whatever DID upload, so the caller can hand those
 * keys to `discardPartnerJobFilesAction` instead of stranding them.
 */
export async function uploadJobFiles(params: {
  jobId: string | null;
  files: File[];
  alreadyUploaded?: UploadedJobFile[];
  onProgress: (index: number, percent: number) => void;
  signal?: AbortSignal;
}): Promise<UploadJobFilesResult> {
  const { files, alreadyUploaded = [], onProgress, signal } = params;
  const uploaded: UploadedJobFile[] = [...alreadyUploaded];

  // No files: there is nothing to mint, so the job id stays null and the server
  // action mints one when it files the job (there are no object keys anchored to
  // it, so nothing has to agree on the value beforehand).
  if (files.length === 0) {
    return { ok: true, jobId: params.jobId, files: uploaded };
  }

  // Fail fast client-side. The server re-runs the identical check when minting
  // — this saves a round trip, it does not grant anything.
  for (const file of files) {
    const invalid = validatePartnerUploadFile(file.name, file.size, file.type || null);
    if (invalid) {
      return { ok: false, error: invalid, jobId: params.jobId, files: uploaded };
    }
  }

  const minted = await createPartnerJobUploadTicketsAction({
    jobId: params.jobId,
    files: files.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type || null,
    })),
  });
  if ("error" in minted) {
    return { ok: false, error: minted.error, jobId: params.jobId, files: uploaded };
  }

  const { jobId, tickets } = minted;
  for (let i = 0; i < tickets.length; i += 1) {
    const ticket = tickets[i];
    if (!ticket.ok) {
      return { ok: false, error: ticket.error, jobId, files: uploaded };
    }
    const put = await putWithProgress(
      ticket,
      files[i],
      (percent) => onProgress(i, percent),
      signal,
    );
    if (!put.ok) {
      return { ok: false, error: put.error, jobId, files: uploaded };
    }
    uploaded.push({ path: ticket.path, name: files[i].name });
  }

  return { ok: true, jobId, files: uploaded };
}
