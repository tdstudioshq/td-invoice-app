"use server";
import type { ActionState } from "@/app/actions/types";
import { hasGalleryAccess, enterGallery, lockGallery } from "@/lib/security/gallery";
export async function hasNewPremadesAccess() { return hasGalleryAccess("newpremades"); }
export async function enterNewPremadesCodeAction(_previous: ActionState, form: FormData): Promise<ActionState> { return enterGallery("newpremades", form); }
export async function lockNewPremadesAction() { return lockGallery("newpremades"); }
