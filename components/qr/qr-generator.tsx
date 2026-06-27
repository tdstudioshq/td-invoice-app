"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, RotateCcw, Save } from "lucide-react";

import { saveQrCodeAction } from "@/app/actions/qr";
import { initialActionState } from "@/app/actions/types";
import { QrExportButtons } from "@/components/qr/qr-export-buttons";
import { QrPreview } from "@/components/qr/qr-preview";
import { QrStyleControls } from "@/components/qr/qr-style-controls";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { renderQrPng } from "@/lib/qr/render";
import { DEFAULT_QR_STYLE } from "@/lib/qr/style";
import { cn } from "@/lib/utils";

type Mode = "url" | "text";

const MAX_LENGTH = 2000;

/**
 * Resolves the raw input into the exact string that should be encoded.
 *
 * In URL mode a bare host (e.g. `example.com`) is upgraded to `https://` and the
 * result must parse as a URL with a dotted hostname — otherwise it's reported as
 * invalid. In text mode the input is encoded verbatim.
 */
function resolveContent(
  mode: Mode,
  raw: string,
): { value: string; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: "", error: null };
  if (trimmed.length > MAX_LENGTH) {
    return { value: "", error: `Keep content under ${MAX_LENGTH} characters.` };
  }

  if (mode === "text") return { value: trimmed, error: null };

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname.includes(".")) {
      return { value: "", error: "Enter a valid URL, e.g. https://example.com" };
    }
    return { value: candidate, error: null };
  } catch {
    return { value: "", error: "Enter a valid URL, e.g. https://example.com" };
  }
}

function deriveFileName(mode: Mode, content: string): string {
  if (mode === "url") {
    try {
      const host = new URL(content).hostname.replace(/^www\./, "");
      if (host) return host.replace(/[^a-z0-9.-]/gi, "-");
    } catch {
      /* fall through to default */
    }
  }
  return "qr-code";
}

/**
 * QR generator: type a URL or text, style it (colors, error correction, logo),
 * get a live high-resolution preview, export as PNG/SVG/PDF, or save a URL as a
 * dynamic code. Rendering runs entirely in the browser via `qrcode`.
 */
export function QrGenerator() {
  const [mode, setMode] = useState<Mode>("url");
  const [raw, setRaw] = useState("");
  const [name, setName] = useState("");
  const [style, setStyle] = useState(DEFAULT_QR_STYLE);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const generationId = useRef(0);
  const [saveState, saveAction, savePending] = useActionState(
    saveQrCodeAction,
    initialActionState,
  );

  const { value: content, error: validationError } = useMemo(
    () => resolveContent(mode, raw),
    [mode, raw],
  );

  // On a successful save, confirm and clear the name. The server action's
  // revalidatePath("/qr") refreshes the saved list below automatically; the
  // name reset is deferred so it doesn't run synchronously inside the effect.
  useEffect(() => {
    if (!saveState.success) return;
    toast.success("Saved. Your dynamic QR is ready below.");
    const timer = setTimeout(() => setName(""), 0);
    return () => clearTimeout(timer);
  }, [saveState]);

  useEffect(() => {
    const id = ++generationId.current;
    const timer = setTimeout(
      () => {
        // Nothing valid to encode → clear the preview.
        if (!content) {
          if (id === generationId.current) setDataUrl(null);
          return;
        }
        renderQrPng(content, style)
          .then((url) => {
            // Ignore results from superseded inputs.
            if (id === generationId.current) setDataUrl(url);
          })
          .catch(() => {
            if (id === generationId.current) setDataUrl(null);
          });
      },
      content ? 250 : 0,
    );

    return () => clearTimeout(timer);
  }, [content, style]);

  function reset() {
    setRaw("");
    setName("");
    setMode("url");
    setStyle(DEFAULT_QR_STYLE);
    setDataUrl(null);
  }

  const fileName = deriveFileName(mode, content);
  const showError = Boolean(raw.trim()) && Boolean(validationError);
  const canSave = mode === "url" && Boolean(content) && !validationError;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate a QR code</CardTitle>
        <CardDescription>
          Encode any link or text. The preview updates live and never leaves your
          browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2 md:gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Content type</Label>
            <div
              role="group"
              aria-label="Content type"
              className="grid grid-cols-2 gap-2"
            >
              {(["url", "text"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={mode === option ? "default" : "outline"}
                  onClick={() => setMode(option)}
                  aria-pressed={mode === option}
                  className="capitalize"
                >
                  {option === "url" ? "URL" : "Text"}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="qr-content">
              {mode === "url" ? "URL" : "Text"}
            </Label>
            <Textarea
              id="qr-content"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              placeholder={
                mode === "url"
                  ? "https://tdstudios.com"
                  : "Any text you want to encode…"
              }
              aria-invalid={showError}
              aria-describedby={showError ? "qr-error" : undefined}
              maxLength={MAX_LENGTH + 1}
              className="min-h-28"
            />
            {showError ? (
              <p
                id="qr-error"
                className="text-destructive flex items-center gap-1.5 text-xs"
              >
                <AlertCircle className="size-3.5 shrink-0" />
                {validationError}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {mode === "url"
                  ? "A scheme is added automatically if you omit it."
                  : "Plain text is encoded exactly as typed."}
              </p>
            )}
          </div>

          <div className="border-t border-glass-border pt-4">
            <QrStyleControls value={style} onChange={setStyle} />
          </div>

          <div className="flex flex-col gap-3 border-t border-glass-border pt-4">
            <Label>Export</Label>
            <div className="flex flex-wrap items-center gap-2">
              <QrExportButtons
                value={content}
                style={style}
                fileName={fileName}
                disabled={!dataUrl}
                caption={{ title: name.trim() || fileName, subtitle: content }}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={reset}
                disabled={!raw && !dataUrl}
              >
                <RotateCcw />
                Reset
              </Button>
            </div>
          </div>

          {canSave ? (
            <form
              action={saveAction}
              className="mt-auto flex flex-col gap-2 border-t border-glass-border pt-4"
            >
              <input type="hidden" name="destination" value={content} />
              <input type="hidden" name="style" value={JSON.stringify(style)} />
              <Label htmlFor="qr-name">Save as dynamic QR</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="qr-name"
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Name, e.g. Spring campaign"
                  maxLength={80}
                  aria-invalid={Boolean(saveState.fieldErrors?.name)}
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={savePending || !name.trim()}
                  className="w-full sm:w-auto"
                >
                  <Save />
                  {savePending ? "Saving…" : "Save"}
                </Button>
              </div>
              {saveState.fieldErrors?.name ? (
                <p className="text-destructive text-xs">
                  {saveState.fieldErrors.name}
                </p>
              ) : null}
              {saveState.fieldErrors?.destination ? (
                <p className="text-destructive text-xs">
                  {saveState.fieldErrors.destination}
                </p>
              ) : null}
              {saveState.error ? (
                <p className="text-destructive text-xs">{saveState.error}</p>
              ) : null}
              <p className="text-muted-foreground text-xs">
                Creates a short /q/… link that redirects here — reprint or
                repoint it anytime without changing the code.
              </p>
            </form>
          ) : null}
        </div>

        <div className={cn("flex items-start justify-center")}>
          <QrPreview
            dataUrl={dataUrl}
            background={style.bg}
            className="max-w-xs"
          />
        </div>
      </CardContent>
    </Card>
  );
}
