"use server";

import { createSignedGalleryGate } from "@/lib/gallery-access";
import type { ActionState } from "@/app/actions/types";

// HMAC-signed shared-passcode gate — implementation in
// `lib/gallery-access.ts`. A "use server" file may only export async
// functions, so this stays a wrapper. Cookie name and version are unchanged,
// so existing unlocks keep working.
const gate = createSignedGalleryGate({
  cookieName: "new_premades_access",
  cookieVersion: "newpremades-v1",
  path: "/newpremades",
  rateLimitLabel: "newpremades",
});

export async function hasNewPremadesAccess(): Promise<boolean> {
  return gate.has();
}

export async function enterNewPremadesCodeAction(
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return gate.enter(previous, formData);
}

export async function lockNewPremadesAction(): Promise<void> {
  return gate.lock();
}
