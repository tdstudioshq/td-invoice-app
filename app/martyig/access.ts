"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import type { ActionState } from "@/app/actions/types";

// Lightweight shared-passcode gate, not account auth — same deliberate design
// as /taste-budz and /designs: a constant code + httpOnly cookie for a
// semi-private page.
const ACCESS_CODE = "0420";
const MARTYIG_COOKIE = "martyig_access";
const COOKIE_VALUE = "granted";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function hasMartyigAccess(): Promise<boolean> {
  const store = await cookies();
  return store.get(MARTYIG_COOKIE)?.value === COOKIE_VALUE;
}

export async function enterMartyigCodeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = String(formData.get("code") ?? "").trim();
  if (code !== ACCESS_CODE) {
    return { error: "Wrong code. Try again." };
  }
  const store = await cookies();
  store.set(MARTYIG_COOKIE, COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/martyig",
    maxAge: COOKIE_MAX_AGE,
  });
  revalidatePath("/martyig");
  return { success: true };
}
