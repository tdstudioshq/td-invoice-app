import "server-only";

import { unstable_cache } from "next/cache";

import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { isImageFile, prettifyName } from "@/lib/portfolio";
import type {
  PremadeDesign,
  SignedPremadeDesignUrls,
} from "@/lib/premade-designs-types";

export { PREMADE_DESIGNS_PAGE_SIZE } from "@/lib/premade-designs-types";
export type {
  PremadeDesign,
  SignedPremadeDesignUrls,
} from "@/lib/premade-designs-types";

export const PREMADE_DESIGNS_BUCKET = "premade-designs";

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

function prettifyFolder(folder: string): string {
  return folder
    .split("/")
    .map((part) => part.replace(/[-_]+/g, " ").trim())
    .filter(Boolean)
    .join(" / ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Lists the private manifest without exposing credentials or signed URLs. */
async function loadPremadeDesigns(): Promise<PremadeDesign[]> {
  if (!isSupabaseAdminConfigured()) return [];

  try {
    const { data, error } = await createAdminClient().rpc(
      "list_premade_design_paths",
    );
    if (error) throw error;
    if (!Array.isArray(data)) return [];

    return data
      .filter((path): path is string =>
        typeof path === "string" && isImageFile(path),
      )
      .map((path) => {
        const name = path.slice(path.lastIndexOf("/") + 1);
        const folder = path.includes("/")
          ? path.slice(0, path.lastIndexOf("/"))
          : "";
        return {
          id: path,
          name,
          path,
          title: prettifyName(name),
          folder,
          folderLabel: folder ? prettifyFolder(folder) : "Uncategorized",
        };
      })
      .sort(
        (a, b) =>
          a.folder.localeCompare(b.folder, undefined, { numeric: true }) ||
          a.title.localeCompare(b.title, undefined, { numeric: true }),
      );
  } catch (error) {
    console.error(
      "getPremadeDesigns",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/**
 * Keep the manifest warm for one minute. Newly uploaded designs still appear
 * quickly without repeating the database read on every gallery interaction.
 */
export const getPremadeDesigns = unstable_cache(
  loadPremadeDesigns,
  ["premade-designs-manifest-v2"],
  { revalidate: 60, tags: ["premade-designs"] },
);

/** Create short-lived browser URLs only after the caller passes the gallery gate. */
export async function signPremadeDesignUrls(
  paths: string[],
): Promise<SignedPremadeDesignUrls> {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Premade designs Storage is not configured.");
  }

  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) {
    return { urls: {}, expiresAt: Date.now() };
  }

  const { data, error } = await createAdminClient()
    .storage.from(PREMADE_DESIGNS_BUCKET)
    .createSignedUrls(uniquePaths, SIGNED_URL_LIFETIME_SECONDS);
  if (error) throw error;

  const urls: Record<string, string> = {};
  uniquePaths.forEach((path, index) => {
    const signedUrl = data?.[index]?.signedUrl;
    if (signedUrl) urls[path] = signedUrl;
  });

  return {
    urls,
    expiresAt: Date.now() + SIGNED_URL_LIFETIME_SECONDS * 1000,
  };
}
