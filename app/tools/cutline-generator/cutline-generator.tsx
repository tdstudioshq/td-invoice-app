"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircleIcon,
  DownloadSimpleIcon,
  FileArrowDownIcon,
  ImageSquareIcon,
  SpinnerGapIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import JSZip from "jszip";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MAX_BATCH,
  MAX_FILE_BYTES,
  isAcceptedImage,
  pdfNameFor,
} from "@/lib/cutline/limits";
import { cn } from "@/lib/utils";

type PresetOption = { id: string; label: string; description: string };

type Status = "queued" | "uploading" | "processing" | "complete" | "failed";

interface Item {
  id: string;
  file: File;
  previewUrl: string;
  status: Status;
  progress: number; // 0..100 upload progress
  error?: string;
  blob?: Blob; // generated PDF (kept for the batch ZIP)
  url?: string; // object URL for the generated PDF
  outName?: string;
}

const CONCURRENCY = 3;

const STATUS_BADGE: Record<
  Status,
  { label: string; variant: "secondary" | "outline" | "default" | "destructive" }
> = {
  queued: { label: "Queued", variant: "outline" },
  uploading: { label: "Uploading", variant: "secondary" },
  processing: { label: "Processing", variant: "secondary" },
  complete: { label: "Complete", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function CutlineGenerator({ presets }: { presets: PresetOption[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke every object URL we created when the component unmounts. Keep a ref in
  // sync via an effect (never write a ref during render) so the unmount cleanup
  // sees the latest items.
  const itemsRef = useRef<Item[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  useEffect(
    () => () => {
      itemsRef.current.forEach((it) => {
        URL.revokeObjectURL(it.previewUrl);
        if (it.url) URL.revokeObjectURL(it.url);
      });
    },
    [],
  );

  const update = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    const accepted: Item[] = [];
    let rejected = 0;
    for (const file of incoming) {
      if (
        !isAcceptedImage(file.type, file.name) ||
        file.size === 0 ||
        file.size > MAX_FILE_BYTES
      ) {
        rejected += 1;
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "queued",
        progress: 0,
      });
    }
    if (rejected > 0) {
      toast.error(
        `Skipped ${rejected} file${rejected > 1 ? "s" : ""} — JPG/PNG up to 30 MB only.`,
      );
    }
    if (accepted.length === 0) return;

    setItems((prev) => {
      const room = MAX_BATCH - prev.length;
      if (room <= 0) {
        toast.error(`Batch limit reached (${MAX_BATCH} images).`);
        accepted.forEach((it) => URL.revokeObjectURL(it.previewUrl));
        return prev;
      }
      if (accepted.length > room) {
        toast.error(`Only ${room} more image${room > 1 ? "s" : ""} fit (max ${MAX_BATCH}).`);
        accepted.slice(room).forEach((it) => URL.revokeObjectURL(it.previewUrl));
      }
      return [...prev, ...accepted.slice(0, room)];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        if (target.url) URL.revokeObjectURL(target.url);
      }
      return prev.filter((it) => it.id !== id);
    });
  }, []);

  // Upload + compose a single file. XHR (not fetch) so we can surface real upload
  // progress and distinguish "uploading" from "processing". The PDF comes back as
  // the response body (a blob) — nothing is stored server-side.
  const processOne = useCallback(
    (item: Item) =>
      new Promise<void>((resolve) => {
        const form = new FormData();
        form.append("file", item.file);
        form.append("preset", presetId);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/cutline/generate");
        xhr.responseType = "blob";

        update(item.id, { status: "uploading", progress: 0, error: undefined });

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            update(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
          }
        };
        // Bytes are all sent — the server is now composing the PDF.
        xhr.upload.onload = () => update(item.id, { status: "processing", progress: 100 });

        xhr.onload = () => {
          const blob = xhr.response as Blob;
          if (xhr.status >= 200 && xhr.status < 300 && blob && blob.size > 0) {
            const outName = pdfNameFor(item.file.name);
            update(item.id, {
              status: "complete",
              blob,
              url: URL.createObjectURL(blob),
              outName,
            });
            resolve();
          } else {
            // Error body is JSON; read it out of the blob.
            blob
              ?.text()
              .then((text) => {
                let message = `Request failed (${xhr.status})`;
                try {
                  message = JSON.parse(text).error || message;
                } catch {
                  /* keep default */
                }
                update(item.id, { status: "failed", error: message });
              })
              .catch(() => update(item.id, { status: "failed", error: "Request failed" }))
              .finally(resolve);
          }
        };
        xhr.onerror = () => {
          update(item.id, { status: "failed", error: "Network error" });
          resolve();
        };

        xhr.send(form);
      }),
    [presetId, update],
  );

  const generate = useCallback(async () => {
    const queue = items.filter(
      (it) => it.status === "queued" || it.status === "failed",
    );
    if (queue.length === 0) return;
    setRunning(true);

    // Simple concurrency pool.
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const next = queue[cursor++];
        await processOne(next);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
    );

    setRunning(false);
  }, [items, processOne]);

  // Bundle the already-generated PDF blobs into a ZIP in the browser. (PDF
  // generation stays server-side; this only zips finished files — no upload,
  // no storage.)
  const downloadZip = useCallback(async () => {
    const done = items.filter((it) => it.status === "complete" && it.blob);
    if (done.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      for (const it of done) {
        let name = it.outName ?? pdfNameFor(it.file.name);
        // Avoid collisions when two sources share a name.
        let n = 1;
        while (used.has(name)) name = name.replace(/\.pdf$/i, `-${++n}.pdf`);
        used.add(name);
        zip.file(name, it.blob!);
      }
      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `cutlines-${new Date().toISOString().slice(0, 10)}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error("Could not build ZIP.");
    } finally {
      setZipping(false);
    }
  }, [items]);

  const startOver = useCallback(() => {
    items.forEach((it) => {
      URL.revokeObjectURL(it.previewUrl);
      if (it.url) URL.revokeObjectURL(it.url);
    });
    setItems([]);
  }, [items]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const completeCount = items.filter((it) => it.status === "complete").length;
  const queuedCount = items.filter(
    (it) => it.status === "queued" || it.status === "failed",
  ).length;

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
          dragActive
            ? "border-primary bg-primary/5"
            : "border-white/20 hover:border-white/40 hover:bg-white/[0.03]",
        )}
      >
        <UploadSimpleIcon className="size-7 text-white/70" weight="bold" />
        <p className="text-sm font-medium text-white">
          Drag &amp; drop designs, or click to browse
        </p>
        <p className="text-muted-foreground text-xs">
          JPG or PNG · up to 30 MB · max {MAX_BATCH} per batch
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Cutline preset</span>
          <Select value={presetId} onValueChange={setPresetId} disabled={running}>
            <SelectTrigger className="w-[230px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {presets.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
          <Button onClick={generate} disabled={running || queuedCount === 0}>
            {running ? (
              <SpinnerGapIcon className="size-4 animate-spin" />
            ) : (
              <FileArrowDownIcon className="size-4" />
            )}
            {running ? "Generating…" : `Generate${queuedCount ? ` (${queuedCount})` : ""}`}
          </Button>
          <Button
            variant="outline"
            onClick={downloadZip}
            disabled={zipping || completeCount === 0}
          >
            {zipping ? (
              <SpinnerGapIcon className="size-4 animate-spin" />
            ) : (
              <DownloadSimpleIcon className="size-4" />
            )}
            Download All ZIP
          </Button>
          {items.length > 0 ? (
            <Button variant="ghost" onClick={startOver} disabled={running}>
              Start over
            </Button>
          ) : null}
        </div>
      </div>

      {/* File list */}
      {items.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((it) => {
            const badge = STATUS_BADGE[it.status];
            return (
              <li
                key={it.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.previewUrl}
                  alt=""
                  className="size-14 shrink-0 rounded-md object-cover ring-1 ring-white/15"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-white">
                      {it.file.name}
                    </p>
                    <Badge variant={badge.variant} className="shrink-0">
                      {it.status === "complete" ? (
                        <CheckCircleIcon className="size-3" weight="fill" />
                      ) : it.status === "failed" ? (
                        <WarningCircleIcon className="size-3" weight="fill" />
                      ) : it.status === "uploading" || it.status === "processing" ? (
                        <SpinnerGapIcon className="size-3 animate-spin" />
                      ) : (
                        <ImageSquareIcon className="size-3" />
                      )}
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {formatBytes(it.file.size)}
                    {it.status === "uploading" ? ` · ${it.progress}%` : ""}
                    {it.status === "failed" && it.error ? ` · ${it.error}` : ""}
                  </p>
                  {(it.status === "uploading" || it.status === "processing") && (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="bg-primary h-full rounded-full transition-all"
                        style={{
                          width:
                            it.status === "processing" ? "100%" : `${it.progress}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {it.status === "complete" && it.url ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={it.url} download={it.outName}>
                        <DownloadSimpleIcon className="size-4" />
                        PDF
                      </a>
                    </Button>
                  ) : null}
                  {!running ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeItem(it.id)}
                      aria-label="Remove"
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
