"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ActionState } from "@/app/actions/types";

const clientSchema = z.object({
  company_name: z.string().trim().min(1, "Company name is required"),
  contact_name: z.string().trim().optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

function parseClient(formData: FormData) {
  return clientSchema.safeParse({
    company_name: formData.get("company_name"),
    contact_name: formData.get("contact_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    notes: formData.get("notes"),
  });
}

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

// Empty strings become null so the database stores clean values.
function nullify(value: string | undefined | null) {
  const trimmed = (value ?? "").toString().trim();
  return trimmed === "" ? null : trimmed;
}

export async function createClientAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseClient(formData);
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("clients").insert({
    company_name: parsed.data.company_name,
    contact_name: nullify(parsed.data.contact_name),
    email: nullify(parsed.data.email),
    phone: nullify(parsed.data.phone),
    address: nullify(parsed.data.address),
    notes: nullify(parsed.data.notes),
  });

  if (error) return { error: error.message };

  revalidatePath("/clients");
  redirect("/clients");
}

export async function updateClientAction(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseClient(formData);
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      company_name: parsed.data.company_name,
      contact_name: nullify(parsed.data.contact_name),
      email: nullify(parsed.data.email),
      phone: nullify(parsed.data.phone),
      address: nullify(parsed.data.address),
      notes: nullify(parsed.data.notes),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isSupabaseConfigured()) return;

  const supabase = await createClient();
  await supabase.from("clients").delete().eq("id", id);

  revalidatePath("/clients");
  redirect("/clients");
}
