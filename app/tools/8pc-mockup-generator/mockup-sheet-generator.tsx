"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  DotsSixVerticalIcon,
  DownloadSimpleIcon,
  ImageSquareIcon,
  SpinnerGapIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { EIGHT_PIECE_TEMPLATE } from "@/lib/mockup-generator/templates/eight-piece";
import {
  ACCEPT_ATTRIBUTE,
  ALLOWED_TYPES_LABEL,
  MAX_FILE_BYTES,
  MAX_SLOTS,
  MAX_TOTAL_BYTES,
  isAcceptedImage,
  sheetNameFor,
} from "@/lib/mockup-generator/limits";
import {
  DEFAULT_TRANSFORM,
  MOCKUP_EXPORT_DPIS,
  MOCKUP_EXPORT_FORMATS,
  type MockupExportDpi,
  type MockupExportFormat,
  type MockupFitMode,
  type MockupPlacement,
  type MockupTemplateDefinition,
} from "@/lib/mockup-generator/types";
import { cn } from "@/lib/utils";

import type { DrawableImage } from "./sheet-canvas";

// react-konva renders to a real <canvas> — unavailable during SSR, and even a
// "use client" component is still rendered once on the server for the initial
// HTML in the App Router, so this must load client-side only.
const SheetCanvas = dynamic(() => import("./sheet-canvas").then((m) => m.SheetCanvas), {
  ssr: false,
});

type PlacementMap = Partial<Record<string, MockupPlacement>>;
type ImageMap = Partial<Record<string, DrawableImage>>;

const FORMAT_LABEL: Record<MockupExportFormat, string> = { png: "PNG", jpg: "JPG", pdf: "PDF" };

function releaseImage(image: DrawableImage | undefined) {
  if (image && typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    image.close();
  }
}

/** Decode an uploaded file into a drawable image. `createImageBitmap` decodes
 * straight from the File (fast, no intermediate URL); the data-URL fallback
 * covers any browser without it. Callers should release ImageBitmaps when
 * they're replaced or the component unmounts. */
async function decodeMockupImage(file: File): Promise<DrawableImage> {
  if (typeof createImageBitmap === "function") {
    try {
      return (await createImageBitmap(file)) as DrawableImage;
    } catch {
      /* fall through to data URL */
    }
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img as DrawableImage);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = dataUrl;
  });
}

