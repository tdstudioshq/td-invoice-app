"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DownloadSimpleIcon,
  FileArrowDownIcon,
  ImageSquareIcon,
  SpinnerGapIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import JSZip from "jszip";
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
import { MAX_BATCH, MAX_FILE_BYTES, isAcceptedImage } from "@/lib/cutline/limits";
import {
  DEFAULT_OPTIONS,
  EXPORT_DPIS,
  type ExportDpi,
  type MockupOptions,
  decodeArtwork,
  mockupNameFor,
  renderMockup,
} from "@/lib/mockup/geometry";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  name: string;
  outName: string;
  image: ImageBitmap | HTMLImageElement;
}

const PREVIEW_DPI = 150;
const THUMB_DPI = 36;

const BACKGROUNDS: { id: string; label: string; value: string | null }[] = [
  { id: "transparent", label: "Transparent", value: null },
  { id: "black", label: "Black", value: "#111114" },
  { id: "white", label: "White", value: "#ffffff" },
  { id: "zinc", label: "Studio gray", value: "#27272a" },
];

function releaseImage(image: Item["image"]) {
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    image.close();
  }
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Render-to-canvas thumbnail; re-renders when the shared options change. */
function Thumb({ item, options }: { item: Item; options: MockupOptions }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderMockup(ref.current, item.image, options, THUMB_DPI);
  }, [item, options]);
  return <canvas ref={ref} className="block w-full rounded-sm" aria-hidden />;
}

