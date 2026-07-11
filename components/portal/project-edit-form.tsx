"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { updateProjectAction } from "@/app/actions/projects";
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
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/lib/projects";
import type { ClientProject, ProjectStatus } from "@/lib/types/database";

export function ProjectEditForm({ project }: { project: ClientProject }) {
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [state, formAction] = useActionState(
    updateProjectAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Project updated");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={project.id} />
      <input type="hidden" name="client_id" value={project.client_id} />
      <input type="hidden" name="status" value={status} />
      <div className="space-y-2">
        <Label htmlFor="edit-project-name">
          Name<span className="text-destructive"> *</span>
        </Label>
        <Input
          id="edit-project-name"
          name="name"
          defaultValue={project.name}
          aria-invalid={Boolean(state.fieldErrors?.name)}
        />
        {state.fieldErrors?.name ? (
          <p className="text-destructive text-xs">{state.fieldErrors.name}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-project-description">Description</Label>
        <Textarea
          id="edit-project-description"
          name="description"
          rows={3}
          defaultValue={project.description ?? ""}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-project-due">Due date</Label>
          <Input
            id="edit-project-due"
            name="due_date"
            type="date"
            defaultValue={project.due_date ?? ""}
          />
          {state.fieldErrors?.due_date ? (
            <p className="text-destructive text-xs">
              {state.fieldErrors.due_date}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as ProjectStatus)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Draft and Archived projects are hidden from the client&apos;s
            portal.
          </p>
        </div>
      </div>
      <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
    </form>
  );
}
