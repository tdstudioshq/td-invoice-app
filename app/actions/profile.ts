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

const signUpSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email"),
    password: z.string().min(8, "Use at least 8 characters"),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

/**
 * Public customer self-signup. Creates a Supabase Auth user only — it never
 * grants any role (admin is an env allowlist, portal is a client_users row).
 * With email confirmation on, returns a "check your email" success state; if a
 * session is issued immediately, sends the new customer to onboarding.
 */
export async function signUpAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
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
    options: { emailRedirectTo: `${getSiteUrl()}/onboarding` },
  });

  if (error) {
    return { error: error.message };
  }

  // A session is present only when email confirmation is disabled — route the
  // new customer straight into onboarding. Otherwise prompt them to confirm.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/onboarding");
  }
  return { success: true };
}

const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Keep the name under 120 characters"),
  phone: z.string().trim().min(1, "Phone number is required"),
  instagram: z.string().trim().min(1, "Instagram username is required"),
  business_name: z.string().trim().min(1, "Business name is required"),
});

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
 * Complete onboarding: upsert the customer's profile and stamp `onboarded_at`,
 * then send them to their account. RLS scopes the write to their own row.
 */
export async function completeOnboardingAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = profileSchema.safeParse({
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
    instagram: formData.get("instagram"),
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
      phone: parsed.data.phone,
      instagram: parsed.data.instagram,
      business_name: parsed.data.business_name,
      onboarded_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/account");
}

/**
 * Update an existing customer profile (account settings). Leaves `onboarded_at`
 * untouched. RLS scopes the update to the caller's own row.
 */
export async function updateProfileAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = profileSchema.safeParse({
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
    instagram: formData.get("instagram"),
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
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone,
      instagram: parsed.data.instagram,
      business_name: parsed.data.business_name,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/account");
  return { success: true };
}
