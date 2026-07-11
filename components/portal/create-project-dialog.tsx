"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderPlus } from "lucide-react";

import { createProjectAction } from "@/app/actions/projects";
import { initialActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/lib/projects";
import type { ProjectStatus } from "@/lib/types/database";

export function CreateProjectDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>("draft");
  const [state, formAction] = useActionState(
    createProjectAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Project created");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <FolderPlus />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Group this client&apos;s files under a named piece of work. Draft
            projects stay hidden from the portal until you change the status.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="status" value={status} />
          <div className="space-y-2">
            <Label htmlFor="project-name">
              Name<span className="text-destructive"> *</span>
            </Label>
            <Input
              id="project-name"
              name="name"
              placeholder="Logo refresh"
              aria-invalid={Boolean(state.fieldErrors?.name)}
            />
            {state.fieldErrors?.name ? (
              <p className="text-destructive text-xs">
                {state.fieldErrors.name}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              name="description"
              rows={3}
              placeholder="What this project covers…"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-due">Due date</Label>
              <Input id="project-due" name="due_date" type="date" />
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
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <SubmitButton pendingText="Creating…">Create project</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
