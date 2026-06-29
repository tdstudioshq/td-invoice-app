import "server-only";

import { getUser, isAdminEmail } from "@/lib/auth";
import { sanitizeFileName } from "@/lib/portal";

export const CUTLINE_BUCKET = "cutline-files";

/** Source artwork limit. Print art can be large, but 1200×1500 stays well under. */
export const MAX_CUTLINE_BYTES = 30 * 1024 * 1024;

/** Signed-URL lifetime for generated downloads. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** A jobId is a client-generated UUID; validate it before it touches a path. */
export function isValidJobId(jobId: string | null | undefined): jobId is string {
  return (
    typeof jobId === "string" &&
    /^[0-9a-fA-F-]{8,64}$/.test(jobId) &&
    !jobId.includes("/") &&
    !jobId.includes("..")
  );
}

export function inputPath(uid: string, jobId: string, fileName: string): string {
  return `${uid}/${jobId}/in/${sanitizeFileName(fileName)}`;
}

export function outputPath(uid: string, jobId: string, fileName: string): string {
  return `${uid}/${jobId}/out/${sanitizeFileName(fileName)}`;
}

export function jobFolder(uid: string, jobId: string): string {
  return `${uid}/${jobId}`;
}

/** Turn an uploaded artwork name into its output PDF name. */
export function pdfNameFor(fileName: string): string {
  const base = sanitizeFileName(fileName).replace(/\.[^.]+$/, "");
  return `${base || "cutline"}.pdf`;
}

/**
 * Authenticate the request and require an admin. Returns the user on success or
 * a JSON Response (401/403) the caller should return directly. The cutline tool
 * is admin-only; unlike requireAdmin() this never redirects (wrong for fetch).
 */
export async function requireAdminApi(): Promise<
  { user: { id: string; email?: string } } | { response: Response }
> {
  const user = await getUser();
  if (!user) {
    return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdminEmail(user.email)) {
    return { response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}
