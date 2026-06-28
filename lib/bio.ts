// Shared constants and validation for the Bio Pages (link-in-bio) builder.
// Used by both the client builder UI and the server actions, so the rules stay
// in one place. The reserved-username list is mirrored as a CHECK constraint in
// supabase/migrations/0012_bio_pages.sql — keep the two in sync.

export const BIO_THEMES = ["minimal", "dark", "gradient", "glass"] as const;
export type BioTheme = (typeof BIO_THEMES)[number];

export const DEFAULT_BIO_THEME: BioTheme = "glass";
export const DEFAULT_ACCENT_COLOR = "#4F8CFF";
// Second accent, used as the gradient end (gradient theme + gradient buttons).
export const DEFAULT_ACCENT_COLOR_2 = "#9D5CFF";

// ---------------------------------------------------------------------------
// Extended style options (migration 0013). Each is a small, serializable enum so
// the builder, the server actions, and the public page all agree. New columns
// are nullable/defaulted, so a page created before 0013 still resolves to sane
// defaults via `resolveBioStyle` below — no DB round-trip needed to preview.
// ---------------------------------------------------------------------------

// Typography. Maps to font-family stacks in `bioFontFamily`.
export const BIO_FONTS = ["sans", "serif", "mono", "rounded"] as const;
export type BioFont = (typeof BIO_FONTS)[number];
export const DEFAULT_BIO_FONT: BioFont = "sans";

// How link buttons are filled.
export const BIO_BUTTON_STYLES = ["solid", "outline", "soft", "glass"] as const;
export type BioButtonStyle = (typeof BIO_BUTTON_STYLES)[number];
export const DEFAULT_BIO_BUTTON_STYLE: BioButtonStyle = "glass";

// Link button corner radius.
export const BIO_BUTTON_SHAPES = ["rounded", "pill", "square"] as const;
export type BioButtonShape = (typeof BIO_BUTTON_SHAPES)[number];
export const DEFAULT_BIO_BUTTON_SHAPE: BioButtonShape = "rounded";

// Vertical rhythm between elements / inside buttons.
export const BIO_SPACING = ["compact", "normal", "relaxed"] as const;
export type BioSpacing = (typeof BIO_SPACING)[number];
export const DEFAULT_BIO_SPACING: BioSpacing = "normal";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
// lowercase letters, numbers, hyphens, underscores only.
export const USERNAME_PATTERN = /^[a-z0-9_-]+$/;

// Avatar upload limits (public bio-page-assets bucket).
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
export const ALLOWED_AVATAR_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

// Route prefixes (and other sensitive words) that can never be a username.
// Mirrored in the DB CHECK constraint.
export const RESERVED_USERNAMES = new Set<string>([
  "admin",
  "dashboard",
  "login",
  "sign-up",
  "account",
  "portal",
  "qr",
  "invoices",
  "clients",
  "api",
  "u",
  "q",
  "settings",
  "leads",
  "onboarding",
  "reset-password",
  "link-builder",
  "qr-generator",
  "client-portals",
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Validate a (already-trimmed) username. Returns an error message, or null when
 * the value is valid. Callers normalize with `normalizeUsername` first.
 */
export function validateUsername(value: string): string | null {
  if (value.length < USERNAME_MIN_LENGTH) {
    return `Use at least ${USERNAME_MIN_LENGTH} characters`;
  }
  if (value.length > USERNAME_MAX_LENGTH) {
    return `Keep it under ${USERNAME_MAX_LENGTH} characters`;
  }
  if (!USERNAME_PATTERN.test(value)) {
    return "Only lowercase letters, numbers, hyphens, and underscores";
  }
  if (RESERVED_USERNAMES.has(value)) {
    return "That username is reserved — pick another";
  }
  return null;
}

export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export function coerceTheme(value: unknown): BioTheme {
  return BIO_THEMES.includes(value as BioTheme)
    ? (value as BioTheme)
    : DEFAULT_BIO_THEME;
}

export function coerceFont(value: unknown): BioFont {
  return BIO_FONTS.includes(value as BioFont)
    ? (value as BioFont)
    : DEFAULT_BIO_FONT;
}

export function coerceButtonStyle(value: unknown): BioButtonStyle {
  return BIO_BUTTON_STYLES.includes(value as BioButtonStyle)
    ? (value as BioButtonStyle)
    : DEFAULT_BIO_BUTTON_STYLE;
}

export function coerceButtonShape(value: unknown): BioButtonShape {
  return BIO_BUTTON_SHAPES.includes(value as BioButtonShape)
    ? (value as BioButtonShape)
    : DEFAULT_BIO_BUTTON_SHAPE;
}

export function coerceSpacing(value: unknown): BioSpacing {
  return BIO_SPACING.includes(value as BioSpacing)
    ? (value as BioSpacing)
    : DEFAULT_BIO_SPACING;
}

export function coerceAccent(value: unknown, fallback: string): string {
  return typeof value === "string" && isValidHexColor(value) ? value : fallback;
}

// The loose shape a possibly-incomplete bio row (or builder state) can take.
export interface BioStyleInput {
  theme?: string | null;
  accent_color?: string | null;
  accent_color_2?: string | null;
  font_family?: string | null;
  button_style?: string | null;
  button_shape?: string | null;
  spacing?: string | null;
}

// Fully-resolved, render-ready style — every field is valid and present.
export interface ResolvedBioStyle {
  theme: BioTheme;
  accent: string;
  accent2: string;
  font: BioFont;
  buttonStyle: BioButtonStyle;
  buttonShape: BioButtonShape;
  spacing: BioSpacing;
}

/**
 * Coerce any (partial, stale, or pre-0013) style input into a complete, valid
 * `ResolvedBioStyle`. This is the single source of truth for styling shared by
 * the builder's live preview and the public /u/<username> page, so the two can
 * never disagree — and it never touches the database.
 */
export function resolveBioStyle(input: BioStyleInput): ResolvedBioStyle {
  return {
    theme: coerceTheme(input.theme),
    accent: coerceAccent(input.accent_color, DEFAULT_ACCENT_COLOR),
    accent2: coerceAccent(input.accent_color_2, DEFAULT_ACCENT_COLOR_2),
    font: coerceFont(input.font_family),
    buttonStyle: coerceButtonStyle(input.button_style),
    buttonShape: coerceButtonShape(input.button_shape),
    spacing: coerceSpacing(input.spacing),
  };
}

// font-family stacks. `sans`/`mono` reuse the app's loaded font variables; the
// others fall back to robust system stacks.
export function bioFontFamily(font: BioFont): string {
  switch (font) {
    case "serif":
      return 'ui-serif, Georgia, Cambria, "Times New Roman", serif';
    case "mono":
      return 'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace';
    case "rounded":
      return '"SF Pro Rounded", ui-rounded, "Segoe UI", system-ui, sans-serif';
    case "sans":
    default:
      return "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";
  }
}
