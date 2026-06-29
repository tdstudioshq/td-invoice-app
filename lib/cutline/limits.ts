/**
 * Shared safety limits + naming for the public Cutline Generator.
 *
 * Server- and client-safe (no `fs`, no Supabase, no `server-only`) so the route
 * handler and the browser UI enforce the exact same rules.
 */

/** Per-image upload cap. 1200×1500 JPG/PNG art is well under this. */
export const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30 MB

/** Max images accepted in a single batch — bounds memory + abuse on a public tool. */
export const MAX_BATCH = 25;

/** The only image types we accept. */
export const ACCEPTED_MIME = ["image/jpeg", "image/png"];
export const ACCEPTED_EXT = /\.(jpe?g|png)$/i;

/** True when a file looks like an accepted JPG/PNG (by MIME or extension). */
export function isAcceptedImage(type: string | undefined, name: string): boolean {
  return (
    (typeof type === "string" && ACCEPTED_MIME.includes(type.toLowerCase())) ||
    ACCEPTED_EXT.test(name)
  );
}

/** Derive the output PDF filename from the uploaded image name (sanitised). */
export function pdfNameFor(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? name)
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 200);
  return `${base || "cutline"}.pdf`;
}
