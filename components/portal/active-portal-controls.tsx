"use client";

import { useState } from "react";
import { ShieldOff } from "lucide-react";

import {
  revokePortalAccessAction,
  setCanUploadAction,
} from "@/app/actions/portal";
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

export function ActivePortalControls({
  clientId,
  canUpload,
}: {
  clientId: string;
  canUpload: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Toggle uploads by posting the opposite value. */}
      <form action={setCanUploadAction}>
        <input type="hidden" name="client_id" value={clientId} />
        <input
          type="hidden"
          name="can_upload"
          value={canUpload ? "false" : "true"}
        />
        <SubmitButton variant="outline" size="sm" pendingText="Saving…">
          {canUpload ? "Disable uploads" : "Enable uploads"}
        </SubmitButton>
      </form>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm">
            <ShieldOff />
            Revoke access
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke portal access?</DialogTitle>
            <DialogDescription>
              This permanently deletes the client&apos;s login. Their files and
              invoices remain in your workspace. You can create a new login
              later.
            </DialogDescription>
          </DialogHeader>
          <form action={revokePortalAccessAction}>
            <input type="hidden" name="client_id" value={clientId} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <SubmitButton variant="destructive" pendingText="Revoking…">
                Revoke access
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
