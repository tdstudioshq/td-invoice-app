import "server-only";

import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import type {
  MylarArtworkFileRow,
  MylarDesignWithArtwork,
  MylarInquiryWithDesigns,
  MylarPrintingInquiry,
} from "@/lib/types/database";

/**
 * Admin-side reads for mylar printing inquiries.
 *
 * These go through the SERVICE-ROLE client because the table has RLS on with no
 * policies (migration 0023) — inquiries have no owner_id to scope to, since
 * they're filed by anonymous visitors, so the cookie-scoped client sees exactly
 * nothing. Same shape as the qr_generations read on /qr/history.
 *
 * Callers are responsible for `requireAdmin()`. Every current caller is inside
 * the (app) route group, whose layout already enforces it, and re-asserts it
 * locally. Nothing here is safe to expose to a client component.
 */

const LIST_LIMIT = 200;

/**
 * A list row, carrying the count the list should actually display.
 *
 * `design_count` on the inquiry is what the customer TYPED on step 3;
 * `designCount` here is how many designs the order really has, which is the
 * figure that matches the artwork underneath it. They agree on everything filed
 * since 0024 (the submission schema refuses a mismatch) and can differ on older
 * rows, whose artwork the backfill collapsed into a single design.
 */
export type MylarInquiryListItem = MylarPrintingInquiry & {
  /** The figure to display: real designs when there are any, else the stated one. */
  designCount: number;
  /**
   * The customer's own figure, set ONLY when it disagrees with `designCount`.
   * Null the rest of the time, so the UI can annotate the exception without
   * having to compare the two itself.
   */
  statedDesignCount: number | null;
};

export async function getMylarInquiries(): Promise<MylarInquiryListItem[]> {
  if (!isSupabaseAdminConfigured()) return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("mylar_printing_inquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    if (error) {
      console.error("getMylarInquiries", error.message);
      return [];
    }
    const inquiries = data ?? [];
    if (inquiries.length === 0) return [];

    // One extra query rather than N: PostgREST cannot group, so the design rows
    // for this page of inquiries are counted in memory. At LIST_LIMIT=200
    // inquiries of a handful of designs each this is a few hundred narrow rows.
    // A failure degrades to the stored figure rather than emptying the list.
    const byInquiry = new Map<string, number>();
    const { data: designRows, error: designError } = await supabase
      .from("mylar_designs")
      .select("id, inquiry_id")
      .in(
        "inquiry_id",
        inquiries.map((inquiry) => inquiry.id),
      );
    if (designError) {
      console.error("getMylarInquiries designs", designError.message);
    }
    for (const row of designRows ?? []) {
      byInquiry.set(row.inquiry_id, (byInquiry.get(row.inquiry_id) ?? 0) + 1);
    }

    return inquiries.map((inquiry) => {
      const actual = byInquiry.get(inquiry.id) ?? 0;
      const designCount = actual > 0 ? actual : inquiry.design_count;
      return {
        ...inquiry,
        designCount,
        statedDesignCount:
          designCount === inquiry.design_count ? null : inquiry.design_count,
      };
    });
  } catch (error) {
    console.error("getMylarInquiries", error);
    return [];
  }
}

/**
 * One inquiry with its designs and each design's artwork.
 *
 * Three queries rather than a PostgREST embedded select. The embed syntax
 * (`mylar_designs(*, mylar_artwork_files(*))`) would work, but it needs the
 * foreign keys to be visible in PostgREST's schema cache — which lags a fresh
 * migration and fails with PGRST200 until it reloads. Three plain selects on a
 * page that renders one inquiry are cheap and have no such dependency.
 *
 * Designs come back ordered by design_number so "Design 1" in the admin view
 * always means the same design the customer saw as Design 1.
 */
export async function getMylarInquiry(
  id: string,
): Promise<MylarInquiryWithDesigns | null> {
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const supabase = createAdminClient();
    const { data: inquiry, error } = await supabase
      .from("mylar_printing_inquiries")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("getMylarInquiry", error.message);
      return null;
    }
    if (!inquiry) return null;

    const { data: designRows, error: designError } = await supabase
      .from("mylar_designs")
      .select("*")
      .eq("inquiry_id", id)
      .order("design_number", { ascending: true });
    if (designError) {
      console.error("getMylarInquiry designs", designError.message);
      return { ...inquiry, designs: [] };
    }

    const designs = designRows ?? [];
    if (designs.length === 0) return { ...inquiry, designs: [] };

    const { data: artworkRows, error: artworkError } = await supabase
      .from("mylar_artwork_files")
      .select("*")
      .in(
        "design_id",
        designs.map((design) => design.id),
      );
    if (artworkError) {
      console.error("getMylarInquiry artwork", artworkError.message);
    }

    const byDesign = new Map<string, MylarArtworkFileRow[]>();
    for (const file of artworkRows ?? []) {
      const list = byDesign.get(file.design_id);
      if (list) list.push(file);
      else byDesign.set(file.design_id, [file]);
    }

    const withArtwork: MylarDesignWithArtwork[] = designs.map((design) => ({
      ...design,
      artwork: byDesign.get(design.id) ?? [],
    }));

    return { ...inquiry, designs: withArtwork };
  } catch (error) {
    console.error("getMylarInquiry", error);
    return null;
  }
}

/**
 * The artwork file behind an admin download, with its inquiry proven.
 *
 * The route is handed an inquiry id from the URL and a file id from the query
 * string; this join is what stops the two being mixed and matched, so a file id
 * belonging to another customer's inquiry resolves to null rather than to a
 * signed URL.
 */
export async function getMylarArtworkFile(
  inquiryId: string,
  fileId: string,
): Promise<MylarArtworkFileRow | null> {
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const supabase = createAdminClient();
    const { data: file, error } = await supabase
      .from("mylar_artwork_files")
      .select("*")
      .eq("id", fileId)
      .maybeSingle();
    if (error || !file) return null;

    const { data: design } = await supabase
      .from("mylar_designs")
      .select("id, inquiry_id")
      .eq("id", file.design_id)
      .maybeSingle();

    if (!design || design.inquiry_id !== inquiryId) return null;
    return file;
  } catch (error) {
    console.error("getMylarArtworkFile", error);
    return null;
  }
}
