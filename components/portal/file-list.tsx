"use client";

import { useState } from "react";
import { Download, FileText, Pencil } from "lucide-react";

import {
  deleteFileAction,
  renameFileAction,
} from "@/app/actions/portal";
import { initialActionState } from "@/app/actions/types";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { SubmitButton } from "@/components/shared/submit-button";
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
import { CATEGORY_LABEL, formatBytes } from "@/lib/portal";
import { formatDate } from "@/lib/format";
import type { ClientFile } from "@/lib/types/database";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

/**
 * Shared file list. In admin mode it shows rename/delete controls; in portal
 * mode (read-only) it shows download only. Downloads always go through the
 * signed-URL route (/api/files/[id]) — raw storage paths are never exposed.
 */
export function FileList({
  files,
  clientId,
  admin = false,
}: {
  files: ClientFile[];
  clientId: string;
  admin?: boolean;
}) {
  if (files.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No files in this category.</p>
    );
  }

  return (
    <ul className="divide-border divide-y">
      {files.map((file) => (
        <li
          key={file.id}
          className="flex items-center gap-3 py-3 text-sm"
        >
          <FileText className="text-muted-foreground size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{file.name}</p>
            <p className="text-muted-foreground text-xs">
              {CATEGORY_LABEL[file.category]} · {formatBytes(file.size_bytes)} ·{" "}
              {formatDate(file.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon-sm" aria-label="Download">
              <a href={`/api/files/${file.id}`} download>
                <Download />
              </a>
            </Button>
            {admin ? (
              <>
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
      ))}
    </ul>
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
