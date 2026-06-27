"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  ALLOWED_AVATAR_TYPES,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_BIO_THEME,
  MAX_AVATAR_BYTES,
  coerceTheme,
  isValidHexColor,
  normalizeUsername,
  validateUsername,
} from "@/lib/bio";
import type { ActionState } from "@/app/actions/types";

const BIO_ASSETS_BUCKET = "bio-page-assets";

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

// Upgrades a bare host to https:// and requires a dotted hostname, returning the
// absolute URL or null when it can't be parsed. Mirrors app/actions/qr.ts.
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

// Resolve the signed-in user, or null. Bio pages are available to any
// authenticated user (admin or customer); RLS scopes every write to them.
async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// The signed-in user's bio page id (newest), or null when they have none.
async function getOwnPageId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bio_pages")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

const createSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  display_name: z
    .string()
    .trim()
    .max(80, "Keep it under 80 characters")
    .optional(),
});

/**
 * Step 2 — create the user's bio page with a unique username. Unpublished by
 * default. The username uniqueness is enforced by the DB; a 23505 surfaces as a
 * field error. RLS scopes the insert to the caller (owner_id defaults to them).
 */
export async function createBioPageAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    username: formData.get("username"),
    display_name: formData.get("display_name") || undefined,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const username = normalizeUsername(parsed.data.username);
  const usernameError = validateUsername(username);
  if (usernameError) return { fieldErrors: { username: usernameError } };

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };

  // One page per user in the MVP — point them at their existing one.
  if (await getOwnPageId()) {
    revalidatePath("/link-builder");
    return { success: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("bio_pages").insert({
    owner_id: user.id,
    username,
    display_name: parsed.data.display_name ?? null,
    theme: DEFAULT_BIO_THEME,
    accent_color: DEFAULT_ACCENT_COLOR,
  });

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { username: "That username is taken" } };
    }
    if (error.code === "23514") {
      return { fieldErrors: { username: "That username isn't allowed" } };
    }
    return { error: error.message };
  }

  revalidatePath("/link-builder");
  revalidatePath(`/u/${username}`);
  return { success: true };
}

const profileSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  display_name: z.string().trim().max(80, "Keep it under 80 characters"),
  bio: z.string().trim().max(280, "Keep your bio under 280 characters"),
  theme: z.string().trim(),
  accent_color: z.string().trim(),
});

/**
 * Step 3 — update profile fields (and optionally the username) of the user's
 * existing page. RLS scopes the update to their own row.
 */
export async function updateBioProfileAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = profileSchema.safeParse({
    username: formData.get("username"),
    display_name: formData.get("display_name") ?? "",
    bio: formData.get("bio") ?? "",
    theme: formData.get("theme") ?? DEFAULT_BIO_THEME,
    accent_color: formData.get("accent_color") ?? DEFAULT_ACCENT_COLOR,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const username = normalizeUsername(parsed.data.username);
  const usernameError = validateUsername(username);
  if (usernameError) return { fieldErrors: { username: usernameError } };

  const accent = isValidHexColor(parsed.data.accent_color)
    ? parsed.data.accent_color
    : DEFAULT_ACCENT_COLOR;

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }
  const pageId = await getOwnPageId();
  if (!pageId) return { error: "Create your page first." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bio_pages")
    .update({
      username,
      display_name: parsed.data.display_name || null,
      bio: parsed.data.bio || null,
      theme: coerceTheme(parsed.data.theme),
      accent_color: accent,
    })
    .eq("id", pageId);

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { username: "That username is taken" } };
    }
    if (error.code === "23514") {
      return { fieldErrors: { username: "That username isn't allowed" } };
    }
    return { error: error.message };
  }

  revalidatePath("/link-builder");
  revalidatePath(`/u/${username}`);
  return { success: true };
}

/**
 * Upload a profile avatar into the public bio-page-assets bucket under the
 * user's own {uid}/avatar/ prefix (enforced by Storage RLS), then record the
 * object key on the page. Validates type and size. Best-effort removes the old
 * object so avatars don't accumulate.
 */
