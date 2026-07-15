"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import type { ActionState } from "@/app/actions/types";

// Lightweight shared-passcode gate, not account auth — same deliberate design
// as /taste-budz: a constant code + httpOnly cookie for a semi-private gallery.
const ACCESS_CODE = "0420";
const DESIGNS_COOKIE = "designs_access";
const COOKIE_VALUE = "granted";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function hasDesignsAccess(): Promise<boolean> {
  const store = await cookies();
  return store.get(DESIGNS_COOKIE)?.value === COOKIE_VALUE;
}

export async function enterDesignsCodeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = String(formData.get("code") ?? "").trim();
  if (code !== ACCESS_CODE) {
    return { error: "Wrong code. Try again." };
  }
  const store = await cookies();
  store.set(DESIGNS_COOKIE, COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/designs",
    maxAge: COOKIE_MAX_AGE,
  });
  revalidatePath("/designs");
  return { success: true };
}
