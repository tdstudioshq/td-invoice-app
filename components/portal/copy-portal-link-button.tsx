"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Copies the portal sign-in link. The portal has no per-client URL — clients
 * sign in at /login and are routed to /portal by roleHome().
 */
export function CopyPortalLinkButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    // NEXT_PUBLIC_ vars are inlined at build time; fall back to the current
    // origin so the copied link is right on previews too.
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    await navigator.clipboard.writeText(`${base.replace(/\/$/, "")}/login`);
    setCopied(true);
    toast.success("Portal link copied");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? <Check /> : <Link2 />}
      Copy portal link
    </Button>
  );
}
