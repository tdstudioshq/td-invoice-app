"use server";

import { createSignedGalleryGate } from "@/lib/gallery-access";
import type { ActionState } from "@/app/actions/types";

// HMAC-signed shared-passcode gate — implementation in
// `lib/gallery-access.ts`. A "use server" file may only export async
// functions, so this stays a wrapper.
const gate = createSignedGalleryGate({
  cookieName: "mafiaterpz_access",
  cookieVersion: "mafiaterpz-v2",
  path: "/mafiaterpz",
  rateLimitLabel: "mafiaterpz",
});

export async function hasMafiaTerpzAccess(): Promise<boolean> {
  return gate.has();
}

export async function enterMafiaTerpzCodeAction(
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return gate.enter(previous, formData);
}
