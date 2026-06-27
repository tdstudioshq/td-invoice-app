"use client";

import { useId, useRef } from "react";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ECC_LEVELS,
  MAX_LOGO_DATA_URL_LENGTH,
  type QrErrorCorrection,
  type QrStyle,
} from "@/lib/qr/style";

const LOGO_MAX_DIMENSION = 256;

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

// Downscale to a bounded PNG data URL so style_json stays small.
async function toResizedLogo(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(
    1,
    LOGO_MAX_DIMENSION / Math.max(img.width, img.height),
  );
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} color`}
          className="size-9 shrink-0 cursor-pointer rounded-[6px] border border-glass-border bg-transparent"
        />
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className="font-mono uppercase"
        />
      </div>
    </div>
  );
}

/**
 * Controlled styling panel for a QR code: foreground/background colors,
 * error-correction level, and an optional embedded logo (auto-resized, with a
 * size cap). Shared by the generator and the detail page.
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
      if (logo.length > MAX_LOGO_DATA_URL_LENGTH) {
        toast.error("That logo is too large even after resizing. Try a simpler image.");
        return;
      }
      // A centered logo covers modules — nudge error correction up so it scans.
      const ecc: QrErrorCorrection = value.ecc === "L" || value.ecc === "M" ? "H" : value.ecc;
      onChange({ ...value, logo, ecc });
    } catch {
      toast.error("Couldn't read that image.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <ColorField
          label="Foreground"
          value={value.fg}
          onChange={(fg) => onChange({ ...value, fg })}
        />
        <ColorField
          label="Background"
          value={value.bg}
          onChange={(bg) => onChange({ ...value, bg })}
        />
      </div>

      <div className="space-y-2">
        <Label>Error correction</Label>
        <Select
          value={value.ecc}
          onValueChange={(ecc) =>
            onChange({ ...value, ecc: ecc as QrErrorCorrection })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ECC_LEVELS.map((level) => (
              <SelectItem key={level.value} value={level.value}>
                {level.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
    </div>
  );
}
