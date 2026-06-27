// Shared QR styling model, persisted per code in qr_codes.style_json.
//
// Kept deliberately small and serializable: two colors, an error-correction
// level, and an optional embedded logo (a bounded base64 data URL — there's no
// separate asset storage, matching the project's "no new infra" approach).

export type QrErrorCorrection = "L" | "M" | "Q" | "H";

export interface QrStyle {
  /** Foreground / module color. */
  fg: string;
  /** Background color. */
  bg: string;
  /** Error-correction level. Use Q/H when embedding a logo. */
  ecc: QrErrorCorrection;
  /** Centered logo as a base64 image data URL, or null. */
  logo: string | null;
}

export const ECC_LEVELS: { value: QrErrorCorrection; label: string }[] = [
  { value: "L", label: "Low · 7%" },
  { value: "M", label: "Medium · 15%" },
  { value: "Q", label: "Quartile · 25%" },
  { value: "H", label: "High · 30%" },
];

export const DEFAULT_QR_STYLE: QrStyle = {
  fg: "#000000",
  bg: "#ffffff",
  ecc: "M",
  logo: null,
};

// Cap an embedded logo so style_json rows stay small (the upload UI also resizes
// before this point). ~180 KB of base64 ≈ a ~130 KB image.
export const MAX_LOGO_DATA_URL_LENGTH = 180_000;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function isEcc(value: unknown): value is QrErrorCorrection {
  return value === "L" || value === "M" || value === "Q" || value === "H";
}

/**
 * Coerce arbitrary stored/submitted JSON into a valid QrStyle, falling back to
 * defaults for any missing or malformed field. Logos must be image data URLs and
 * within the size cap, else they're dropped.
 */
export function parseQrStyle(input: unknown): QrStyle {
  const obj =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};

  const fg =
    typeof obj.fg === "string" && HEX.test(obj.fg) ? obj.fg : DEFAULT_QR_STYLE.fg;
  const bg =
    typeof obj.bg === "string" && HEX.test(obj.bg) ? obj.bg : DEFAULT_QR_STYLE.bg;
  const ecc = isEcc(obj.ecc) ? obj.ecc : DEFAULT_QR_STYLE.ecc;
  const logo =
    typeof obj.logo === "string" &&
    obj.logo.startsWith("data:image/") &&
    obj.logo.length <= MAX_LOGO_DATA_URL_LENGTH
      ? obj.logo
      : null;

  return { fg, bg, ecc, logo };
}
