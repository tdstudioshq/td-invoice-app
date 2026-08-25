"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getPortalContext, isAdminEmail } from "@/lib/auth";
import { getSiteUrl } from "@/lib/email/client";
import type { ActionState } from "@/app/actions/types";

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

// The two profile fields a customer must give us. `phone` and `instagram` are
// still on the table (and still filled in by anyone who onboarded before this
// form shrank) — they are simply no longer ASKED for, because neither is needed
// to approve someone or to run their portal. Every write below is a partial
// upsert, so existing values survive untouched.
const nameFields = {
  full_name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Keep the name under 120 characters"),
  business_name: z
    .string()
    .trim()
    .min(1, "Business name is required")
    .max(120, "Keep the business name under 120 characters"),
};

const signUpSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email"),
    password: z.string().min(8, "Use at least 8 characters"),
    confirm_password: z.string(),
    ...nameFields,
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

/**
 * Public customer self-signup — account and profile in ONE step. It creates a
 * Supabase Auth user and, when a session is issued immediately, that user's
 * profile row; it never grants any role (admin is an env allowlist, portal is a
 * `client_users` row an admin creates by approving them).
 *
 * With email confirmation ON, Supabase issues no session here, so there is no
 * authenticated identity to write a profile under. The name and business name
 * ride along in the auth user's metadata instead, and `/onboarding` prefills
 * itself from them after the confirmation round-trip — so the customer confirms
 * what they already typed rather than typing it twice.
 */
export async function signUpAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
    full_name: formData.get("full_name"),
    business_name: formData.get("business_name"),
  });
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Carried so the email-confirmation path can prefill the profile form.
      // User metadata is self-asserted and grants nothing — it is only ever
      // read back as a form default.
      data: {
        full_name: parsed.data.full_name,
        business_name: parsed.data.business_name,
      },
      // Point at the EXISTING PKCE callback, not at the destination itself.
      // Supabase appends `?code=` to this URL, and only /auth/callback
      // exchanges it for a session. `/account/pending` is not in the proxy's
      // PUBLIC_PATHS, so sending the confirmation link straight there means the
      // proxy sees no cookies yet, bounces to /login, and drops the code on the
      // way — the account is confirmed but the customer lands on a sign-in form
      // instead of their pending page. The callback already exchanges the code
      // and honors `redirect` for same-origin in-app paths.
      emailRedirectTo: `${getSiteUrl()}/auth/callback?redirect=${encodeURIComponent("/account/pending")}`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // A session is present only when email confirmation is disabled. Write the
  // profile now so the customer goes straight to "waiting for approval" and is
  // never shown a second form.
  if (data.session && data.user) {
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: data.user.id,
        email: parsed.data.email,
        full_name: parsed.data.full_name,
        business_name: parsed.data.business_name,
        onboarded_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    // A failed profile write leaves a usable account with no profile, which
    // `roleHome()` routes to /onboarding — recoverable, so don't fail signup.
    if (profileError) {
      console.error("signUpAction profile", profileError.message);
      revalidatePath("/", "layout");
      redirect("/onboarding");
    }
    revalidatePath("/", "layout");
    redirect("/account/pending");
  }
  return { success: true };
}

const profileSchema = z.object(nameFields);

// Only an actual customer (not admin, not portal) may write a profile. Defense
// in depth on top of the UI guards and RLS.
async function requireCustomerUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (isAdminEmail(user.email)) return null;
  if (await getPortalContext()) return null;
  return user;
}

/**
 * Finish a profile that signup could not write itself (the email-confirmation
 * path). Upserts the customer's name + business name, stamps `onboarded_at`,
 * and hands them to the pending screen. RLS scopes the write to their own row.
 */
export async function completeOnboardingAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = profileSchema.safeParse({
    full_name: formData.get("full_name"),
    business_name: formData.get("business_name"),
  });
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const user = await requireCustomerUser();
  if (!user) return { error: "You must be signed in as a customer." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: parsed.data.full_name,
      business_name: parsed.data.business_name,
      onboarded_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/account/pending");
}