function fileError(file: File): string | null {
  if (!isAcceptedImage(file.type, file.name) || file.size === 0) {
    return `${ALLOWED_TYPES_LABEL} only`;
  }
  if (file.size > MAX_FILE_BYTES) return "25 MB max per image";
  return null;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Which slot (template units → template id) a point in on-screen CSS pixels
 * relative to the canvas falls inside, or null if it's outside every slot. */
function slotAtPoint(
  template: MockupTemplateDefinition,
  screenScale: number,
  pxX: number,
  pxY: number,
): string | null {
  if (screenScale <= 0) return null;
  const x = pxX / screenScale;
  const y = pxY / screenScale;
  const hit = template.slots.find(
    (s) => x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height,
  );
  return hit?.id ?? null;
}

/** Small always-on-top drag handle (dnd-kit) + full-slot droppable target for
 * reordering. Konva renders to a single <canvas>, so its contents aren't
 * individually addressable DOM nodes — these overlay elements are the only
 * real DOM the pointer/keyboard sensors have to grab. */
function SlotDndOverlay({
  slot,
  screenScale,
  populated,
}: {
  slot: MockupTemplateDefinition["slots"][number];
  screenScale: number;
  populated: boolean;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: slot.id });
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: slot.id,
    disabled: !populated,
  });

  return (
    <div
      ref={setDropRef}
      className="absolute"
      style={{
        left: slot.x * screenScale,
        top: slot.y * screenScale,
        width: slot.width * screenScale,
        height: slot.height * screenScale,
        borderRadius: slot.cornerRadius * screenScale,
        outline: isOver ? "2px dashed #6366f1" : undefined,
        outlineOffset: -2,
      }}
    >
      {populated && (
        <button
          ref={setDragRef}
          {...listeners}
          {...attributes}
          type="button"
          aria-label={`Drag to move the image in slot ${slot.id}`}
          className={cn(
            "pointer-events-auto absolute left-1.5 top-1.5 flex size-6 cursor-grab items-center justify-center rounded-md bg-black/55 text-white/85 backdrop-blur-sm transition-opacity hover:bg-black/70 active:cursor-grabbing",
            isDragging && "opacity-0",
          )}
        >
          <DotsSixVerticalIcon weight="bold" className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function MockupSheetGenerator() {
  const [placements, setPlacements] = useState<PlacementMap>({});
  const [images, setImages] = useState<ImageMap>({});
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<MockupExportFormat>("png");
  const [exportDpi, setExportDpi] = useState<MockupExportDpi>(300);
  const [exportBackground, setExportBackground] = useState<"white" | "transparent">("white");
  const [exporting, setExporting] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  // Responsive canvas sizing: the wrapper's CSS aspect-ratio keeps its height
  // correct even before this fires, so there's no layout jump.
  useEffect(() => {
    const el = canvasWrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Release every object URL / decoded bitmap on unmount. Ref kept in sync via
  // an effect (never write a ref during render) so the cleanup sees the latest
  // state (same pattern as the cutline and single-bag mockup tools).
  const latestRef = useRef({ placements, images });
  useEffect(() => {
    latestRef.current = { placements, images };
  });
  useEffect(
    () => () => {
      Object.values(latestRef.current.placements).forEach((p) => {
        if (p) URL.revokeObjectURL(p.previewUrl);
      });
      Object.values(latestRef.current.images).forEach(releaseImage);
    },
    [],
  );

  const assignFile = useCallback((slotId: string, file: File) => {
    void decodeMockupImage(file)
      .then((decoded) => {
        setPlacements((prev) => {
          const existing = prev[slotId];
          if (existing) URL.revokeObjectURL(existing.previewUrl);
          return {
            ...prev,
            [slotId]: {
              slotId,
              file,
              previewUrl: URL.createObjectURL(file),
              originalWidth: decoded.width,
              originalHeight: decoded.height,
              fitMode: "cover",
              transform: DEFAULT_TRANSFORM,
            },
          };
        });
        setImages((prev) => {
          releaseImage(prev[slotId]);
          return { ...prev, [slotId]: decoded };
        });
        setSelectedSlotId(slotId);
      })
      .catch(() => toast.error(`Could not read ${file.name}.`));
  }, []);

  function openFilePicker(targetSlotId: string | null) {
    replaceTargetRef.current = targetSlotId;
    fileInputRef.current?.click();
  }

  const replaceSlot = useCallback(
    (slotId: string, file: File) => {
      const error = fileError(file);
      if (error) {
        toast.error(`${file.name}: ${error}.`);
        return;
      }
      assignFile(slotId, file);
    },
    [assignFile],
  );

  const addFilesSequential = useCallback(
    (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);
      const accepted: File[] = [];
      let rejected = 0;
      for (const file of incoming) {
        if (fileError(file)) rejected += 1;
        else accepted.push(file);
      }
      if (rejected > 0) {
        toast.error(`Skipped ${rejected} file${rejected > 1 ? "s" : ""} — ${ALLOWED_TYPES_LABEL} up to 25 MB only.`);
      }

      let toPlace = accepted;
      if (toPlace.length > MAX_SLOTS) {
        toast.error(`Only ${MAX_SLOTS} images are supported at once — using the first ${MAX_SLOTS}.`);
        toPlace = toPlace.slice(0, MAX_SLOTS);
      }

      const availableSlotIds = EIGHT_PIECE_TEMPLATE.slots
        .map((s) => s.id)
        .filter((id) => !placements[id]);
      if (toPlace.length > availableSlotIds.length) {
        if (availableSlotIds.length === 0) {
          toast.error(`All ${MAX_SLOTS} slots are full — remove one first.`);
        } else {
          const overflow = toPlace.length - availableSlotIds.length;
          toast.error(
            `${overflow} image${overflow > 1 ? "s" : ""} didn't fit — only ${availableSlotIds.length} slot${availableSlotIds.length === 1 ? "" : "s"} open.`,
          );
        }
        toPlace = toPlace.slice(0, availableSlotIds.length);
      }

      toPlace.forEach((file, i) => assignFile(availableSlotIds[i], file));
    },
    [placements, assignFile],
  );

  const removeSlot = useCallback((slotId: string) => {
    setPlacements((prev) => {
      const existing = prev[slotId];
      if (existing) URL.revokeObjectURL(existing.previewUrl);
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setImages((prev) => {
      releaseImage(prev[slotId]);
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    setSelectedSlotId((cur) => (cur === slotId ? null : cur));
  }, []);

  const clearAll = useCallback(() => {
    Object.values(placements).forEach((p) => p && URL.revokeObjectURL(p.previewUrl));
    Object.values(images).forEach(releaseImage);
    setPlacements({});
    setImages({});
    setSelectedSlotId(null);
  }, [placements, images]);

  const swapOrMove = useCallback((sourceId: string, targetId: string) => {
    setPlacements((prev) => {
      const source = prev[sourceId];
      if (!source) return prev;
      const target = prev[targetId];
      const next = { ...prev };
      next[targetId] = { ...source, slotId: targetId };
      if (target) next[sourceId] = { ...target, slotId: sourceId };
      else delete next[sourceId];
      return next;
    });
    setImages((prev) => {
      const sourceImg = prev[sourceId];
      if (!sourceImg) return prev;
      const targetImg = prev[targetId];
      const next = { ...prev };
      next[targetId] = sourceImg;
      if (targetImg) next[sourceId] = targetImg;
      else delete next[sourceId];
      return next;
    });
    setSelectedSlotId((cur) => (cur === sourceId ? targetId : cur === targetId ? sourceId : cur));
  }, []);

  const updateFitMode = useCallback((slotId: string, fitMode: MockupFitMode) => {
    setPlacements((prev) => {
      const existing = prev[slotId];
      if (!existing) return prev;
      return {
        ...prev,
        [slotId]: { ...existing, fitMode, transform: { ...existing.transform, offsetX: 0, offsetY: 0 } },
      };
    });
  }, []);

  const updateZoom = useCallback((slotId: string, scale: number) => {
    setPlacements((prev) => {
      const existing = prev[slotId];
      if (!existing) return prev;
      return { ...prev, [slotId]: { ...existing, transform: { ...existing.transform, scale } } };
    });
  }, []);

  const resetTransform = useCallback((slotId: string) => {
    setPlacements((prev) => {
      const existing = prev[slotId];
      if (!existing) return prev;
      return { ...prev, [slotId]: { ...existing, transform: DEFAULT_TRANSFORM } };
    });
  }, []);

  const handlePanChange = useCallback((slotId: string, offsetX: number, offsetY: number) => {
    setPlacements((prev) => {
      const existing = prev[slotId];
      if (!existing) return prev;
      return { ...prev, [slotId]: { ...existing, transform: { ...existing.transform, offsetX, offsetY } } };
    });
  }, []);

  const handleSlotClick = useCallback(
    (slotId: string) => {
      if (placements[slotId]) setSelectedSlotId(slotId);
      else openFilePicker(slotId);
    },
    [placements],
  );

  const screenScale = containerWidth > 0 ? containerWidth / EIGHT_PIECE_TEMPLATE.width : 0;

  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length === 0) return;

      const bounds = canvasWrapperRef.current?.getBoundingClientRect();
      const targetSlotId = bounds
        ? slotAtPoint(EIGHT_PIECE_TEMPLATE, screenScale, e.clientX - bounds.left, e.clientY - bounds.top)
        : null;

      if (files.length === 1 && targetSlotId) replaceSlot(targetSlotId, files[0]);
      else addFilesSequential(files);
    },
    [screenScale, replaceSlot, addFilesSequential],
  );

  const handleDndDragEnd = useCallback(
    (event: DragEndEvent) => {
      const sourceId = String(event.active.id);
      const targetId = event.over ? String(event.over.id) : null;
      if (!targetId || sourceId === targetId) return;
      swapOrMove(sourceId, targetId);
    },
    [swapOrMove],
  );

  const handleExport = useCallback(async () => {
    const active = Object.values(placements).filter((p): p is MockupPlacement => Boolean(p));
    if (active.length === 0) {
      toast.error("Add at least one image before exporting.");
      return;
    }
    const totalBytes = active.reduce((sum, p) => sum + p.file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      toast.error("Combined images are too large to export at once — remove a few and try again.");
      return;
    }

    setExporting(true);
    try {
      const meta = {
        format: exportFormat,
        dpi: exportDpi,
        background: exportFormat === "jpg" ? "white" : exportBackground,
        placements: active.map((p) => ({ slotId: p.slotId, fitMode: p.fitMode, transform: p.transform })),
      };
      const form = new FormData();
      form.append("meta", JSON.stringify(meta));
      active.forEach((p) => form.append(`file:${p.slotId}`, p.file));

      const res = await fetch("/api/mockup-sheet/generate", { method: "POST", body: form });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `Export failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      triggerDownload(url, sheetNameFor(exportFormat));
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export the sheet.");
    } finally {
      setExporting(false);
    }
  }, [placements, exportFormat, exportDpi, exportBackground]);

  const filledCount = Object.keys(placements).length;
  const selectedPlacement = selectedSlotId ? placements[selectedSlotId] : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            if (replaceTargetRef.current) replaceSlot(replaceTargetRef.current, files[0]);
            else addFilesSequential(files);
          }
          replaceTargetRef.current = null;
          e.target.value = "";
        }}
      />

      {/* Main preview */}
      <div className="flex flex-col gap-3">
        <div
          ref={canvasWrapperRef}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleCanvasDrop}
          className={cn(
            "relative w-full overflow-hidden rounded-xl border bg-card/50 transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-border",
          )}
          style={{ aspectRatio: `${EIGHT_PIECE_TEMPLATE.width} / ${EIGHT_PIECE_TEMPLATE.height}` }}
        >
          <SheetCanvas
            template={EIGHT_PIECE_TEMPLATE}
            containerWidth={containerWidth}
            placements={placements}
            images={images}
            selectedSlotId={selectedSlotId}
            onSlotClick={handleSlotClick}
            onPanChange={handlePanChange}
          />
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDndDragEnd}>
            <div className="absolute inset-0">
              {EIGHT_PIECE_TEMPLATE.slots.map((slot) => (
                <SlotDndOverlay
                  key={slot.id}
                  slot={slot}
                  screenScale={screenScale}
                  populated={Boolean(placements[slot.id])}
                />
              ))}
            </div>
          </DndContext>
        </div>
        <p className="text-muted-foreground text-center text-xs">
          {filledCount}/{MAX_SLOTS} slots filled — click an empty slot to add an image, drag the grip
          handle to reorder, or drag directly on a selected image to reposition it.
        </p>
      </div>

      {/* Sidebar */}
      <div className="flex flex-col gap-4">
        <div
          onClick={() => openFilePicker(null)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files?.length) addFilesSequential(e.dataTransfer.files);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") openFilePicker(null);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border bg-card/50 hover:border-muted-foreground/40",
          )}
        >
          <UploadSimpleIcon className="text-muted-foreground size-6" />
          <p className="text-sm font-medium">Drop images or click to browse</p>
          <p className="text-muted-foreground text-xs">
            {ALLOWED_TYPES_LABEL} · up to 25 MB each · fills the next open slot
          </p>
        </div>

        {selectedPlacement ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Slot {selectedPlacement.slotId}
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs font-normal">Fit mode</Label>
              <div className="flex gap-2">
                {(["cover", "contain"] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={selectedPlacement.fitMode === mode ? "default" : "outline"}
                    className="flex-1 capitalize"
                    onClick={() => updateFitMode(selectedPlacement.slotId, mode)}
                  >
                    {mode}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-normal">Zoom</Label>
                <span className="text-muted-foreground text-xs">
                  {Math.round(selectedPlacement.transform.scale * 100)}%
                </span>
              </div>
              <Slider
                min={1}
                max={4}
                step={0.05}
                value={[selectedPlacement.transform.scale]}
                onValueChange={([v]) => updateZoom(selectedPlacement.slotId, v)}
              />
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => resetTransform(selectedPlacement.slotId)}
            >
              Reset position
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openFilePicker(selectedPlacement.slotId)}
              >
                Replace
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => removeSlot(selectedPlacement.slotId)}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground flex items-center gap-2 rounded-xl border border-border bg-card/50 p-4 text-xs">
            <ImageSquareIcon className="size-4 shrink-0" />
            Select a filled slot to reposition, zoom, replace, or remove its image.
          </div>
        )}

        {filledCount > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={clearAll} className="text-muted-foreground">
            <TrashIcon className="size-4" />
            Clear all
          </Button>
        )}

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Export settings
          </p>

          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-normal">Format</Label>
            <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as MockupExportFormat)}>
              <SelectTrigger className="h-8 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOCKUP_EXPORT_FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FORMAT_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-normal">Resolution</Label>
            <Select value={String(exportDpi)} onValueChange={(v) => setExportDpi(Number(v) as MockupExportDpi)}>
              <SelectTrigger className="h-8 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOCKUP_EXPORT_DPIS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} DPI
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-normal">Background</Label>
            <Select
              value={exportFormat === "jpg" ? "white" : exportBackground}
              disabled={exportFormat === "jpg"}
              onValueChange={(v) => setExportBackground(v as "white" | "transparent")}
            >
              <SelectTrigger className="h-8 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="white">White</SelectItem>
                <SelectItem value="transparent">Transparent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleExport} disabled={exporting || filledCount === 0}>
            {exporting ? (
              <SpinnerGapIcon className="size-4 animate-spin" />
            ) : (
              <DownloadSimpleIcon className="size-4" />
            )}
            {exporting ? "Exporting…" : `Export ${FORMAT_LABEL[exportFormat]}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
