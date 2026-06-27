"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Save } from "lucide-react";

import { updateQrCodeAction } from "@/app/actions/qr";
import { initialActionState } from "@/app/actions/types";
import { QrExportButtons } from "@/components/qr/qr-export-buttons";
import { QrPreview } from "@/components/qr/qr-preview";
import { QrStyleControls } from "@/components/qr/qr-style-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renderQrPng } from "@/lib/qr/render";
import { parseQrStyle } from "@/lib/qr/style";
import type { QrCodeRecord } from "@/lib/types/database";

/**
 * The single interactive island on the QR detail page. Owns name / destination /
 * style state so the live preview, exports, and the save all reflect the same
 * (possibly unsaved) values. Saving persists everything through
 * updateQrCodeAction; the printed code (which encodes the stable short link) is
 * unaffected by destination edits.
 */
export function QrDetailEditor({
  code,
  shortUrl,
}: {
  code: QrCodeRecord;
  shortUrl: string;
}) {
  const [style, setStyle] = useState(() => parseQrStyle(code.style_json));
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(
    updateQrCodeAction.bind(null, code.id),
    initialActionState,
  );

  // Re-render the preview whenever the style changes (the encoded value — the
  // short link — is fixed for a saved code).
  useEffect(() => {
    let active = true;
    renderQrPng(shortUrl, style)
      .then((url) => {
        if (active) setPreview(url);
      })
      .catch(() => {
        if (active) setPreview(null);
      });
    return () => {
      active = false;
    };
  }, [shortUrl, style]);

  useEffect(() => {
    if (state.success) toast.success("QR code updated.");
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-8">
      <div className="space-y-4">
        <QrPreview dataUrl={preview} background={style.bg} className="max-w-xs" />

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Public link</span>
            <Badge variant={code.is_active ? "secondary" : "outline"}>
              {code.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <button
            type="button"
            onClick={copy}
            title="Copy public link"
            className="text-foreground hover:text-muted-foreground flex max-w-full items-center gap-1.5 text-sm transition-colors"
          >
            <span className="truncate">{shortUrl}</span>
            {copied ? (
              <Check className="size-3.5 shrink-0 text-emerald-400" />
            ) : (
              <Copy className="size-3.5 shrink-0" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={shortUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open
            </a>
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Export</Label>
          <QrExportButtons
            value={shortUrl}
            style={style}
            fileName={code.slug}
            size="sm"
            caption={{ title: code.name, subtitle: shortUrl }}
          />
        </div>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="style" value={JSON.stringify(style)} />

        <div className="space-y-2">
          <Label htmlFor="qr-edit-name">Name</Label>
          <Input
            id="qr-edit-name"
            name="name"
            defaultValue={code.name}
            maxLength={80}
            aria-invalid={Boolean(state.fieldErrors?.name)}
          />
          {state.fieldErrors?.name ? (
            <p className="text-destructive text-xs">{state.fieldErrors.name}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="qr-edit-destination">Destination URL</Label>
          <Input
            id="qr-edit-destination"
            name="destination"
            defaultValue={code.destination_url ?? ""}
            placeholder="https://example.com"
            aria-invalid={Boolean(state.fieldErrors?.destination)}
          />
          {state.fieldErrors?.destination ? (
            <p className="text-destructive text-xs">
              {state.fieldErrors.destination}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Repoint the code anywhere — the printed QR keeps working.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Style</Label>
          <QrStyleControls value={style} onChange={setStyle} />
        </div>

        {state.error ? (
          <p className="text-destructive text-xs">{state.error}</p>
        ) : null}

        <Button type="submit" disabled={pending}>
          <Save />
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </div>
  );
}
