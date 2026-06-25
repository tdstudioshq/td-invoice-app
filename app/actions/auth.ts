"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/auth";
import type { ActionState } from "@/app/actions/types";

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

// Only allow same-origin, in-app redirect targets to avoid open-redirects.
function safeRedirect(target: unknown): string {
  const value = typeof target === "string" ? target : "";
  if (value.startsWith("/") && !value.startsWith("//") && value !== "/login") {
    return value;
  }
  return "/dashboard";
}

export async function signInAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Keep the message generic — don't reveal whether the email exists.
    return { error: "Invalid email or password." };
  }

  revalidatePath("/", "layout");
  // Route by role: client-portal users land in their portal, admins in the app.
  const portal = await getPortalContext();
  redirect(portal ? "/portal" : safeRedirect(formData.get("redirect")));
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/login");
}
