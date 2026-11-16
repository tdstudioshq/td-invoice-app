/**
 * The open collection lives in the URL (`/premadedesigns?collection=<folder>`)
 * so the browser's Back/Forward buttons and a reload all land on the view the
 * customer was looking at.
 *
 * Changes go through the native `history.pushState`, which Next 16 syncs into
 * `useSearchParams` WITHOUT a server round-trip: the page is `force-dynamic`,
 * so a `router.push` would re-run the access check, re-read the manifest and
 * re-sign images on every click into a collection. Client-safe — imported by
 * the gallery and by the header logo.
 */
export const COLLECTION_PARAM = "collection";

/** Open a collection (or return to the index) as a new history entry. */
export function pushCollection(value: string | null) {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(COLLECTION_PARAM);
  else url.searchParams.set(COLLECTION_PARAM, value);
  window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
