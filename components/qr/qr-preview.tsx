import { QrCode } from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Renders the generated QR code on a white tile (QR codes need high contrast to
 * scan, so the code itself stays light even inside the dark glass UI), or a
 * clean empty state before anything has been generated.
 */
export function QrPreview({
  dataUrl,
  background = "#ffffff",
  className,
}: {
  dataUrl: string | null;
  /** Tile color behind the code, matched to the QR's background for cohesion. */
  background?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex aspect-square w-full items-center justify-center rounded-[8px] border border-glass-border bg-glass/35 p-4 shadow-[inset_0_1px_0_var(--glass-highlight)]",
        className,
      )}
    >
      {dataUrl ? (
        <div
          className="rounded-[6px] p-3 shadow-lg"
          style={{ backgroundColor: background }}
        >
          <Image
            src={dataUrl}
            alt="Generated QR code"
            width={256}
            height={256}
            unoptimized
            className="size-full max-h-64 max-w-64 object-contain"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-[8px]">
            <QrCode className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">No QR code yet</p>
            <p className="text-muted-foreground max-w-xs text-xs">
              Enter a URL or text to generate a live preview.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
