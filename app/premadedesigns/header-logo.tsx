"use client";

import { useSearchParams } from "next/navigation";

import { HomeLogoLink } from "@/components/layout/home-logo";
import {
  COLLECTION_PARAM,
  pushCollection,
} from "@/app/premadedesigns/collection-url";

/**
 * The header logo, made view-aware: on the collections index it is the usual
 * link home, but inside a collection it goes up one level to the index — the
 * same move as "Back to All Collections" — rather than out of the gallery.
 *
 * It checks the param against the real collections — the same test the
 * gallery uses — rather than trusting "param present": an unknown folder shows
 * the index, so the logo must still go home there.
 */
export function PremadeHeaderLogo({
  collections,
}: {
  /** Folder values that open a collection; empty when there is only one. */
  collections: string[];
}) {
  const searchParams = useSearchParams();
  const requested = searchParams.get(COLLECTION_PARAM);
  const inCollection = requested !== null && collections.includes(requested);

  if (!inCollection) return <HomeLogoLink />;

  return (
    <HomeLogoLink
      href="/premadedesigns"
      label="Back to all collections"
      onClick={(event) => {
        // Let cmd/ctrl/shift/middle-click open the index in a new tab as usual.
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        pushCollection(null);
      }}
    />
  );
}
