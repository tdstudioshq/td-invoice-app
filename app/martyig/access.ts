"use server";
import type { ActionState } from "@/app/actions/types";
import { hasGalleryAccess, enterGallery, lockGallery } from "@/lib/security/gallery";
export async function hasMartyigAccess() { return hasGalleryAccess("martyig"); }
export async function enterMartyigCodeAction(_previous: ActionState, form: FormData): Promise<ActionState> { return enterGallery("martyig", form); }
export async function lockMartyigAction() { return lockGallery("martyig"); }
