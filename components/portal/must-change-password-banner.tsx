import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Non-dismissable prompt shown on every portal page while the signed-in portal
 * user still has must_change_password set (i.e. they're on a provisioned temp
 * password). Rendered by the (portal) layout; disappears once
 * clear_must_change_password() runs after a successful password change.
 */
export function MustChangePasswordBanner() {
  return (
    <div className="mb-6 flex flex-col gap-3 border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Set a new password</p>
          <p className="text-muted-foreground text-sm">
            You&apos;re signed in with a temporary password. For security,
            please choose your own before continuing.
          </p>
        </div>
      </div>
      <Button asChild size="sm" className="sm:shrink-0">
        <Link href="/portal/account">Change password</Link>
      </Button>
    </div>
  );
}
