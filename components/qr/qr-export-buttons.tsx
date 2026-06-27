"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { renderQrPdf } from "@/lib/qr/pdf";
import { renderQrPng, renderQrSvg } from "@/lib/qr/render";
import type { QrStyle } from "@/lib/qr/style";

type Format = "png" | "svg" | "pdf";

function download(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Re-renders the QR from its value + style on demand and exports it as PNG, SVG,
 * or PDF. Rendering at click time (not from a cached preview) keeps every format
 * faithful to the current style, including an embedded logo.
 */
export function QrExportButtons({
  value,
  style,
  fileName = "qr-code",
  caption,
  size = "default",
  disabled,
}: {
  value: string;
  style: QrStyle;
  fileName?: string;
  caption?: { title: string; subtitle?: string };
  size?: "default" | "sm";
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<Format | null>(null);
  const ready = Boolean(value) && !disabled;

  async function run(format: Format) {
    if (!ready) return;
    setBusy(format);
    try {
      if (format === "png") {
        download(await renderQrPng(value, style), `${fileName}.png`);
      } else if (format === "svg") {
        const blob = new Blob([await renderQrSvg(value, style)], {
          type: "image/svg+xml",
        });
        const url = URL.createObjectURL(blob);
        download(url, `${fileName}.svg`);
        URL.revokeObjectURL(url);
      } else {
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
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(["png", "svg", "pdf"] as const).map((format, index) => (
        <Button
          key={format}
          type="button"
          variant="outline"
          size={size}
          onClick={() => run(format)}
          disabled={!ready || busy !== null}
        >
          {index === 0 ? <Download /> : null}
          {busy === format ? "…" : format.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
