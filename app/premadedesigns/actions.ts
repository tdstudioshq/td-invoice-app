"use server";

import { z } from "zod";

import { hasPremadeDesignsAccess } from "@/app/premadedesigns/access";
import {
  PREMADE_COLLECTIONS_PAGE_SIZE,
  PREMADE_DESIGNS_PAGE_SIZE,
  signPremadeDesignUrls,
  type SignedPremadeDesignUrls,
} from "@/lib/premade-designs";

/**
 * One request never covers more than a single view: a page of designs, or a
 * page of collection covers. Whichever view is larger sets the ceiling.
 */
const MAX_PATHS_PER_REQUEST = Math.max(
  PREMADE_DESIGNS_PAGE_SIZE,
  PREMADE_COLLECTIONS_PAGE_SIZE,
);

export type PremadeDesignUrlsState = SignedPremadeDesignUrls & {
  error?: string;
};

const pathsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine(
        (path) =>
          !path.startsWith("/") &&
          !path.split("/").includes("..") &&
          /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(path),
        "Invalid design path.",
      ),
  )
  .min(1)
  .max(MAX_PATHS_PER_REQUEST);

export async function getPremadeDesignUrlsAction(
  paths: string[],
): Promise<PremadeDesignUrlsState> {
  if (!(await hasPremadeDesignsAccess())) {
    return { urls: {}, expiresAt: 0, error: "Gallery access expired." };
  }

  const parsed = pathsSchema.safeParse(paths);
  if (!parsed.success) {
    return { urls: {}, expiresAt: 0, error: "Invalid image request." };
  }

  try {
    return await signPremadeDesignUrls(parsed.data);
  } catch (error) {
    console.error(
      "getPremadeDesignUrlsAction",
      error instanceof Error ? error.message : error,
    );
    return { urls: {}, expiresAt: 0, error: "Images could not be loaded." };
  }
}
