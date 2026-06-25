"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";

import { adminUploadFileAction } from "@/app/actions/portal";
import { initialActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
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

export function AdminUploadForm({
  clientId,
  folders,
}: {
  clientId: string;
  folders: ClientFileFolder[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    adminUploadFileAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success("File uploaded");
      formRef.current?.reset();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="client_id" value={clientId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select name="category" defaultValue="final_files">
            <SelectTrigger id="category">
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
          <Label htmlFor="folder_id">Folder (optional)</Label>
          <Select name="folder_id" defaultValue="none">
            <SelectTrigger id="folder_id">
              <SelectValue placeholder="No folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No folder</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {CATEGORY_LABEL[f.category]} / {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="file">File</Label>
        <Input id="file" name="file" type="file" required />
        {state.fieldErrors?.file ? (
          <p className="text-destructive text-xs">{state.fieldErrors.file}</p>
        ) : null}
      </div>

      <SubmitButton pendingText="Uploading…">
        <Upload />
        Upload file
      </SubmitButton>
    </form>
  );
}
