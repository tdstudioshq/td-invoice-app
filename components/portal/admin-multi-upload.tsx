"use client";

import { useCallback, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  File as FileIcon,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import {
  createUploadTicketsAction,
  finalizeUploadAction,
} from "@/app/actions/uploads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_LABEL,
  FILE_CATEGORIES,
  MAX_UPLOAD_BYTES,
  formatBytes,
} from "@/lib/portal";
import {
  ACCEPT_ATTRIBUTE,
  ALLOWED_TYPES_LABEL,
  MAX_BATCH_FILES,
  validateUploadFile,
} from "@/lib/uploads";
import { cn } from "@/lib/utils";
import type {
  ClientFileFolder,
  ClientProject,
  FileCategory,
} from "@/lib/types/database";

type Status = "queued" | "signing" | "uploading" | "finalizing" | "done" | "failed";

interface Item {
  id: string;
  file: File;
  status: Status;
  progress: number; // 0..100 upload progress
  error?: string;
}

const CONCURRENCY = 3;

const STATUS_BADGE: Record<
  Status,
  { label: string; variant: "secondary" | "outline" | "default" | "destructive" }
> = {
  queued: { label: "Queued", variant: "outline" },
  signing: { label: "Preparing", variant: "secondary" },
  uploading: { label: "Uploading", variant: "secondary" },
  finalizing: { label: "Saving", variant: "secondary" },
  done: { label: "Done", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
};

/**
 * Upload a file straight to Supabase Storage via a server-minted signed upload
 * URL. Raw XHR (not fetch/supabase-js) so we get real upload progress; the
 * request shape mirrors storage-js's uploadToSignedUrl (PUT + x-upsert).
 */
function putToSignedUrl(
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey) xhr.setRequestHeader("apikey", anonKey);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true });
        return;
      }
      let message = `Upload failed (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText).message || message;
      } catch {
        /* keep default */
      }
      resolve({ ok: false, error: message });
    };
    xhr.onerror = () => resolve({ ok: false, error: "Network error" });
    xhr.send(file);
  });
}

/**
 * Multi-file admin upload into the private client-files bucket. Files go
 * browser → Storage (signed upload URLs), then a per-file finalize action
 * records metadata — see app/actions/uploads.ts for the trust boundary.
 */
export function AdminMultiUpload({
  clientId,
  folders,
  projects,
  fixedProjectId,
}: {
  clientId: string;
  folders: ClientFileFolder[];
  projects?: Pick<ClientProject, "id" | "name">[];
  /** Preselect + lock the project (used on the admin project page). */
  fixedProjectId?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [category, setCategory] = useState<FileCategory>("final_files");
  const [folderId, setFolderId] = useState<string>("none");
  const [projectId, setProjectId] = useState<string>(fixedProjectId ?? "none");
  const [running, setRunning] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const accepted: Item[] = [];
    const rejections: string[] = [];
    for (const file of Array.from(files)) {
      const invalid = validateUploadFile(file.name, file.size, file.type);
      if (invalid) {
        rejections.push(`${file.name}: ${invalid}`);
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        status: "queued",
        progress: 0,
      });
    }
    if (rejections.length > 0) {
      toast.error(rejections[0]);
    }
    if (accepted.length === 0) return;

    setItems((prev) => {
      const room = MAX_BATCH_FILES - prev.length;
      if (room <= 0) {
        toast.error(`Batch limit reached (${MAX_BATCH_FILES} files).`);
        return prev;
      }
      if (accepted.length > room) {
        toast.error(`Only ${room} more file${room > 1 ? "s" : ""} fit (max ${MAX_BATCH_FILES}).`);
      }
      return [...prev, ...accepted.slice(0, room)];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const uploadAll = useCallback(async () => {
    const queue = items.filter(
      (it) => it.status === "queued" || it.status === "failed",
    );
    if (queue.length === 0) return;
    setRunning(true);

    const selectedFolder = folderId !== "none" ? folderId : null;
    const selectedProject =
      fixedProjectId ?? (projectId !== "none" ? projectId : null);

    // Guard the whole batch: a rejected server action (network blip, redeploy
    // invalidating the action reference) must never leave the uploader stuck
    // with running=true. finally always clears it; catch marks in-flight rows.
    try {
      queue.forEach((it) =>
        update(it.id, { status: "signing", progress: 0, error: undefined }),
      );

      // One mint call for the whole batch; per-file errors ride back in tickets.
      const minted = await createUploadTicketsAction({
        clientId,
        category,
        folderId: selectedFolder,
        projectId: selectedProject,
        files: queue.map((it) => ({
          name: it.file.name,
          size: it.file.size,
          type: it.file.type || null,
        })),
      });
      if (minted.error || !minted.tickets) {
        queue.forEach((it) =>
          update(it.id, {
            status: "failed",
            error: minted.error ?? "Could not prepare the upload.",
          }),
        );
        return;
      }
      const tickets = minted.tickets;

      // Tickets come back in request order.
      let cursor = 0;
      const worker = async () => {
        while (cursor < queue.length) {
          const index = cursor++;
          const item = queue[index];
          const ticket = tickets[index];
          if (!ticket || !ticket.ok) {
            update(item.id, {
              status: "failed",
              error: ticket && !ticket.ok ? ticket.error : "No upload ticket.",
            });
            continue;
          }

          update(item.id, { status: "uploading", progress: 0 });
          const put = await putToSignedUrl(
            ticket.signedUrl,
            item.file,
            ticket.contentType,
            (pct) => update(item.id, { progress: pct }),
          );
          if (!put.ok) {
            update(item.id, { status: "failed", error: put.error });
            continue;
          }

          update(item.id, { status: "finalizing", progress: 100 });
          const finalized = await finalizeUploadAction({
            clientId,
            category,
            folderId: selectedFolder,
            projectId: selectedProject,
            path: ticket.path,
            displayName: item.file.name,
          });
          if (finalized.success) {
            update(item.id, { status: "done" });
          } else {
            update(item.id, {
              status: "failed",
              error: finalized.error ?? "Could not save the file.",
            });
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed unexpectedly.";
      setItems((prev) =>
        prev.map((it) =>
          it.status === "signing" ||
          it.status === "uploading" ||
          it.status === "finalizing"
            ? { ...it, status: "failed", error: message }
            : it,
        ),
      );
    } finally {
      setRunning(false);
    }
  }, [
    items,
    clientId,
    category,
    folderId,
    projectId,
    fixedProjectId,
    update,
  ]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const foldersForCategory = folders.filter((f) => f.category === category);
  const queuedCount = items.filter(
    (it) => it.status === "queued" || it.status === "failed",
  ).length;
  const doneCount = items.filter((it) => it.status === "done").length;

  return (
    <div className="space-y-4">
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
          "flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-6 py-8 text-center transition-colors",
          dragActive
            ? "border-primary bg-primary/5"
            : "border-glass-border hover:border-foreground/30",
        )}
      >
        <UploadCloud className="text-muted-foreground size-6" />
        <p className="text-sm font-medium">
          Drag &amp; drop files, or click to browse
        </p>
        <p className="text-muted-foreground text-xs">
          {ALLOWED_TYPES_LABEL} · up to {formatBytes(MAX_UPLOAD_BYTES)} each ·
          max {MAX_BATCH_FILES} per batch
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Destination controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v as FileCategory);
              setFolderId("none");
            }}
            disabled={running}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Folder</Label>
          <Select value={folderId} onValueChange={setFolderId} disabled={running}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Radix forbids empty string values; "none" is the sentinel. */}
              <SelectItem value="none">No folder</SelectItem>
              {foldersForCategory.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!fixedProjectId && projects && projects.length > 0 ? (
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select
              value={projectId}
              onValueChange={setProjectId}
              disabled={running}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {/* Queue */}
      {items.length > 0 ? (
        <ul className="divide-border divide-y border">
          {items.map((it) => {
            const badge = STATUS_BADGE[it.status];
            const busy =
              it.status === "signing" ||
              it.status === "uploading" ||
              it.status === "finalizing";
            return (
              <li key={it.id} className="flex items-center gap-3 p-3">
                <FileIcon className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {it.file.name}
                    </p>
                    <Badge variant={badge.variant} className="shrink-0">
                      {it.status === "done" ? (
                        <CheckCircle2 className="size-3" />
                      ) : it.status === "failed" ? (
                        <CircleAlert className="size-3" />
                      ) : busy ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : null}
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {formatBytes(it.file.size)}
                    {it.status === "uploading" ? ` · ${it.progress}%` : ""}
                  </p>
                  {it.status === "failed" && it.error ? (
                    <p className="text-destructive text-xs">{it.error}</p>
                  ) : null}
                  {busy ? (
                    <div className="bg-muted h-1 w-full overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all"
                        style={{
                          width:
                            it.status === "uploading"
                              ? `${it.progress}%`
                              : "100%",
                        }}
                      />
                    </div>
                  ) : null}
                </div>
                {!running ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeItem(it.id)}
                    aria-label="Remove"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex items-center gap-3">
        <Button onClick={uploadAll} disabled={running || queuedCount === 0}>
          {running ? <Loader2 className="size-4 animate-spin" /> : null}
          {running
            ? "Uploading…"
            : `Upload${queuedCount ? ` ${queuedCount} file${queuedCount > 1 ? "s" : ""}` : ""}`}
        </Button>
        {doneCount > 0 && !running ? (
          <p className="text-muted-foreground text-xs">
            {doneCount} uploaded
          </p>
        ) : null}
      </div>
    </div>
  );
}
