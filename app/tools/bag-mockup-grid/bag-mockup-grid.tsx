"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowsClockwiseIcon,
  DotsSixVerticalIcon,
  DownloadSimpleIcon,
  PlusIcon,
  SpinnerGapIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACCEPT_ATTRIBUTE,
  ALLOWED_TYPES_LABEL,
  MAX_FILE_BYTES,
  MAX_IMAGES,
  MAX_TOTAL_BYTES,
  gridNameFor,
  isAcceptedImage,
} from "@/lib/bag-mockup-grid/limits";
import {
  BAG_GRID_EXPORT_DPIS,
  BAG_GRID_EXPORT_FORMATS,
  type BagGridExportDpi,
  type BagGridExportFormat,
  type GridImage,
} from "@/lib/bag-mockup-grid/types";
import { DEFAULT_OPTIONS, PAGE_H, PAGE_W, decodeArtwork, renderMockup } from "@/lib/mockup/geometry";
import { cn } from "@/lib/utils";

// Same live-canvas renderer as the single-bag tool (app/tools/mockup-generator)
// — it's plain browser-canvas code with no framework dependency, so it's
// reused as-is rather than re-implemented for this grid's thumbnails.
const PREVIEW_DPI = 150;

const FORMAT_LABEL: Record<BagGridExportFormat, string> = { png: "PNG", jpg: "JPG", pdf: "PDF" };

type DrawableImage = (HTMLImageElement | ImageBitmap) & { width: number; height: number };
type DecodedMap = Partial<Record<string, DrawableImage>>;

function releaseImage(image: DrawableImage | undefined) {
  if (image && typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    image.close();
  }
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

function BagCell({
  image,
  decoded,
  onReplace,
  onRemove,
  onDropFile,
}: {
  image: GridImage;
  decoded: DrawableImage | undefined;
  onReplace: () => void;
  onRemove: () => void;
  onDropFile: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  });

  useEffect(() => {
    if (canvasRef.current && decoded) {
      renderMockup(canvasRef.current, decoded, DEFAULT_OPTIONS, PREVIEW_DPI);
    }
  }, [decoded]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, aspectRatio: `${PAGE_W} / ${PAGE_H}` }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files?.[0];
        if (file) onDropFile(file);
      }}
      className={cn(
        "group relative rounded-lg bg-card/50",
        isDragging && "z-10 opacity-70",
      )}
    >
      <canvas
        ref={canvasRef}
        onClick={onReplace}
        className="size-full cursor-pointer rounded-lg"
        aria-label="Bag mockup — click to replace"
      />

      {!decoded && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg">
          <SpinnerGapIcon className="text-muted-foreground size-5 animate-spin" />
        </div>
      )}

      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="absolute left-1.5 top-1.5 flex size-6 cursor-grab items-center justify-center rounded-md bg-black/55 text-white/85 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      >
        <DotsSixVerticalIcon weight="bold" className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label="Remove"
        className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md bg-black/55 text-white/85 opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/70 group-hover:opacity-100"
      >
        <XIcon weight="bold" className="size-3.5" />
      </button>
      <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 rounded-md bg-black/55 py-1 text-[11px] text-white/85 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
        <ArrowsClockwiseIcon className="size-3" />
        Click to replace
      </div>
    </div>
  );
}

function AddTile({ onClick, prominent }: { onClick: () => void; prominent: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={prominent ? undefined : { aspectRatio: `${PAGE_W} / ${PAGE_H}` }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/85 text-center transition-colors hover:border-muted-foreground/40 hover:bg-card",
        prominent && "col-span-4 py-16",
      )}
    >
      <PlusIcon className="text-muted-foreground size-6" />
      <span className="text-muted-foreground text-sm leading-relaxed md:text-xs">
        {prominent ? "Drop images or click to browse" : "Add"}
      </span>
    </button>
  );
}

