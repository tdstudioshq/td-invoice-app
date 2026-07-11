"use client";

import { useState, useTransition } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";

import { assignFileToProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClientFile } from "@/lib/types/database";

/**
 * Attach one of the client's unassigned files to this project. The per-row
 * unassign/move control lives in FileList (assignableProjects).
 */
export function AssignFileControl({
  clientId,
  projectId,
  unassignedFiles,
}: {
  clientId: string;
  projectId: string;
  unassignedFiles: Pick<ClientFile, "id" | "name">[];
}) {
  const [fileId, setFileId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  if (unassignedFiles.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 sm:max-w-xs">
        <Select value={fileId || undefined} onValueChange={setFileId}>
          <SelectTrigger className="w-full" aria-label="Choose a file to add">
            <SelectValue placeholder="Add an existing file…" />
          </SelectTrigger>
          <SelectContent>
            {unassignedFiles.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={!fileId || pending}
        onClick={() => {
          startTransition(async () => {
            const formData = new FormData();
            formData.set("file_id", fileId);
            formData.set("client_id", clientId);
            formData.set("project_id", projectId);
            const result = await assignFileToProjectAction(formData);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            setFileId("");
            toast.success("File added to project");
          });
        }}
      >
        <Paperclip />
        {pending ? "Adding…" : "Add to project"}
      </Button>
    </div>
  );
}
