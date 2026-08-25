"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Link2, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { approvePortalAccessAction } from "@/app/actions/portal";
import { initialActionState } from "@/app/actions/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { PendingPortalSignup } from "@/lib/data";

function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} className="shrink-0">
      <UserCheck className="size-3.5" />
      {pending ? "Approving…" : "Approve"}
    </Button>
  );
}

function SignupRow({ signup }: { signup: PendingPortalSignup }) {
  const [state, formAction] = useActionState(
    approvePortalAccessAction,
    initialActionState,
  );

  const name = signup.fullName ?? signup.email ?? "This signup";

  // The row vanishes on success (the server revalidates it out of the list), so
  // the toast is the only confirmation there is room for. An ambiguous match
  // reports itself here too — the action refuses rather than guessing.
  useEffect(() => {
    if (state.success) toast.success(`${name} now has portal access`);
    else if (state.error) toast.error(state.error);
  }, [state, name]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <input type="hidden" name="user_id" value={signup.userId} />

      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{signup.fullName ?? "—"}</p>
          {signup.matchedClient ? (
            <Badge className="border-transparent bg-sky-500/15 text-sky-400">
              <Link2 className="size-3" />
              Existing client
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground truncate text-sm">
          {signup.email ?? "No email"}
        </p>
        <p className="text-muted-foreground text-xs">
          {signup.businessName ?? "No business name"} · signed up{" "}
          {formatDate(signup.signedUpAt)}
        </p>
        {signup.matchedClient ? (
          <p className="text-muted-foreground text-xs">
            Will link to {signup.matchedClient.company_name} and open their
            existing files.
          </p>
        ) : null}
      </div>

      <ApproveButton />
    </form>
  );
}

/**
 * Customers who signed up and are waiting on a portal. Approving is the only
 * action — everything else about a portal is managed from /client-portals once
 * it exists. The list is server-rendered and each row is its own form, so one
 * approval never blocks or resets another.
 */
export function PendingPortalAccess({
  signups,
}: {
  signups: PendingPortalSignup[];
}) {
  if (signups.length === 0) return null;

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="size-4" />
          Pending portal access
          <Badge className="border-transparent bg-amber-500/15 text-amber-400">
            {signups.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {signups.map((signup) => (
          <SignupRow key={signup.userId} signup={signup} />
        ))}
      </CardContent>
    </Card>
  );
}
