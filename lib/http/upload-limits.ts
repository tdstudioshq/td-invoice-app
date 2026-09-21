// Leave room below Vercel's 4.5 MB payload ceiling for multipart framing.
// Large direct-storage exports remain on the worker rollout branch.
export const MAX_DIRECT_BYTES = 4_000_000;
export const DIRECT_UPLOAD_MESSAGE = "This export supports up to 4 MB combined. Use smaller images or fewer items.";
export const DIRECT_OUTPUT_MESSAGE = "The generated file exceeds 4 MB. Reduce the export DPI or number of images.";

export function directUploadError(form: FormData): string | null {
  const encoder = new TextEncoder();
  let bytes = 1024;
  for (const [key, value] of form.entries()) {
    bytes += encoder.encode(key).byteLength + 1024;
    bytes += typeof value === "string" ? encoder.encode(value).byteLength : value.size + encoder.encode(value.name).byteLength;
    if (bytes > MAX_DIRECT_BYTES) return DIRECT_UPLOAD_MESSAGE;
  }
  return null;
}
