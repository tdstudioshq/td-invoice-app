"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import type { ActionState } from "@/app/actions/types";

// Lightweight shared-passcode gate, not account auth: the code is a vibe lock
// for a semi-private gallery, so a constant + httpOnly cookie is deliberate.
const ACCESS_CODE = "0420";
const TASTE_BUDZ_COOKIE = "tb_access";
const COOKIE_VALUE = "granted";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function hasTasteBudzAccess(): Promise<boolean> {
  const store = await cookies();
  return store.get(TASTE_BUDZ_COOKIE)?.value === COOKIE_VALUE;
}

export async function enterTasteBudzCodeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = String(formData.get("code") ?? "").trim();
  if (code !== ACCESS_CODE) {
    return { error: "Wrong code. Try again." };
  }
  const store = await cookies();
  store.set(TASTE_BUDZ_COOKIE, COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/taste-budz",
    maxAge: COOKIE_MAX_AGE,
  });
  revalidatePath("/taste-budz");
  return { success: true };
}
