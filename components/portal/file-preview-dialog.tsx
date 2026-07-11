"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PreviewKind } from "@/lib/portal";

/**
 * Inline preview for images and PDFs. The media src is the signed-URL route
 * with ?inline=1 — the browser follows the 302 to a short-lived Supabase URL,
 * so nothing here ever sees a raw storage path. Non-previewable formats
 * (.ai/.psd/.eps/.zip, and SVG by policy) never render this dialog.
 */
export function FilePreviewDialog({
  fileId,
  name,
  kind,
  trigger,
}: {
  fileId: string;
  name: string;
  kind: PreviewKind;
  trigger: React.ReactNode;
}) {
  const src = `/api/files/${fileId}?inline=1`;

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{name}</DialogTitle>
        </DialogHeader>
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived redirect URL; next/image can't optimize it
          <img
            src={src}
            alt={name}
            className="max-h-[70vh] w-full object-contain"
          />
        ) : (
          <iframe src={src} title={name} className="h-[70vh] w-full border-0" />
        )}
        <DialogFooter>
          <Button asChild variant="outline">
            <a href={`/api/files/${fileId}`} download>
              <Download />
              Download
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
