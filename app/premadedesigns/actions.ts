"use server";

import { z } from "zod";

import { hasPremadeDesignsAccess } from "@/app/premadedesigns/access";
import {
  PREMADE_DESIGNS_PAGE_SIZE,
  signPremadeDesignUrls,
  type SignedPremadeDesignUrls,
} from "@/lib/premade-designs";

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
  .max(PREMADE_DESIGNS_PAGE_SIZE);

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
