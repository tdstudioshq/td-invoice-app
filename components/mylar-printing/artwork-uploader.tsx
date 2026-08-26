"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  FileIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { discardMylarArtworkAction } from "@/app/actions/mylar-printing";
import {
  ARTWORK_ACCEPT_ATTRIBUTE,
  ARTWORK_TYPES_LABEL,
  MAX_ARTWORK_BYTES,
  artworkExtensionOf,
  formatArtworkBytes,
  isPreviewableArtwork,
} from "@/lib/mylar-printing/artwork";
import { uploadArtwork } from "@/lib/mylar-printing/upload-client";
import type {
  MylarArtworkFile,
  MylarArtworkSide,
} from "@/lib/mylar-printing/types";
import {
  helpTextClass,
  metaLabelClass,
} from "@/components/mylar-printing/wizard-ui";
import { cn } from "@/lib/utils";

type UploadStatus = "idle" | "uploading" | "uploaded" | "failed";

/**
 * What this component knows on its own. "uploaded" is NOT tracked here — it is
 * derived from the parent's `value`, so clearing that (ticking "send artwork
 * later", restoring a session) updates this card with no syncing effect.
 */
type UploadPhase = "idle" | "uploading" | "failed";

/**
 * One artwork slot — one side of one design.
 *
 * Each slot uploads independently the moment a file is chosen, so a failed BACK
 * on Design 2 never invalidates a succeeded FRONT on Design 1 — the failed card
 * keeps the File in state and offers Retry, no re-picking and no restarting the
 * wizard.
 *
 * Bytes go browser → Supabase Storage over a one-shot signed URL (see
 * lib/mylar-printing/upload-client.ts). Only the object key reaches the draft,
 * so a 40 MB PSD never touches a Server Action body.
 */
