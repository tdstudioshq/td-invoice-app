"use client";

import { useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  Download,
  FileText,
  Pencil,
} from "lucide-react";

import { deleteFileAction, renameFileAction } from "@/app/actions/portal";
import {
  assignFileToProjectAction,
  setFileArchivedAction,
} from "@/app/actions/projects";
import { initialActionState } from "@/app/actions/types";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { SubmitButton } from "@/components/shared/submit-button";
import { FilePreviewDialog } from "@/components/portal/file-preview-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_LABEL, formatBytes, previewKind } from "@/lib/portal";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClientFile, ClientProject } from "@/lib/types/database";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

/**
 * Shared file list. In admin mode it shows rename/delete (plus optional
 * archive and project-assignment controls); in portal mode (read-only) it
 * shows download only. Downloads always go through the signed-URL route
 * (/api/files/[id]) — raw storage paths are never exposed. Previewable files
 * (non-SVG images, PDFs) open an inline lightbox; everything else stays a
 * plain download row. Archived rows (only ever passed in by admin screens —
 * portal RLS hides them) render dimmed with an "Archived" chip.
 */
export function FileList({
  files,
  clientId,
  admin = false,
  enablePreview = true,
  archiveToggle = false,
  assignableProjects,
}: {
  files: ClientFile[];
  clientId: string;
  admin?: boolean;
  enablePreview?: boolean;
  /** Admin: show a per-row archive/unarchive button. */
  archiveToggle?: boolean;
  /** Admin: show a per-row project <Select> over these projects. */
  assignableProjects?: Pick<ClientProject, "id" | "name">[];
}) {
  if (files.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No files in this category.</p>
    );
  }

  return (
    <ul className="divide-border divide-y">
      {files.map((file) => {
        const archived = Boolean(file.archived_at);
        const kind = enablePreview ? previewKind(file.mime_type) : null;
        // <span>, not <p>: this node also renders inside the preview <button>.
        const nameEl = (
          <span className="block truncate font-medium">{file.name}</span>
        );
        return (
          <li
            key={file.id}
            className={cn(
              "flex items-center gap-3 py-3 text-sm",
              archived && "opacity-60",
            )}
          >
            <FileText className="text-muted-foreground size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                {kind ? (
                  <FilePreviewDialog
                    fileId={file.id}
                    name={file.name}
                    kind={kind}
                    trigger={
                      <button
                        type="button"
                        className="hover:text-foreground min-w-0 cursor-pointer truncate text-left underline-offset-2 hover:underline"
                        aria-label={`Preview ${file.name}`}
                      >
                        {nameEl}
                      </button>
                    }
                  />
                ) : (
                  nameEl
                )}
                {archived ? (
                  <Badge
                    variant="outline"
                    className="text-muted-foreground shrink-0"
                  >
                    Archived
                  </Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">
                {CATEGORY_LABEL[file.category]} · {formatBytes(file.size_bytes)}{" "}
                · {formatDate(file.created_at)}
              </p>
            </div>
            {admin && assignableProjects ? (
              <FileProjectSelect
                file={file}
                clientId={clientId}
                projects={assignableProjects}
              />
            ) : null}
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="icon-sm" aria-label="Download">
                <a href={`/api/files/${file.id}`} download>
                  <Download />
                </a>
              </Button>
              {admin ? (
                <>
                  {archiveToggle ? (
                    <ArchiveToggleButton file={file} clientId={clientId} />
                  ) : null}
                  <RenameFileDialog file={file} clientId={clientId} />
                  <ConfirmDeleteDialog
                    action={deleteFileAction.bind(null, clientId)}
                    id={file.id}
                    title="Delete file?"
                    description="This permanently removes the file from storage."
                    triggerLabel="Delete"
                    iconOnly
                  />
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ArchiveToggleButton({
  file,
  clientId,
}: {
  file: ClientFile;
  clientId: string;
}) {
  const [pending, startTransition] = useTransition();
  const archived = Boolean(file.archived_at);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={archived ? "Restore" : "Archive"}
      title={archived ? "Restore" : "Archive (hides from the portal)"}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const formData = new FormData();
          formData.set("file_id", file.id);
          formData.set("client_id", clientId);
          formData.set("archived", archived ? "false" : "true");
          const result = await setFileArchivedAction(formData);
          if (result.error) {
            toast.error(result.error);
          } else {
            toast.success(archived ? "File restored" : "File archived");
          }
        });
      }}
    >
      {archived ? <ArchiveRestore /> : <Archive />}
    </Button>
  );
}

function FileProjectSelect({
  file,
  clientId,
  projects,
}: {
  file: ClientFile;
  clientId: string;
  projects: Pick<ClientProject, "id" | "name">[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={file.project_id ?? "none"}
      disabled={pending}
      onValueChange={(value) => {
        startTransition(async () => {
          const formData = new FormData();
          formData.set("file_id", file.id);
          formData.set("client_id", clientId);
          formData.set("project_id", value);
          const result = await assignFileToProjectAction(formData);
          if (result.error) toast.error(result.error);
        });
      }}
    >
      <SelectTrigger
        size="sm"
        className="hidden w-[150px] sm:flex"
        aria-label="Assign to project"
      >
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
  );
}

function RenameFileDialog({
  file,
  clientId,
}: {
  file: ClientFile;
  clientId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    renameFileAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success("File renamed");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Rename">
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename file</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={file.id} />
          <input type="hidden" name="client_id" value={clientId} />
          <div className="space-y-2">
            <Label htmlFor={`name-${file.id}`}>Name</Label>
            <Input
              id={`name-${file.id}`}
              name="name"
              defaultValue={file.name}
              aria-invalid={Boolean(state.fieldErrors?.name)}
            />
            {state.fieldErrors?.name ? (
              <p className="text-destructive text-xs">
                {state.fieldErrors.name}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <SubmitButton>Save</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
