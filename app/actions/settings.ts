"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ActionState } from "@/app/actions/types";

const settingsSchema = z.object({
  company_name: z.string().trim().min(1, "Company name is required"),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
  tax_rate: z.coerce.number().min(0, "Must be 0 or more").max(100, "Too high"),
  payment_instructions: z.string().trim().optional().or(z.literal("")),
});

function nullify(value: string | null | undefined) {
  const trimmed = (value ?? "").toString().trim();
  return trimmed === "" ? null : trimmed;
}

export async function updateSettingsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = settingsSchema.safeParse({
    company_name: formData.get("company_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    tax_rate: formData.get("tax_rate"),
    payment_instructions: formData.get("payment_instructions"),
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
  const id = String(formData.get("id") ?? "");

  const values = {
    company_name: parsed.data.company_name,
    email: nullify(parsed.data.email),
    phone: nullify(parsed.data.phone),
    address: nullify(parsed.data.address),
    tax_rate: parsed.data.tax_rate,
    payment_instructions: nullify(parsed.data.payment_instructions),
  };

  const { error } = id
    ? await supabase.from("company_settings").update(values).eq("id", id)
    : await supabase.from("company_settings").insert(values);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/invoices");
  return { success: true };
}
