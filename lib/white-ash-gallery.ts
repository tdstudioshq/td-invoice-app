import "server-only";

import {
  designLabel,
  whiteAshRoundLabel,
  whiteAshRoundRank,
  type WhiteAshDesign,
  type WhiteAshGallery,
  type WhiteAshRound,
} from "@/lib/white-ash-gallery-types";

/**
 * White Ash Farms client proof gallery.
 *
 * The artwork lives in the public `white-ash-august` Storage bucket, not in
 * this repo — 166 designs is ~77 MB, which has no business in git or in a
 * deployment bundle. The bucket also holds the manifest, so re-running the
 * renderer and uploader in the artwork folder publishes a new round without
 * touching this app or triggering a redeploy.
 *
 * Images are served straight from Storage with a plain <img>, deliberately not
 * next/image: they are already WebP at exactly the two sizes the page uses, so
 * re-optimising them would burn billable Vercel image transformations to
 * produce a slightly worse file.
 */

const PROJECT_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const WHITE_ASH_BUCKET = "white-ash-august";

/** Public base for every asset in the bucket. */
export const WHITE_ASH_ASSET_BASE = PROJECT_URL
  ? `${PROJECT_URL.replace(/\/+$/, "")}/storage/v1/object/public/${WHITE_ASH_BUCKET}`
  : "";

const MANIFEST_URL = WHITE_ASH_ASSET_BASE
  ? `${WHITE_ASH_ASSET_BASE}/data/gallery.json`
  : "";

export {
  assetUrl,
  designLabel,
  whiteAshRoundLabel,
  WHITE_ASH_ROUND_LABELS,
} from "@/lib/white-ash-gallery-types";
export type {
  WhiteAshDesign,
  WhiteAshGallery,
  WhiteAshRound,
} from "@/lib/white-ash-gallery-types";

type RawManifest = {
  generatedAt?: string;
  items?: Array<Record<string, unknown>>;
};

const EMPTY: WhiteAshGallery = {
  rounds: [],
  total: 0,
  generatedAt: null,
  assetBase: "",
};

/**
 * Reads the manifest from Storage. Revalidated rather than request-scoped, so
 * a fresh upload appears within the window without a deploy, and 166 clients
 * hitting the page do not each trigger an origin fetch.
 */
export async function getWhiteAshGallery(): Promise<WhiteAshGallery> {
  if (!MANIFEST_URL) return EMPTY;

  let raw: RawManifest;
  try {
    const res = await fetch(MANIFEST_URL, { next: { revalidate: 300 } });
    if (!res.ok) return EMPTY;
    raw = (await res.json()) as RawManifest;
  } catch {
    return EMPTY;
  }

  const items = Array.isArray(raw.items) ? raw.items : [];

  const designs: WhiteAshDesign[] = items
    .filter(
      (it) =>
        typeof it.name === "string" &&
        typeof it.folder === "string" &&
        typeof it.preview === "string" &&
        typeof it.thumbnail === "string",
    )
    .map((it) => ({
      name: it.name as string,
      folder: it.folder as string,
      preview: it.preview as string,
      thumbnail: it.thumbnail as string,
      width: typeof it.width === "number" ? it.width : null,
      height: typeof it.height === "number" ? it.height : null,
      widthIn: typeof it.widthIn === "number" ? it.widthIn : null,
      heightIn: typeof it.heightIn === "number" ? it.heightIn : null,
      previewSize: typeof it.previewSize === "number" ? it.previewSize : 0,
      duplicateOf:
        typeof it.duplicateOf === "string" ? it.duplicateOf : null,
    }));

  const byRound = new Map<string, WhiteAshDesign[]>();
  for (const d of designs) {
    const list = byRound.get(d.folder);
    if (list) list.push(d);
    else byRound.set(d.folder, [d]);
  }

  const rounds: WhiteAshRound[] = [...byRound.entries()]
    .map(([key, list]) => ({
      key,
      label: whiteAshRoundLabel(key),
      count: list.length,
      designs: list.sort((a, b) =>
        designLabel(a).localeCompare(designLabel(b), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    }))
    .sort(
      (a, b) => whiteAshRoundRank(a.key) - whiteAshRoundRank(b.key) || a.key.localeCompare(b.key),
    );

  return {
    rounds,
    total: designs.length,
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : null,
    assetBase: WHITE_ASH_ASSET_BASE,
  };
}
