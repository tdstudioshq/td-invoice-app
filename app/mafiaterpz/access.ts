"use server";
import type { ActionState } from "@/app/actions/types";
import { hasGalleryAccess, enterGallery, lockGallery } from "@/lib/security/gallery";
export async function hasMafiaTerpzAccess() { return hasGalleryAccess("mafiaterpz"); }
export async function enterMafiaTerpzCodeAction(_previous: ActionState, form: FormData): Promise<ActionState> { return enterGallery("mafiaterpz", form); }
export async function lockMafiaTerpzAction() { return lockGallery("mafiaterpz"); }
