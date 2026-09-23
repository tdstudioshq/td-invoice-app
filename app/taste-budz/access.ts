"use server";

import { createSignedGalleryGate } from "@/lib/gallery-access";
import type { ActionState } from "@/app/actions/types";

// HMAC-signed shared-passcode gate — implementation in
// `lib/gallery-access.ts`. A "use server" file may only export async
// functions, so this stays a wrapper.
const gate = createSignedGalleryGate({
  cookieName: "tb_access",
  cookieVersion: "tb-v2",
  path: "/taste-budz",
  rateLimitLabel: "taste-budz",
});

export async function hasTasteBudzAccess(): Promise<boolean> {
  return gate.has();
}

export async function enterTasteBudzCodeAction(
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return gate.enter(previous, formData);
}

export async function lockTasteBudzAction(): Promise<void> {
  return gate.lock();
}