export function BagMockupGrid() {
  const [images, setImages] = useState<GridImage[]>([]);
  const [decoded, setDecoded] = useState<DecodedMap>({});
  const [exportFormat, setExportFormat] = useState<BagGridExportFormat>("png");
  const [exportDpi, setExportDpi] = useState<BagGridExportDpi>(150);
  const [exporting, setExporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const latestRef = useRef({ images, decoded });
  useEffect(() => {
    latestRef.current = { images, decoded };
  });
  useEffect(
    () => () => {
      latestRef.current.images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      Object.values(latestRef.current.decoded).forEach(releaseImage);
    },
    [],
  );

  const decodeInto = useCallback((id: string, file: File) => {
    void decodeArtwork(file)
      .then((img) => setDecoded((prev) => ({ ...prev, [id]: img as DrawableImage })))
      .catch(() => toast.error(`Could not read ${file.name}.`));
  }, []);

  function openFilePicker(targetId: string | null) {
    replaceTargetRef.current = targetId;
    fileInputRef.current?.click();
  }

  const addFiles = useCallback(
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

      setImages((prev) => {
        const room = MAX_IMAGES - prev.length;
        let toAdd = accepted;
        if (toAdd.length > room) {
          if (room <= 0) toast.error(`Batch limit reached (${MAX_IMAGES} images).`);
          else toast.error(`Only ${room} more image${room > 1 ? "s" : ""} fit (max ${MAX_IMAGES}).`);
          toAdd = toAdd.slice(0, Math.max(0, room));
        }
        if (toAdd.length === 0) return prev;

        const added: GridImage[] = toAdd.map((file) => ({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
        }));
        added.forEach((img) => decodeInto(img.id, img.file));
        return [...prev, ...added];
      });
    },
    [decodeInto],
  );

  const replaceImage = useCallback(
    (id: string, file: File) => {
      const error = fileError(file);
      if (error) {
        toast.error(`${file.name}: ${error}.`);
        return;
      }
      setImages((prev) => {
        const target = prev.find((img) => img.id === id);
        if (target) URL.revokeObjectURL(target.previewUrl);
        return prev.map((img) => (img.id === id ? { id, file, previewUrl: URL.createObjectURL(file) } : img));
      });
      setDecoded((prev) => {
        releaseImage(prev[id]);
        const next = { ...prev };
        delete next[id];
        return next;
      });
      decodeInto(id, file);
    },
    [decodeInto],
  );

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
    setDecoded((prev) => {
      releaseImage(prev[id]);
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    Object.values(decoded).forEach(releaseImage);
    setImages([]);
    setDecoded({});
  }, [images, decoded]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setImages((prev) => {
      const oldIndex = prev.findIndex((img) => img.id === active.id);
      const newIndex = prev.findIndex((img) => img.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const handleExport = useCallback(async () => {
    if (images.length === 0) {
      toast.error("Add at least one image before exporting.");
      return;
    }
    const totalBytes = images.reduce((sum, img) => sum + img.file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      toast.error("Combined images are too large to export at once — remove a few and try again.");
      return;
    }

    setExporting(true);
    try {
      const meta = { format: exportFormat, dpi: exportDpi, order: images.map((img) => img.id) };
      const form = new FormData();
      form.append("meta", JSON.stringify(meta));
      images.forEach((img) => form.append(`file:${img.id}`, img.file));

      const res = await fetch("/api/bag-mockup-grid/generate", { method: "POST", body: form });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `Export failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      triggerDownload(url, gridNameFor(exportFormat));
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export the grid.");
    } finally {
      setExporting(false);
    }
  }, [images, exportFormat, exportDpi]);

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            if (replaceTargetRef.current) replaceImage(replaceTargetRef.current, files[0]);
            else addFiles(files);
          }
          replaceTargetRef.current = null;
          e.target.value = "";
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => openFilePicker(null)}>
            <PlusIcon className="size-4" />
            Add images
          </Button>
          <span className="text-muted-foreground text-sm leading-relaxed md:text-xs">
            {images.length}/{MAX_IMAGES}
          </span>
          {images.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
              <TrashIcon className="size-4" />
              Clear all
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as BagGridExportFormat)}>
            <SelectTrigger className="h-11 w-[90px] md:h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BAG_GRID_EXPORT_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(exportDpi)} onValueChange={(v) => setExportDpi(Number(v) as BagGridExportDpi)}>
            <SelectTrigger className="h-11 w-[110px] md:h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BAG_GRID_EXPORT_DPIS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} DPI
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleExport} disabled={exporting || images.length === 0}>
            {exporting ? (
              <SpinnerGapIcon className="size-4 animate-spin" />
            ) : (
              <DownloadSimpleIcon className="size-4" />
            )}
            {exporting ? "Exporting…" : `Export ${FORMAT_LABEL[exportFormat]}`}
          </Button>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "grid grid-cols-2 gap-3 rounded-xl p-3 transition-colors sm:grid-cols-4 sm:gap-4",
          dragActive && "bg-primary/5 ring-primary ring-offset-background ring-2 ring-offset-2",
        )}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={images.map((img) => img.id)} strategy={rectSortingStrategy}>
            {images.map((image) => (
              <BagCell
                key={image.id}
                image={image}
                decoded={decoded[image.id]}
                onReplace={() => openFilePicker(image.id)}
                onRemove={() => removeImage(image.id)}
                onDropFile={(file) => replaceImage(image.id, file)}
              />
            ))}
          </SortableContext>
        </DndContext>
        <AddTile onClick={() => openFilePicker(null)} prominent={images.length === 0} />
      </div>
    </div>
  );
}
