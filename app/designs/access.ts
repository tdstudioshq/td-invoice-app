"use server";
import type { ActionState } from "@/app/actions/types";
import { hasGalleryAccess, enterGallery, lockGallery } from "@/lib/security/gallery";
export async function hasDesignsAccess() { return hasGalleryAccess("designs"); }
export async function enterDesignsCodeAction(_previous: ActionState, form: FormData): Promise<ActionState> { return enterGallery("designs", form); }
export async function lockDesignsAction() { return lockGallery("designs"); }