export async function uploadBioAvatarAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { avatar: "Choose an image to upload" } };
  }
  if (!ALLOWED_AVATAR_TYPES.includes(file.type as never)) {
    return { fieldErrors: { avatar: "Use a PNG, JPG, or WebP image" } };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { fieldErrors: { avatar: "Image must be under 2 MB" } };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };

  const supabase = await createClient();
  const { data: page } = await supabase
    .from("bio_pages")
    .select("id, username, avatar_path")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!page) return { error: "Create your page first." };

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `${user.id}/avatar/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BIO_ASSETS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return { error: uploadError.message };

  const { error: updateError } = await supabase
    .from("bio_pages")
    .update({ avatar_path: path })
    .eq("id", page.id);
  if (updateError) return { error: updateError.message };

  // Best-effort: drop the previous object now that the new key is saved.
  if (page.avatar_path && page.avatar_path !== path) {
    await supabase.storage.from(BIO_ASSETS_BUCKET).remove([page.avatar_path]);
  }

  revalidatePath("/link-builder");
  revalidatePath(`/u/${page.username}`);
  return { success: true };
}

const linkSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(80, "Keep the title under 80 characters"),
  url: z.string().trim().min(1, "URL is required"),
  icon: z.string().trim().max(40).optional(),
});

/** Step 4 — add a link to the user's page (appended to the end). */
export async function addBioLinkAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = linkSchema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
    icon: formData.get("icon") || undefined,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const url = normalizeUrl(parsed.data.url);
  if (!url) {
    return {
      fieldErrors: { url: "Enter a valid URL, e.g. https://example.com" },
    };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in." };
  const pageId = await getOwnPageId();
  if (!pageId) return { error: "Create your page first." };

  const supabase = await createClient();
  // Append after the current last link.
  const { data: last } = await supabase
    .from("bio_links")
    .select("sort_order")
    .eq("bio_page_id", pageId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("bio_links").insert({
    owner_id: user.id,
    bio_page_id: pageId,
    title: parsed.data.title,
    url,
    icon: parsed.data.icon ?? null,
    sort_order: nextOrder,
  });
  if (error) return { error: error.message };

  revalidatePath("/link-builder");
  return { success: true };
}

/** Edit a link's title / URL / icon. RLS scopes the update to the owner. */
export async function updateBioLinkAction(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = linkSchema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
    icon: formData.get("icon") || undefined,
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const url = normalizeUrl(parsed.data.url);
  if (!url) {
    return {
      fieldErrors: { url: "Enter a valid URL, e.g. https://example.com" },
    };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bio_links")
    .update({
      title: parsed.data.title,
      url,
      icon: parsed.data.icon ?? null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/link-builder");
  return { success: true };
}

/** Delete a link. RLS scopes the delete to the owner's rows. */
export async function deleteBioLinkAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isSupabaseConfigured()) return;

  const supabase = await createClient();
  await supabase.from("bio_links").delete().eq("id", id);
  revalidatePath("/link-builder");
}

/** Toggle a link's public visibility without deleting it. */
export async function toggleBioLinkVisibilityAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const visible = String(formData.get("is_visible") ?? "") === "true";
  if (!id || !isSupabaseConfigured()) return;

  const supabase = await createClient();
  await supabase
    .from("bio_links")
    .update({ is_visible: !visible })
    .eq("id", id);
  revalidatePath("/link-builder");
}

/**
 * Reorder a link by swapping sort_order with its neighbor in the given
 * direction (MVP move up/down). RLS scopes both updates to the owner's rows.
 */
export async function moveBioLinkAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!id || (direction !== "up" && direction !== "down")) return;
  if (!isSupabaseConfigured()) return;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("bio_links")
    .select("id, bio_page_id, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (!current) return;

  const ascending = direction === "down";
  const { data: neighbor } = await supabase
    .from("bio_links")
    .select("id, sort_order")
    .eq("bio_page_id", current.bio_page_id)
    .filter("sort_order", ascending ? "gt" : "lt", current.sort_order)
    .order("sort_order", { ascending })
    .limit(1)
    .maybeSingle();
  if (!neighbor) return;

  // Swap the two sort_order values.
  await supabase
    .from("bio_links")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", current.id);
  await supabase
    .from("bio_links")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbor.id);

  revalidatePath("/link-builder");
}

/** Step 5 — publish or unpublish the user's page. */
export async function toggleBioPublishAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const published = String(formData.get("is_published") ?? "") === "true";
  const username = String(formData.get("username") ?? "");
  if (!id || !isSupabaseConfigured()) return;

  const supabase = await createClient();
  await supabase
    .from("bio_pages")
    .update({ is_published: !published })
    .eq("id", id);

  revalidatePath("/link-builder");
  if (username) revalidatePath(`/u/${username}`);
}
