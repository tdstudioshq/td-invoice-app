"use server";
import type { ActionState } from "@/app/actions/types";
import { hasGalleryAccess, enterGallery, lockGallery } from "@/lib/security/gallery";
export async function hasTasteBudzAccess() { return hasGalleryAccess("taste-budz"); }
export async function enterTasteBudzCodeAction(_previous: ActionState, form: FormData): Promise<ActionState> { return enterGallery("taste-budz", form); }
export async function lockTasteBudzAction() { return lockGallery("taste-budz"); }
