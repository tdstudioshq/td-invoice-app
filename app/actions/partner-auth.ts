"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPartnerContext, isAdminEmail } from "@/lib/auth";
import { getSiteUrl } from "@/lib/email/client";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ActionState } from "@/app/actions/types";

/**
 * Sign-in for a print-partner portal.
 *
 * Kept apart from `signInAction` (app/actions/auth.ts) rather than folded into
 * it, for two reasons:
 *   * the public sign-in is load-bearing for three existing roles and this must
 *     not be able to change its behavior; and
 *   * a partner portal is addressed by its own hostname, so the destination has
 *     to be a path RELATIVE TO THAT HOST — the shared action always resolves a
 *     role home in internal terms, which would drag `/partner/<slug>` into a
 *     subdomain visitor's address bar.
 *
 * This grants nothing on its own: it authenticates, then reads the membership
 * back through `getPartnerContext()` (itself RLS-scoped). A password alone has
 * never been access to a partner portal — the `partner_users` row is.
 */

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  slug: z.string().min(1).max(40),
  redirect: z.string().max(500).optional(),
});

/** Only same-origin, in-app targets, so this can never become an open redirect. */
function safePartnerRedirect(target: unknown, fallback: string): string {
  const value = typeof target === "string" ? target : "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return fallback;
}

export async function signInPartnerAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    slug: formData.get("slug"),
    redirect: formData.get("redirect"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const { email, password, slug } = parsed.data;
  // The form renders this with the right prefix for however the portal was
  // reached — "" on the subdomain, "/zaza-orders" via the alias.
  const base = formData.get("basePath");
  const fallback = `${typeof base === "string" && base.startsWith("/") ? base : ""}/jobs`;
  const target = safePartnerRedirect(parsed.data.redirect, fallback);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Generic on purpose — never reveal whether the address has an account.
    return { error: "Invalid email or password." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Invalid email or password." };

  const partner = await getPartnerContext();
  revalidatePath("/", "layout");

  if (partner && partner.companySlug === slug) {
    redirect(target);
  }

  // A TD Studios admin belongs on the admin list, which lives on the main site
  // — an absolute URL because this portal is usually on another hostname.
  if (isAdminEmail(user.email)) {
    redirect(`${getSiteUrl()}/partner-jobs`);
  }

  // Authenticated, but not a rep of THIS company: a customer, a client-portal
  // user, a deactivated rep, or a rep of a different partner. Ending the
  // session is the right outcome — they signed in at a door that isn't theirs,
  // and leaving them holding one would only produce a confusing half-state.
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  return {
    error:
      "That account doesn't have access to this portal. Ask TD Studios to set it up.",
  };
}
