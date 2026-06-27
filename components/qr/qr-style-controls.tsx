"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  MAX_LOGO_DATA_URL_LENGTH,
  type QrErrorCorrection,
  type QrStyle,
} from "@/lib/qr/style";

const LOGO_MAX_DIMENSION = 240;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale + flatten an uploaded logo to a bounded data URL so style_json stays
 * small. The logo sits on a white knockout inside the QR, so we draw it onto a
 * white matte — that keeps transparency rendering correctly, lets us drop the
 * alpha channel, and makes the JPEG fallback artifact-free. We prefer a crisp
 * PNG, then step down JPEG quality until it fits the cap. Returns null only when
 * even an aggressively compressed version can't fit.
 */
async function toResizedLogo(file: File): Promise<string | null> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  // Some formats (notably SVG) report a 0 intrinsic size — fall back to square.
  const naturalW = img.naturalWidth || img.width || LOGO_MAX_DIMENSION;
  const naturalH = img.naturalHeight || img.height || LOGO_MAX_DIMENSION;
  const scale = Math.min(1, LOGO_MAX_DIMENSION / Math.max(naturalW, naturalH));
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const png = canvas.toDataURL("image/png");
  if (png.length <= MAX_LOGO_DATA_URL_LENGTH) return png;
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const jpg = canvas.toDataURL("image/jpeg", quality);
    if (jpg.length <= MAX_LOGO_DATA_URL_LENGTH) return jpg;
  }
  return null;
}

/**
 * Controlled styling panel for a QR code: an optional embedded logo
 * (auto-resized, with a size cap). Codes are always black on white, and error
 * correction is raised to High automatically when a logo is present so it still
 * scans. Shared by the generator and the detail page.
 */
export function QrStyleControls({
  value,
  onChange,
}: {
  value: QrStyle;
  onChange: (next: QrStyle) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  async function onLogoSelected(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file for the logo.");
      return;
    }
    try {
      const logo = await toResizedLogo(file);
      if (!logo) {
        toast.error(
          "That logo is too detailed to embed. Try a simpler image or one with fewer colors.",
        );
        return;
      }
      // A centered logo covers modules — nudge error correction up so it scans.
      const ecc: QrErrorCorrection = value.ecc === "L" || value.ecc === "M" ? "H" : value.ecc;
      onChange({ ...value, logo, ecc });
    } catch {
      toast.error("Couldn't read that image. Try a PNG or JPG.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label>Logo</Label>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => onLogoSelected(event.target.files?.[0])}
      />
      {value.logo ? (
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[6px] border border-glass-border bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.logo}
              alt="Logo preview"
              className="max-h-full max-w-full object-contain"
            />
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInput.current?.click()}
          >
            Replace
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => onChange({ ...value, logo: null })}
          >
            <X />
            Remove
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus />
          Add logo
        </Button>
      )}
      <p className="text-muted-foreground text-xs">
        Centered logo. Error correction is raised automatically so the code
        still scans.
      </p>
    </div>
  );
}
