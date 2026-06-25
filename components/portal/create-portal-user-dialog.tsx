"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, UserPlus } from "lucide-react";

import { createPortalUserAction } from "@/app/actions/portal";
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

export function CreatePortalUserDialog({
  clientId,
  defaultEmail,
}: {
  clientId: string;
  defaultEmail?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, formAction] = useActionState(
    createPortalUserAction,
    initialActionState,
  );

  const credentials = state.success ? state.data : undefined;

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  function close() {
    setOpen(false);
    setCopied(false);
  }

  async function copyPassword() {
    if (!credentials?.password) return;
    await navigator.clipboard.writeText(credentials.password);
    setCopied(true);
    toast.success("Password copied");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Create portal login
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create portal login</DialogTitle>
          <DialogDescription>
            Give this client a secure login to view their files and invoices.
          </DialogDescription>
        </DialogHeader>

        {credentials && credentials.invited === "email" ? (
          <div className="space-y-4">
            <p className="text-sm">
              Invite sent to{" "}
              <span className="font-medium">{credentials.email}</span>. They&apos;ll
              receive an email with a link to set their password and sign in.
            </p>
            <DialogFooter>
              <Button type="button" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : credentials ? (
          <div className="space-y-4">
            <p className="text-sm">
              Account created for{" "}
              <span className="font-medium">{credentials.email}</span>. Share
              this one-time password securely — it won&apos;t be shown again.
            </p>
            <div className="bg-muted flex items-center justify-between gap-2 px-3 py-2">
              <code className="text-sm break-all">{credentials.password}</code>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={copyPassword}
                aria-label="Copy password"
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              The client can change it anytime via “Forgot password” on the login
              page.
            </p>
            <DialogFooter>
              <Button type="button" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="client_id" value={clientId} />
            <div className="space-y-2">
              <Label htmlFor="portal-email">
                Email<span className="text-destructive"> *</span>
              </Label>
              <Input
                id="portal-email"
                name="email"
                type="email"
                defaultValue={defaultEmail ?? ""}
                placeholder="client@example.com"
                aria-invalid={Boolean(state.fieldErrors?.email)}
              />
              {state.fieldErrors?.email ? (
                <p className="text-destructive text-xs">
                  {state.fieldErrors.email}
                </p>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="can_upload"
                className="border-input size-4 accent-foreground"
              />
              Allow this client to upload files
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <SubmitButton pendingText="Creating…">Create login</SubmitButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
