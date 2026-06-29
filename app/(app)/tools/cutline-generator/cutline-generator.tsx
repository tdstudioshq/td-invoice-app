"use client";

import { useCallback, useRef, useState } from "react";
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
  url?: string; // signed download URL when complete
  outName?: string;
}

const ACCEPTED = ["image/jpeg", "image/png"];
const MAX_BYTES = 30 * 1024 * 1024;
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

export function CutlineGenerator({ presets }: { presets: PresetOption[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const jobIdRef = useRef<string>(crypto.randomUUID());
  const inputRef = useRef<HTMLInputElement>(null);

  const update = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    const accepted: Item[] = [];
    let rejected = 0;
    for (const file of incoming) {
      const okType =
        ACCEPTED.includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
      if (!okType || file.size === 0 || file.size > MAX_BYTES) {
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
    if (accepted.length > 0) setItems((prev) => [...prev, ...accepted]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  }, []);

  // Upload + process a single file. XHR is used (not fetch) so we can surface
  // real upload progress and distinguish the "uploading" vs "processing" states.
  const processOne = useCallback(
    (item: Item) =>
      new Promise<void>((resolve) => {
        const form = new FormData();
        form.append("file", item.file);
        form.append("jobId", jobIdRef.current);
        form.append("preset", presetId);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/cutline/generate");

        update(item.id, { status: "uploading", progress: 0, error: undefined });

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            update(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
          }
        };
        // Bytes are all sent — the server is now composing the PDF.
        xhr.upload.onload = () => update(item.id, { status: "processing", progress: 100 });

        xhr.onload = () => {
          let payload: { ok?: boolean; url?: string; name?: string; error?: string } = {};
          try {
            payload = JSON.parse(xhr.responseText);
          } catch {
            /* fall through to error handling */
          }
          if (xhr.status >= 200 && xhr.status < 300 && payload.ok && payload.url) {
            update(item.id, {
              status: "complete",
              url: payload.url,
              outName: payload.name,
            });
          } else {
            update(item.id, {
              status: "failed",
              error: payload.error || `Request failed (${xhr.status})`,
            });
          }
          resolve();
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

  const downloadZip = useCallback(async () => {
    setZipping(true);
    try {
      const res = await fetch("/api/cutline/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: jobIdRef.current }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.url) {
        throw new Error(payload.error || "Could not build ZIP.");
      }
      window.location.href = payload.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not build ZIP.");
    } finally {
      setZipping(false);
    }
  }, []);

  const startOver = useCallback(async () => {
    const jobId = jobIdRef.current;
    items.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    setItems([]);
    jobIdRef.current = crypto.randomUUID();
    // Best-effort cleanup of the temporary Storage folder.
    fetch(`/api/cutline/job?jobId=${jobId}`, { method: "DELETE", keepalive: true }).catch(
      () => {},
    );
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
            : "border-border hover:border-muted-foreground/50 hover:bg-muted/30",
        )}
      >
        <UploadSimpleIcon className="text-muted-foreground size-7" weight="bold" />
        <p className="text-sm font-medium text-metal-platinum">
          Drag &amp; drop designs, or click to browse
        </p>
        <p className="text-muted-foreground text-xs">
          JPG or PNG · 1200×1500 recommended · batch supported
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
                className="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.previewUrl}
                  alt=""
                  className="size-14 shrink-0 rounded-md object-cover ring-1 ring-border"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-metal-platinum">
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
                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
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
