import { describe, expect, test } from "bun:test";

import {
  deterministicDesignSlug,
  deterministicStoragePath,
  groupLocalDesigns,
  normalizeCollection,
  normalizeFilename,
  normalizeRelativePath,
  type CatalogImage,
} from "./core";

const HASH_A = "a".repeat(64);

function image(
  relativePath: string,
  collection: string,
  contentHash = HASH_A,
): CatalogImage {
  return {
    absolutePath: `/tmp/${relativePath}`,
    relativePath,
    normalizedRelativePath: normalizeRelativePath(relativePath, "jpg"),
    originalFilename: relativePath.split("/").at(-1)!,
    normalizedFilename: normalizeFilename(relativePath.split("/").at(-1)!, "jpg"),
    collection,
    collectionName: collection,
    contentHash,
    mimeType: "image/jpeg",
    canonicalExtension: "jpg",
    fileSize: 100,
    width: 1200,
    height: 1500,
  };
}

describe("premade catalog normalization", () => {
  test("normalizes case, whitespace, punctuation, and jpeg extensions", () => {
    expect(normalizeCollection("CRY BABY/New & Rare")).toBe(
      "cry-baby/new-and-rare",
    );
    expect(normalizeRelativePath("CRY BABY/My Design.JPEG", "jpg")).toBe(
      "cry-baby/my-design.jpg",
    );
  });

  test("uses one deterministic object path and slug for a content hash", () => {
    expect(deterministicStoragePath(HASH_A, "jpg")).toBe(
      `objects/aa/${HASH_A}.jpg`,
    );
    expect(deterministicDesignSlug("My Design.jpg", HASH_A)).toBe(
      "my-design-aaaaaaaaaaaa",
    );
  });
});

describe("content-hash deduplication", () => {
  test("keeps one design while preserving distinct category memberships", () => {
    const designs = groupLocalDesigns([
      image("A/design-one.jpg", "a"),
      image("B/renamed-copy.jpg", "b"),
      image("A/second-copy.jpg", "a"),
    ]);

    expect(designs).toHaveLength(1);
    expect(designs[0].files).toHaveLength(3);
    expect(designs[0].memberships.map((entry) => entry.collection)).toEqual([
      "a",
      "b",
    ]);
    expect(designs[0].canonical.relativePath).toBe("A/design-one.jpg");
  });
});
