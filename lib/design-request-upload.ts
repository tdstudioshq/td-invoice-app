import {
  finalizeDesignRequestUploadsAction,
  mintDesignRequestUploadsAction,
} from "@/app/actions/design-requests";

/**
 * Browser-side half of the public design-request upload pipeline, shared by
 * every anonymous form that accepts files (`/custom-design-request` and
 * `/how-to-order`).
 *
 * Formspree rejects file attachments on the free plan, so files never ride
 * along in the POST. Instead they upload straight to the private
 * `design-requests` Storage bucket via server-minted signed upload URLs
 * (app/actions/design-requests.ts), and the Formspree email carries 30-day
 * signed download links as a plain text field.
 *
 * Returns the links to put in that text field, or a user-facing error string.
 */
export async function uploadDesignRequestAssets(
  files: File[],
): Promise<{ links: { name: string; url: string }[] } | { error: string }> {
  const minted = await mintDesignRequestUploadsAction({
    files: files.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type || null,
    })),
  });
  if (minted.error || !minted.tickets || !minted.requestId) {
    return { error: minted.error ?? "Could not prepare the file upload." };
  }

  const rejected = minted.tickets.filter((t) => !t.ok);
  if (rejected.length > 0) {
    return { error: rejected.map((t) => `${t.name}: ${t.error}`).join(" ") };
  }

  const uploaded: string[] = [];
  for (const ticket of minted.tickets) {
    if (!ticket.ok) continue;
    const file = files.find((f) => f.name === ticket.name);
    if (!file) continue;
    // Same request shape as storage-js's uploadToSignedUrl (PUT + x-upsert),
    // mirroring components/portal/admin-multi-upload.tsx.
    const response = await fetch(ticket.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": ticket.contentType, "x-upsert": "false" },
      body: file,
    });
    if (!response.ok) {
      return { error: `Uploading ${ticket.name} failed. Please try again.` };
    }
    uploaded.push(ticket.path);
  }
  if (uploaded.length === 0) {
    return { error: "No files could be uploaded. Please try again." };
  }

  const finalized = await finalizeDesignRequestUploadsAction({
    requestId: minted.requestId,
    paths: uploaded,
  });
  if (finalized.error || !finalized.links) {
    return { error: finalized.error ?? "Could not finish the file upload." };
  }
  if (finalized.failed && finalized.failed.length > 0) {
    return {
      error: `These files did not upload cleanly: ${finalized.failed.join(", ")}. Please try again.`,
    };
  }
  return { links: finalized.links };
}

/** Formspree inbox both public forms post to; `_subject` distinguishes them. */
export const FORMSPREE_ENDPOINT = "https://formspree.io/f/movkvrpz";

/** Shared input styling for the dark glass forms. */
export const formFieldClass =
  "rounded-xl border-white/15 bg-white/[0.05] px-3.5 text-white placeholder:text-white/40 dark:bg-white/[0.05]";
