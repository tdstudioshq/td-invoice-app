"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderPlus, X } from "lucide-react";

import { createFolderAction, deleteFolderAction } from "@/app/actions/portal";
import { initialActionState } from "@/app/actions/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_LABEL, FILE_CATEGORIES } from "@/lib/portal";
import type { ClientFileFolder } from "@/lib/types/database";

export function FolderManager({
  clientId,
  folders,
}: {
  clientId: string;
  folders: ClientFileFolder[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Folders</h3>
        <CreateFolderDialog clientId={clientId} />
      </div>
      {folders.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No folders yet. Folders help organize a category.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {folders.map((folder) => (
            <li
              key={folder.id}
              className="bg-muted flex items-center gap-2 px-2.5 py-1 text-xs"
            >
              <span>
                {CATEGORY_LABEL[folder.category]} / {folder.name}
              </span>
              <form action={deleteFolderAction}>
                <input type="hidden" name="id" value={folder.id} />
                <input type="hidden" name="client_id" value={clientId} />
                <button
                  type="submit"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Delete folder ${folder.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateFolderDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    createFolderAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Folder created");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FolderPlus />
          New folder
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="client_id" value={clientId} />
          <div className="space-y-2">
            <Label htmlFor="folder-category">Category</Label>
            <Select name="category" defaultValue="uploads">
              <SelectTrigger id="folder-category">
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
          <div className="space-y-2">
            <Label htmlFor="folder-name">Name</Label>
            <Input
              id="folder-name"
              name="name"
              placeholder="e.g. Brand assets"
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
            <SubmitButton pendingText="Creating…">Create folder</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
