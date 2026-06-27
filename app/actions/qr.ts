"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { DEFAULT_QR_STYLE, parseQrStyle } from "@/lib/qr/style";
import type { ActionState } from "@/app/actions/types";
import type { Json } from "@/lib/types/database";

// Parse the JSON `style` field from a form into a validated, size-capped style,
// cast to the column's Json type (a QrStyle is a flat string/null object).
function readStyle(formData: FormData): Json {
  const raw = formData.get("style");
  const style =
    typeof raw === "string" && raw
      ? (() => {
          try {
            return parseQrStyle(JSON.parse(raw));
          } catch {
            return DEFAULT_QR_STYLE;
          }
        })()
      : DEFAULT_QR_STYLE;
  return style as unknown as Json;
}

const saveSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Keep the name under 80 characters"),
  destination: z.string().trim().min(1, "Destination URL is required"),
});

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

// Upgrades a bare host to https:// and requires a dotted hostname, returning the
// absolute URL or null when it can't be parsed as a real URL.
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "qr";
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/**
 * Record a QR generation in the history log. Called fire-and-forget from the
 * generator (admin and public) each time a new distinct code is produced. Routes
 * through the SECURITY DEFINER `log_qr_generation` RPC so anonymous public-page
 * visitors can log without any table grant; owner_id is stamped from their JWT
 * (null when anonymous). Never throws into the UI — failures are swallowed.
 */
export async function logQrGenerationAction(input: {
  content: string;
  type?: "url" | "instagram" | "text";
  source?: "public" | "admin";
  style?: unknown;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const content =
    typeof input.content === "string" ? input.content.trim() : "";
  if (!content) return;

  // Store a compact style summary, not the raw style — the embedded logo can be
  // a ~220 KB data URL, far too heavy to keep per generation. Colors, error
  // correction, and a has-logo flag are enough for the history view.
  const style = parseQrStyle(input.style);
  const styleSummary = {
    fg: style.fg,
    bg: style.bg,
    ecc: style.ecc,
    has_logo: Boolean(style.logo),
  };

  try {
    const supabase = await createClient();
    await supabase.rpc("log_qr_generation", {
      p_content: content.slice(0, 2000),
      p_type: input.type ?? "url",
      p_source: input.source ?? "public",
      p_style: styleSummary as unknown as Json,
    });
  } catch {
    /* logging is best-effort; never block generation on it */
  }
}

/**
 * Save a destination URL as a dynamic QR code. Creates an owner-scoped row with
 * a clean, globally-unique slug derived from the name; the printed QR encodes
 * the resulting /q/<slug> short link so the destination can be repointed later.
 */
export async function saveQrCodeAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = saveSchema.safeParse({
    name: formData.get("name"),
    destination: formData.get("destination"),
  });
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  const destination = normalizeUrl(parsed.data.destination);
  if (!destination) {
    return {
      fieldErrors: { destination: "Enter a valid URL, e.g. https://example.com" },
    };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const style = readStyle(formData);
  const base = slugify(parsed.data.name);

  // Slug is globally unique. Under RLS we can't see other owners' rows, so we
  // can't pre-check — instead try the clean slug first and retry with a short
  // random suffix on a unique-violation (23505).
  let lastError = "Could not save QR code. Try again.";
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    const { data, error } = await supabase
      .from("qr_codes")
      .insert({
        owner_id: user.id,
        name: parsed.data.name,
        slug,
        type: "url",
        destination_url: destination,
        raw_value: destination,
        style_json: style,
        is_dynamic: true,
        is_active: true,
      })
      .select("id, slug")
      .single();

    if (!error && data) {
      revalidatePath("/qr");
      return { success: true, data: { id: data.id, slug: data.slug } };
    }
    if (error?.code === "23505") {
      lastError = "That name is already taken — try a different one.";
      continue;
    }
    return { error: error?.message ?? lastError };
  }
  return { error: lastError };
}

const updateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Keep the name under 80 characters"),
  destination: z.string().trim().min(1, "Destination URL is required"),
});

/**
 * Update a dynamic QR code's name and/or destination. The printed code is
 * unchanged (it encodes the stable /q/<slug> link) — only where it redirects
 * changes. RLS scopes the update to the caller's own rows.
 */
export async function updateQrCodeAction(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    name: formData.get("name"),
    destination: formData.get("destination"),
  });
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  const destination = normalizeUrl(parsed.data.destination);
  if (!destination) {
    return {
      fieldErrors: { destination: "Enter a valid URL, e.g. https://example.com" },
    };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("qr_codes")
    .update({
      name: parsed.data.name,
      destination_url: destination,
      raw_value: destination,
      style_json: readStyle(formData),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/qr");
  revalidatePath(`/qr/${id}`);
  return { success: true };
}

/**
 * Toggle a saved QR code's active state. An inactive code's short link stops
 * resolving (the public route 404s) without deleting the record. RLS scopes the
 * update to the caller's own rows.
 */
export async function toggleQrCodeAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const currentlyActive = String(formData.get("is_active") ?? "") === "true";
  if (!id || !isSupabaseConfigured()) return;

  const supabase = await createClient();
  await supabase
    .from("qr_codes")
    .update({ is_active: !currentlyActive })
    .eq("id", id);

  revalidatePath("/qr");
}

/**
 * Delete a saved QR code. RLS scopes the delete to the caller's own rows; the
 * short link stops resolving immediately.
 */
export async function deleteQrCodeAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isSupabaseConfigured()) return;

  const supabase = await createClient();
  await supabase.from("qr_codes").delete().eq("id", id);

  revalidatePath("/qr");
}
