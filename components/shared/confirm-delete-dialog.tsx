"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

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
import { SubmitButton } from "@/components/shared/submit-button";

export function ConfirmDeleteDialog({
  action,
  id,
  title = "Delete this item?",
  description = "This action cannot be undone.",
  triggerLabel = "Delete",
  triggerVariant = "destructive",
  triggerSize = "sm",
  iconOnly = false,
}: {
  /** Server action that receives FormData containing the `id` field. */
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  title?: string;
  description?: string;
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant}
          size={iconOnly ? "icon-sm" : triggerSize}
          aria-label={triggerLabel}
        >
          <Trash2 />
          {iconOnly ? null : triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingText="Deleting…">
              {triggerLabel}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
