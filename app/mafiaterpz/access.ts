"use server";

import { createSimpleGalleryGate } from "@/lib/gallery-access";
import type { ActionState } from "@/app/actions/types";

// Shared-passcode gate — implementation in `lib/gallery-access.ts`.
// A "use server" file may only export async functions, so this stays a wrapper.
const gate = createSimpleGalleryGate({
  cookieName: "mafiaterpz_access",
  path: "/mafiaterpz",
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
