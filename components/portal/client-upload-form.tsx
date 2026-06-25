"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";

import { uploadOwnFileAction } from "@/app/actions/portal-client";
import { initialActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Upload control shown to a client portal user. Only rendered when the admin has
 * enabled uploads; the server action re-checks the permission regardless.
 */
export function ClientUploadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    uploadOwnFileAction,
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
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="client-file">Upload a file</Label>
        <Input id="client-file" name="file" type="file" required />
        {state.fieldErrors?.file ? (
          <p className="text-destructive text-xs">{state.fieldErrors.file}</p>
        ) : null}
      </div>
      <SubmitButton pendingText="Uploading…">
        <Upload />
        Upload
      </SubmitButton>
    </form>
  );
}