export function ArtworkUploader({
  designId,
  designNumber,
  side,
  value,
  inquiryId,
  disabled,
  onUploaded,
  onRemove,
}: {
  designId: string;
  /** 1-based, for accessible labels only — never used as an identifier. */
  designNumber: number;
  side: MylarArtworkSide;
  value: MylarArtworkFile | undefined;
  inquiryId: string | null;
  disabled: boolean;
  onUploaded: (inquiryId: string, file: MylarArtworkFile) => void;
  onRemove: () => void;
}) {
  const label = side === "front" ? "Front" : "Back";
  // Scoped by design id: several designs render this component at once, and
  // duplicate input ids would make every label point at the first one.
  const inputId = `artwork-${designId}-${side}`;
  const slotLabel = `Design ${designNumber} ${label.toLowerCase()}`;

  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  // Held so Retry can re-send the same bytes without another file picker trip.
  const pendingFileRef = useRef<File | null>(null);
  // Revoked on replace/remove/unmount — object URLs leak the whole blob
  // otherwise, and print artwork blobs are not small.
  const previewUrlRef = useRef<string | null>(null);
  // Read inside the async upload continuation, where the `disabled` prop
  // captured in the closure may already be stale.
  const disabledRef = useRef(disabled);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const setPreview = useCallback((url: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }, []);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  // Disabled means "send artwork later" is ticked, which visually empties the
  // slot regardless of what is in flight or already stored.
  const status: UploadStatus = disabled
    ? "idle"
    : phase !== "idle"
      ? phase
      : value
        ? "uploaded"
        : "idle";

  const startUpload = useCallback(
    async (file: File) => {
      pendingFileRef.current = file;
      setPendingName(file.name);
      setError(null);
      setProgress(0);
      setPhase("uploading");
      setPreview(isPreviewableArtwork(file.name) ? URL.createObjectURL(file) : null);

      const previous = value;
      const result = await uploadArtwork({
        file,
        designId,
        side,
        inquiryId,
        onProgress: setProgress,
      });

      if (!result.ok) {
        setPhase("failed");
        setError(result.error);
        return;
      }

      setPhase("idle");

      // The customer ticked "I'll send my artwork later" while this was in
      // flight. The parent will refuse the attachment, so drop the bytes here
      // rather than leaving an object nothing will ever reference.
      if (disabledRef.current) {
        setPendingName(null);
        setPreview(null);
        void discardMylarArtworkAction({
          inquiryId: result.inquiryId,
          designId,
          side,
          path: result.file.path,
        });
        return;
      }

      // The card reads "uploaded" from the value the parent is about to hold;
      // this update and that one land in the same commit.
      onUploaded(result.inquiryId, result.file);

      // Replacing a slot frees the object it replaced instead of orphaning it.
      if (previous && previous.path !== result.file.path) {
        void discardMylarArtworkAction({
          inquiryId: result.inquiryId,
          designId,
          side,
          path: previous.path,
        });
      }
    },
    [designId, inquiryId, onUploaded, setPreview, side, value],
  );

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void startUpload(file);
    // Reset so re-picking the same filename fires change again.
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleRemove() {
    const removed = value;
    pendingFileRef.current = null;
    setPendingName(null);
    setPreview(null);
    setProgress(0);
    setError(null);
    setPhase("idle");
    onRemove();
    if (removed && inquiryId) {
      void discardMylarArtworkAction({
        inquiryId,
        designId,
        side,
        path: removed.path,
      });
    }
  }

  // pendingName wins so a failed *replace* names the file that failed, not the
  // one it was replacing; on a restored session there is no pendingName.
  const displayName = pendingName ?? value?.name ?? "";
  const extension = displayName ? artworkExtensionOf(displayName) : "";
  const hasFile = status !== "idle";

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className={metaLabelClass}>{label}</p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ARTWORK_ACCEPT_ATTRIBUTE}
        disabled={disabled}
        onChange={(event) => handleFiles(event.target.files)}
        className="sr-only"
      />

      {!hasFile ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            if (disabled) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            if (disabled) return;
            event.preventDefault();
            setDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
          aria-label={`Upload ${slotLabel} artwork. Drag and drop, or press to browse. ${ARTWORK_TYPES_LABEL}, up to ${formatArtworkBytes(MAX_ARTWORK_BYTES)}.`}
          className={cn(
            "flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center transition-all",
            "focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none",
            disabled
              ? "cursor-not-allowed border-white/10 bg-black/30 opacity-50"
              : dragging
                ? "border-white/60 bg-white/[0.12]"
                : "border-white/20 bg-black/35 hover:border-white/35 hover:bg-black/25",
          )}
        >
          <UploadSimpleIcon weight="bold" className="size-7 text-white/70 md:size-6" />
          <span className="text-base text-white md:text-sm">
            Upload {label} Artwork
          </span>
          <span className={helpTextClass}>Drag &amp; drop or click to browse</span>
        </button>
      ) : (
        <div
          className={cn(
            "flex min-h-44 flex-col gap-3 rounded-2xl border p-4",
            status === "failed"
              ? "border-red-500/40 bg-red-500/[0.06]"
              : "border-white/15 bg-black/35",
          )}
        >
          <div className="flex min-w-0 items-start gap-3">
            {previewUrl ? (
              // Blob preview of the customer's own file — next/image would need
              // a loader and buys nothing for a local object URL.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt=""
                className="size-14 shrink-0 rounded-lg border border-white/10 object-cover"
              />
            ) : (
              <span className="flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-white/10 bg-black/35">
                <FileIcon weight="bold" className="size-5 text-white/70" />
                {extension ? (
                  <span className="text-xs tracking-wider text-white/75 uppercase md:text-[11px]">
                    {extension}
                  </span>
                ) : null}
              </span>
            )}

            <div className="min-w-0 flex-1 space-y-1">
              {/* Print filenames run long — truncate rather than overflow. */}
              <p
                className="truncate text-base text-white md:text-sm"
                title={displayName}
              >
                {displayName}
              </p>
              <p className={helpTextClass}>
                {status === "uploading"
                  ? `Uploading… ${progress}%`
                  : status === "failed"
                    ? "Upload failed"
                    : formatArtworkBytes(value?.size ?? 0)}
              </p>
            </div>

            {status === "uploaded" ? (
              <CheckCircleIcon
                weight="fill"
                className="size-5 shrink-0 text-emerald-400"
              />
            ) : null}
            {status === "failed" ? (
              <WarningCircleIcon
                weight="fill"
                className="size-5 shrink-0 text-red-300"
              />
            ) : null}
          </div>

          {status === "uploading" ? (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label={`${slotLabel} artwork upload progress`}
              className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
            >
              <div
                className="h-full rounded-full bg-white transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}

          {error ? (
            <p className="text-sm leading-relaxed text-red-300 md:text-xs" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-auto flex flex-wrap gap-2">
            {status === "failed" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const file = pendingFileRef.current;
                  if (file) void startUpload(file);
                }}
                className="gap-1.5 border-white/15 bg-black/35 text-white hover:bg-black/25"
              >
                <ArrowClockwiseIcon weight="bold" className="size-3.5" />
                Retry
              </Button>
            ) : null}
            {status !== "uploading" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  className="gap-1.5 border-white/15 bg-black/35 text-white hover:bg-black/25"
                >
                  <ArrowsClockwiseIcon weight="bold" className="size-3.5" />
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemove}
                  className="gap-1.5 border-white/15 bg-black/35 text-white hover:bg-black/25"
                >
                  <TrashIcon weight="bold" className="size-3.5" />
                  Remove
                </Button>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
