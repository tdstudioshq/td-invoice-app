"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Download control for a generated QR code. Ships a single PNG export driven by
 * the high-resolution data URL produced by the generator/list; SVG/PDF exports
 * are planned for a later phase.
 */
export function QrDownloadButtons({
  dataUrl,
  fileName = "qr-code",
  size = "default",
  label = "Download PNG",
  className,
}: {
  dataUrl: string | null;
  fileName?: string;
  size?: "default" | "sm";
  label?: string;
  className?: string;
}) {
  function downloadPng() {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${fileName}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={downloadPng}
      disabled={!dataUrl}
      className={className}
    >
      <Download />
      {label}
    </Button>
  );
}