export function MockupGenerator() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [options, setOptions] = useState<MockupOptions>(DEFAULT_OPTIONS);
  const [dpi, setDpi] = useState<ExportDpi>(300);
  const [decoding, setDecoding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const selected = useMemo(
    () => items.find((it) => it.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  // Live preview of the selected design.
  useEffect(() => {
    if (previewRef.current && selected) {
      renderMockup(previewRef.current, selected.image, options, PREVIEW_DPI);
    }
  }, [selected, options]);

  // Release decoded bitmaps on unmount. Ref kept in sync via effect so the
  // cleanup sees the latest items (same pattern as the cutline tool).
  const itemsRef = useRef<Item[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  useEffect(
    () => () => {
      itemsRef.current.forEach((it) => releaseImage(it.image));
    },
    [],
  );

  const setOpt = useCallback(
    <K extends keyof MockupOptions>(key: K, value: MockupOptions[K]) =>
      setOptions((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const incoming = Array.from(files);
      let rejected = 0;
      const accepted = incoming.filter((file) => {
        const ok =
          isAcceptedImage(file.type, file.name) &&
          file.size > 0 &&
          file.size <= MAX_FILE_BYTES;
        if (!ok) rejected += 1;
        return ok;
      });
      if (rejected > 0) {
        toast.error(
          `Skipped ${rejected} file${rejected > 1 ? "s" : ""} — JPG/PNG up to 30 MB only.`,
        );
      }
      const room = MAX_BATCH - items.length;
      if (accepted.length > room) {
        toast.error(
          room <= 0
            ? `Batch limit reached (${MAX_BATCH} images).`
            : `Only ${room} more image${room > 1 ? "s" : ""} fit (max ${MAX_BATCH}).`,
        );
      }
      const toDecode = accepted.slice(0, Math.max(0, room));
      if (toDecode.length === 0) return;

      setDecoding(true);
      const decoded: Item[] = [];
      for (const file of toDecode) {
        try {
          decoded.push({
            id: crypto.randomUUID(),
            name: file.name,
            outName: mockupNameFor(file.name),
            image: await decodeArtwork(file),
          });
        } catch {
          toast.error(`Could not read ${file.name}.`);
        }
      }
      setDecoding(false);
      if (decoded.length === 0) return;
      setItems((prev) => [...prev, ...decoded]);
      setSelectedId(decoded[decoded.length - 1].id);
    },
    [items.length],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) releaseImage(target.image);
      return prev.filter((it) => it.id !== id);
    });
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const startOver = useCallback(() => {
    items.forEach((it) => releaseImage(it.image));
    setItems([]);
    setSelectedId(null);
  }, [items]);

  /** Render one item at export DPI on an offscreen canvas → PNG blob. */
  const renderBlob = useCallback(
    (item: Item): Promise<Blob> =>
      new Promise((resolve, reject) => {
        const canvas = document.createElement("canvas");
        renderMockup(canvas, item.image, options, dpi);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Render failed"))),
          "image/png",
        );
      }),
    [options, dpi],
  );

  const downloadOne = useCallback(async () => {
    if (!selected) return;
    setExporting(true);
    try {
      const blob = await renderBlob(selected);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, selected.outName);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error("Could not render the mockup.");
    } finally {
      setExporting(false);
    }
  }, [selected, renderBlob]);

  const downloadZip = useCallback(async () => {
    if (items.length === 0) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      for (const it of items) {
        let name = it.outName;
        let n = 1;
        while (used.has(name)) name = it.outName.replace(/\.png$/i, `-${++n}.png`);
        used.add(name);
        zip.file(name, await renderBlob(it));
      }
      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const url = URL.createObjectURL(blob);
      triggerDownload(
        url,
        `mockups-${dpi}dpi-${new Date().toISOString().slice(0, 10)}.zip`,
      );
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error("Could not build ZIP.");
    } finally {
      setExporting(false);
    }
  }, [items, renderBlob, dpi]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const backgroundId =
    BACKGROUNDS.find((b) => b.value === options.background)?.id ?? "transparent";

  return (
    <div className="flex flex-col gap-6">
      {/* Drop zone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center transition-colors",
          "hover:border-primary/60 hover:bg-card",
          dragActive && "border-primary bg-primary/5",
        )}
      >
        {decoding ? (
          <SpinnerGapIcon className="size-7 animate-spin text-muted-foreground" />
        ) : (
          <UploadSimpleIcon className="size-7 text-muted-foreground" />
        )}
        <span className="text-sm font-medium text-foreground">
          Drop 4×5 artwork or click to browse
        </span>
        <span className="text-xs text-muted-foreground">
          1200×1500 JPG/PNG · up to {MAX_BATCH} at once · rendered in your
          browser, never uploaded
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </button>

      {items.length > 0 && (
        <div className="grid gap-6 md:grid-cols-[1fr_240px]">
          {/* Preview */}
          <div className="flex items-center justify-center rounded-xl border border-border bg-card/50 p-6">
            <canvas
              ref={previewRef}
              className="h-auto max-h-[420px] max-w-full drop-shadow-2xl"
              aria-label={selected ? `Mockup preview of ${selected.name}` : "Mockup preview"}
            />
          </div>

          {/* Options */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Finish
              </p>
              {(
                [
                  ["gloss", "Mylar gloss"],
                  ["dieLine", "Die-line stroke"],
                  ["shadow", "Drop shadow"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center justify-between gap-3 text-sm"
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={(e) => setOpt(key, e.target.checked)}
                    className="size-4 accent-primary"
                  />
                </label>
              ))}
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="mockup-bg" className="text-sm font-normal">
                  Background
                </Label>
                <Select
                  value={backgroundId}
                  onValueChange={(id) =>
                    setOpt(
                      "background",
                      BACKGROUNDS.find((b) => b.id === id)?.value ?? null,
                    )
                  }
                >
                  <SelectTrigger id="mockup-bg" className="h-8 w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BACKGROUNDS.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="mockup-dpi" className="text-sm font-normal">
                  Resolution
                </Label>
                <Select
                  value={String(dpi)}
                  onValueChange={(v) => setDpi(Number(v) as ExportDpi)}
                >
                  <SelectTrigger id="mockup-dpi" className="h-8 w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPORT_DPIS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} DPI
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={downloadOne} disabled={!selected || exporting}>
              {exporting ? (
                <SpinnerGapIcon className="size-4 animate-spin" />
              ) : (
                <DownloadSimpleIcon className="size-4" />
              )}
              Download PNG
            </Button>
            {items.length > 1 && (
              <Button variant="secondary" onClick={downloadZip} disabled={exporting}>
                <FileArrowDownIcon className="size-4" />
                Download all ({items.length}) as ZIP
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={startOver}
              disabled={exporting}
              className="text-muted-foreground"
            >
              <TrashIcon className="size-4" />
              Start over
            </Button>
          </div>
        </div>
      )}

      {/* Queue strip */}
      {items.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {items.map((it) => (
            <div
              key={it.id}
              className={cn(
                "group relative w-24 shrink-0 cursor-pointer rounded-lg border bg-card/50 p-1.5 transition-colors",
                selected?.id === it.id
                  ? "border-primary"
                  : "border-border hover:border-muted-foreground/40",
              )}
              onClick={() => setSelectedId(it.id)}
            >
              <Thumb item={it} options={options} />
              <p
                className="mt-1 truncate text-center text-[10px] text-muted-foreground"
                title={it.name}
              >
                {it.name}
              </p>
              <button
                type="button"
                aria-label={`Remove ${it.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeItem(it.id);
                }}
                className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-destructive group-hover:flex"
              >
                <TrashIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && !decoding && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ImageSquareIcon className="size-4" />
          The die line, tear notches, and seal margin match the TD Studios 4×5
          bag template exactly.
        </div>
      )}
    </div>
  );
}
