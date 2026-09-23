"use server";

import { createSignedGalleryGate } from "@/lib/gallery-access";
import type { ActionState } from "@/app/actions/types";

// HMAC-signed shared-passcode gate — implementation in
// `lib/gallery-access.ts`. A "use server" file may only export async
// functions, so this stays a wrapper.
const gate = createSignedGalleryGate({
  cookieName: "martyig_access",
  cookieVersion: "martyig-v2",
  path: "/martyig",
  rateLimitLabel: "martyig",
});

export async function hasMartyigAccess(): Promise<boolean> {
  return gate.has();
}

export async function enterMartyigCodeAction(
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return gate.enter(previous, formData);
}
