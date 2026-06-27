// Shared constants and validation for the Bio Pages (link-in-bio) builder.
// Used by both the client builder UI and the server actions, so the rules stay
// in one place. The reserved-username list is mirrored as a CHECK constraint in
// supabase/migrations/0012_bio_pages.sql — keep the two in sync.

export const BIO_THEMES = ["minimal", "dark", "gradient", "glass"] as const;
export type BioTheme = (typeof BIO_THEMES)[number];

export const DEFAULT_BIO_THEME: BioTheme = "glass";
export const DEFAULT_ACCENT_COLOR = "#4F8CFF";

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
