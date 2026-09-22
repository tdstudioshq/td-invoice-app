import "server-only";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { equalSecret, signSession, verifySession, SESSION_SECONDS } from "./tokens";
import { allowAttempt } from "./throttle";
export type Gallery = "designs" | "taste-budz" | "mafiaterpz" | "martyig" | "premadedesigns" | "newpremades";
function config(gallery: Gallery) {
  const secret = process.env.GALLERY_SESSION_SECRET;
  const code = process.env[`GALLERY_CODE_${gallery.replaceAll("-", "_").toUpperCase()}`];
  return secret && secret.length >= 32 && code && /^\d{4}$/.test(code) ? { secret, code } : null;
}
const cookieName = (gallery: Gallery) => `td_gallery_${gallery}`;
const attributes = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };
export async function hasGalleryAccess(gallery: Gallery) {
  const cfg = config(gallery);
  const value = (await cookies()).get(cookieName(gallery))?.value;
  return Boolean(cfg && value && verifySession(value, gallery, cfg.secret));
}
export async function enterGallery(gallery: Gallery, form: FormData) {
  const cfg = config(gallery);
  if (!cfg) return { error: "Gallery access is not configured." };
  if (!await allowAttempt(`gallery:${gallery}`, 10, 600)) return { error: "Too many attempts or access unavailable. Try again in ten minutes." };
  if (!equalSecret(String(form.get("code") ?? ""), cfg.code)) return { error: "Wrong code. Try again." };
  (await cookies()).set(cookieName(gallery), signSession(gallery, cfg.secret), { ...attributes, maxAge: SESSION_SECONDS });
  revalidatePath(`/${gallery}`);
  return { success: true };
}
export async function lockGallery(gallery: Gallery) {
  (await cookies()).set(cookieName(gallery), "", { ...attributes, maxAge: 0 });
  revalidatePath(`/${gallery}`);
}
