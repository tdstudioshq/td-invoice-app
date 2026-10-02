/**
 * Publish a local folder of artwork to a PUBLIC gallery bucket, web-optimized.
 *
 * The Vercel image optimizer is out of the delivery path (it returns 402 once
 * the allowance is spent), so a gallery image must already be the file the
 * browser should download. Every source image becomes TWO WebP objects:
 *
 *   <name>.webp          full size (≤ FULL_WIDTH wide) — the lightbox
 *   thumbs/<name>.webp   THUMB_WIDTH wide             — the grid tile
 *
 * `listPublicBucketImages(bucket, { thumbFolder: "thumbs" })` in
 * lib/queries/galleries.ts pairs them by filename, so a page that opts into
 * thumbnails expects every root object to have its `thumbs/` twin — which is
 * why this script always writes both.
 *
 * WHAT IT DOES (idempotent, safe to re-run):
 *   1. Creates the bucket as PUBLIC if it does not exist. An existing bucket
 *      is never flipped — a gated gallery needs a private one (see
 *      .claude/docs/portfolio-gallery.md, "Access posture").
 *   2. Converts every .jpg/.jpeg/.png/.webp in the folder (not recursive) and
 *      upserts both sizes, so re-running after editing a design replaces it.
 *
 * It never deletes. Removing a design from the folder leaves it in the bucket;
 * remove it in the Supabase dashboard (both the root object and its thumb).
 *
 * Usage:
 *   npm run gallery:upload -- <bucket> <folder> [--dry-run]
 *   npm run gallery:upload -- AP ~/Desktop/PREMADE-DESIGNS-MASTER-FOLDER/AP
 *
 * Runtime: plain Node >= 22.18 (native TypeScript type-stripping + --env-file;
 * the npm script passes --env-file=.env.local). Uses supabase-js directly, not
 * lib/supabase/admin.ts, which is `server-only` and throws outside Next.
 */

import { readdir, readFile } from "node:fs/promises";
import { extname, basename, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const FULL_WIDTH = 1200;
const FULL_QUALITY = 80;
const THUMB_WIDTH = 600;
const THUMB_QUALITY = 75;
const THUMB_FOLDER = "thumbs";
/** One week: long enough to stay warm on the CDN, short enough that an
 * edited design re-uploaded under the same name shows up the same week. */
const CACHE_CONTROL_SECONDS = "604800";

const SOURCE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [bucket, folder] = args.filter((arg) => !arg.startsWith("--"));
  if (!bucket || !folder) {
    console.error(
      "Usage: npm run gallery:upload -- <bucket> <folder> [--dry-run]",
    );
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    console.error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
    process.exit(1);
  }

  const files = (await readdir(folder))
    .filter((file) => SOURCE_EXTENSIONS.has(extname(file).toLowerCase()))
    .sort();
  if (files.length === 0) {
    console.error(`No images found in ${folder}.`);
    process.exit(1);
  }

  const storage = createClient(url, secret, {
    auth: { persistSession: false },
  }).storage;

  const { data: existing, error: getError } = await storage.getBucket(bucket);
  if (existing) {
    console.log(
      `Bucket "${bucket}" exists (${existing.public ? "public" : "PRIVATE"}).`,
    );
    if (!existing.public) {
      console.warn(
        "  It is private: public URLs will not resolve. Use a signed-URL lister for this bucket.",
      );
    }
  } else if (dryRun) {
    console.log(`Would create PUBLIC bucket "${bucket}".`);
  } else {
    const { error } = await storage.createBucket(bucket, { public: true });
    if (error) {
      console.error(
        `Could not create bucket "${bucket}":`,
        error.message,
        getError ? `(lookup: ${getError.message})` : "",
      );
      process.exit(1);
    }
    console.log(`Created PUBLIC bucket "${bucket}".`);
  }

  let fullBytes = 0;
  let thumbBytes = 0;
  for (const file of files) {
    const source = await readFile(join(folder, file));
    const name = `${basename(file, extname(file))}.webp`;
    const [full, thumb] = await Promise.all([
      sharp(source)
        .rotate()
        .resize({ width: FULL_WIDTH, withoutEnlargement: true })
        .webp({ quality: FULL_QUALITY, effort: 6 })
        .toBuffer(),
      sharp(source)
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: THUMB_QUALITY, effort: 6 })
        .toBuffer(),
    ]);
    fullBytes += full.length;
    thumbBytes += thumb.length;

    if (!dryRun) {
      for (const [path, body] of [
        [name, full],
        [`${THUMB_FOLDER}/${name}`, thumb],
      ] as const) {
        const { error } = await storage.from(bucket).upload(path, body, {
          contentType: "image/webp",
          cacheControl: CACHE_CONTROL_SECONDS,
          upsert: true,
        });
        if (error) {
          console.error(`Upload failed for ${path}:`, error.message);
          process.exit(1);
        }
      }
    }
    console.log(
      `${dryRun ? "[dry] " : ""}${name}  full ${kb(full.length)}  thumb ${kb(thumb.length)}`,
    );
  }

  console.log(
    `\n${files.length} images — full ${kb(fullBytes)}, thumbs ${kb(thumbBytes)}${dryRun ? " (dry run, nothing uploaded)" : ""}.`,
  );
}

function kb(bytes: number) {
  return `${Math.round(bytes / 1024)} KB`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
