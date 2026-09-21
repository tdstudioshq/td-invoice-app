import { DIRECT_UPLOAD_MESSAGE, MAX_DIRECT_BYTES } from "./upload-limits";

export class UploadTooLargeError extends Error {
  constructor() { super(DIRECT_UPLOAD_MESSAGE); }
}

/** Bound bytes before parsing, including requests with no Content-Length. */
export async function readBoundedForm(req: Request): Promise<FormData> {
  if (Number(req.headers.get("content-length")) > MAX_DIRECT_BYTES) {
    await req.body?.cancel();
    throw new UploadTooLargeError();
  }
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Missing multipart body");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_DIRECT_BYTES) {
        await reader.cancel();
        throw new UploadTooLargeError();
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(new Blob(chunks), {
    headers: { "Content-Type": req.headers.get("content-type") ?? "" },
  }).formData();
}
