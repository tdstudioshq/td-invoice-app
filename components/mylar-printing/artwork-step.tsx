"use client";

import { ArtworkUploader } from "@/components/mylar-printing/artwork-uploader";
import { StepHeading } from "@/components/mylar-printing/wizard-ui";
import {
  ARTWORK_TYPES_LABEL,
  MAX_ARTWORK_BYTES,
  formatArtworkBytes,
} from "@/lib/mylar-printing/artwork";
import type { MylarArtworkFile } from "@/lib/mylar-printing/types";

/**
 * Step 4 — front and back print artwork.
 *
 * Artwork is optional: plenty of orders start before the files are ready, so
 * "I'll send my artwork later" lets the request through with nothing attached.
 * Ticking it disables both slots (rather than hiding them) so the choice stays
 * visible and reversible.
 */
export function ArtworkStep({
  frontArtwork,
  backArtwork,
  comingLater,
  inquiryId,
  onArtworkChange,
  onComingLaterChange,
}: {
  frontArtwork: MylarArtworkFile | undefined;
  backArtwork: MylarArtworkFile | undefined;
  comingLater: boolean;
  inquiryId: string | null;
  onArtworkChange: (
    side: "front" | "back",
    inquiryId: string | null,
    file: MylarArtworkFile | undefined,
  ) => void;
  onComingLaterChange: (comingLater: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        title="Upload your artwork"
        subtitle="Upload the front and back artwork you want printed."
      />

      {/* Stacked on phones, side by side from sm up. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ArtworkUploader
          side="front"
          value={frontArtwork}
          inquiryId={inquiryId}
          disabled={comingLater}
          onUploaded={(id, file) => onArtworkChange("front", id, file)}
          onRemove={() => onArtworkChange("front", inquiryId, undefined)}
        />
        <ArtworkUploader
          side="back"
          value={backArtwork}
          inquiryId={inquiryId}
          disabled={comingLater}
          onUploaded={(id, file) => onArtworkChange("back", id, file)}
          onRemove={() => onArtworkChange("back", inquiryId, undefined)}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {ARTWORK_TYPES_LABEL} · up to{" "}
        {formatArtworkBytes(MAX_ARTWORK_BYTES)} per file. Print-ready files are
        best, but we can work from what you have.
      </p>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3.5 text-sm text-white transition-colors hover:bg-white/[0.08] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/70">
        <input
          type="checkbox"
          checked={comingLater}
          onChange={(event) => onComingLaterChange(event.target.checked)}
          className="border-input accent-foreground size-4"
        />
        I&apos;ll send my artwork later
      </label>
    </div>
  );
}
