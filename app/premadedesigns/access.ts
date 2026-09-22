"use server";
import type { ActionState } from "@/app/actions/types";
import { hasGalleryAccess, enterGallery, lockGallery } from "@/lib/security/gallery";
export async function hasPremadeDesignsAccess() { return hasGalleryAccess("premadedesigns"); }
export async function enterPremadeDesignsCodeAction(_previous: ActionState, form: FormData): Promise<ActionState> { return enterGallery("premadedesigns", form); }
export async function lockPremadeDesignsAction() { return lockGallery("premadedesigns"); }
