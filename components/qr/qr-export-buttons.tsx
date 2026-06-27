"use client";

import { useEffect, useState } from "react";
import { Download, ImageDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { renderQrPdf } from "@/lib/qr/pdf";
import { renderQrPng } from "@/lib/qr/render";
import type { QrStyle } from "@/lib/qr/style";

function download(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function pngFile(
  value: string,
  style: QrStyle,
  fileName: string,
): Promise<File> {
  const dataUrl = await renderQrPng(value, style);
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], `${fileName}.png`, { type: "image/png" });
}

/**
 * Re-renders the QR from its value + style on demand and saves it. The default,
 * primary action saves the QR as a PNG to the device: on phones that support the
 * Web Share API with files (iOS Safari, Android Chrome) it opens the native
 * share sheet — the only web path to the camera roll — and on desktop it falls
 * back to a PNG download. Rendering at click time (not from a cached preview)
 * keeps the output faithful to the current style, including an embedded logo.
 *
 * `showPdf` adds a secondary PDF export (used by the admin detail page); the
 * public/generator surface leaves it off so the only option is "save to phone".
 */
export function QrExportButtons({
  value,
  style,
  fileName = "qr-code",
  caption,
  size = "default",
  disabled,
  showPdf = false,
}: {
  value: string;
  style: QrStyle;
  fileName?: string;
  caption?: { title: string; subtitle?: string };
  size?: "default" | "sm";
  disabled?: boolean;
  showPdf?: boolean;
}) {
  const [busy, setBusy] = useState<"save" | "pdf" | null>(null);
  const [canShare, setCanShare] = useState(false);
  const ready = Boolean(value) && !disabled;

  // Feature-detect file sharing after mount (deferred so it doesn't set state
  // synchronously in the effect body, and so SSR/first paint stay consistent).
  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      typeof navigator.share === "function";
    const timer = setTimeout(() => setCanShare(supported), 0);
    return () => clearTimeout(timer);
  }, []);

  // Primary action: save the QR as a PNG — share sheet on mobile, download on
  // desktop.
  async function savePng() {
    if (!ready) return;
    setBusy("save");
    try {
      const file = await pngFile(value, style, fileName);
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: caption?.title ?? fileName,
          });
          return;
        } catch (error) {
          // The user dismissed the share sheet — don't fall back to a download.
          if ((error as Error)?.name === "AbortError") return;
        }
      }
      // Unsupported, or share failed for another reason: download instead.
      download(URL.createObjectURL(file), `${fileName}.png`);
    } finally {
      setBusy(null);
    }
  }

  async function savePdf() {
    if (!ready) return;
    setBusy("pdf");
    try {
      const png = await renderQrPng(value, style);
      const bytes = await renderQrPdf(png, {
        title: caption?.title ?? fileName,
        subtitle: caption?.subtitle,
      });
      const blob = new Blob([bytes as unknown as BlobPart], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      download(url, `${fileName}.pdf`);
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size={size}
        onClick={savePng}
        disabled={!ready || busy !== null}
      >
        {canShare ? <ImageDown /> : <Download />}
        {busy === "save"
          ? "Saving…"
          : canShare
            ? "Save to Photos"
            : "Save PNG"}
      </Button>
      {showPdf ? (
        <Button
          type="button"
          variant="outline"
          size={size}
          onClick={savePdf}
          disabled={!ready || busy !== null}
        >
          {busy === "pdf" ? "…" : "PDF"}
        </Button>
      ) : null}
    </div>
  );
}
