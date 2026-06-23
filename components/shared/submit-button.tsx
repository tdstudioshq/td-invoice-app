"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type ButtonProps = React.ComponentProps<typeof Button>;

/** Submit button that shows a spinner while the parent form's action runs. */
export function SubmitButton({
  children,
  pendingText,
  ...props
}: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}
