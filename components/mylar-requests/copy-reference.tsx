"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Copy a MYL-XXXXXX reference to the clipboard.
 *
 * The reference is what a customer quotes back over the phone or in a text, so
 * it gets read aloud and pasted far more often than it gets looked at. This is
 * the whole reason it is a button and not just text.
 *
 * lucide icons to match the rest of the (app) group. Confirmation is inline on
 * the button rather than a toast: it is a two-second acknowledgement of a
 * trivial action, and a toast for it would be louder than the action itself.
 */
export function CopyReference({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A click landing right before unmount would otherwise set state on a gone
  // component, and a second click would leak the first timer.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused outside a secure context and in some
      // browser configurations. Nothing is broken — the reference is on screen
      // to select by hand — so this stays silent rather than raising an error
      // about a convenience.
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={copy}
      aria-label={`Copy reference ${reference}`}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : "Copy ref"}
    </Button>
  );
}
