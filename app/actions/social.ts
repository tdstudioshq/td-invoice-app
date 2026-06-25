"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import {
  fetchLatestInstagramData,
  getInstagramConfiguration,
} from "@/lib/social/instagram";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";

function safeErrorMessage(error: unknown): string {
  let message =
    error instanceof Error ? error.message : "Instagram sync failed.";

  for (const secret of [
    process.env.INSTAGRAM_ACCESS_TOKEN,
    process.env.INSTAGRAM_APP_SECRET,
  ]) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }

  return message.slice(0, 1000);
}

export async function syncInstagramAction(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const user = await requireAdmin();
  if (!user) return;

  const configuration = getInstagramConfiguration();
  if (!configuration.configured || !configuration.businessAccountId) {
    revalidatePath("/social");
    return;
  }

  const supabase = await createClient();
  let accountId: string | null = null;
  let syncLogId: string | null = null;

  try {
    const { data: account, error: accountError } = await supabase
      .from("social_accounts")
      .upsert(
        {
          owner_id: user.id,
          platform: "instagram",
          username: configuration.username,
          instagram_business_account_id: configuration.businessAccountId,
          sync_status: "syncing",
          sync_error: null,
        },
        { onConflict: "owner_id,platform" },
      )
      .select("id")
      .single();

    if (accountError || !account) {
      throw new Error(
        accountError?.message ?? "Could not cache the social account.",
      );
    }
    accountId = account.id;

    const { data: syncLog, error: syncLogError } = await supabase
      .from("social_sync_logs")
      .insert({
        owner_id: user.id,
        social_account_id: accountId,
        status: "running",
      })
      .select("id")
      .single();

    if (syncLogError || !syncLog) {
      throw new Error(
        syncLogError?.message ?? "Could not start the sync log.",
      );
    }
    syncLogId = syncLog.id;

    const { profile, media } = await fetchLatestInstagramData();
    const syncedAt = new Date().toISOString();

    const posts = media.map((post) => ({
      owner_id: user.id,
      social_account_id: accountId!,
      instagram_media_id: post.id,
      caption: post.caption ?? null,
      media_type:
        post.media_product_type === "REELS"
          ? "REELS"
          : post.media_type,
      media_url: post.media_url ?? null,
      thumbnail_url: post.thumbnail_url ?? null,
      permalink: post.permalink,
      published_at: post.timestamp,
      username: post.username ?? profile.username,
      like_count: post.like_count ?? null,
      comments_count: post.comments_count ?? null,
      raw_payload: post as unknown as Json,
      synced_at: syncedAt,
    }));

    if (posts.length > 0) {
      const { error: postsError } = await supabase
        .from("social_posts")
        .upsert(posts, {
          onConflict: "social_account_id,instagram_media_id",
        });
      if (postsError) throw new Error(postsError.message);
    }

    const { error: profileError } = await supabase
      .from("social_accounts")
      .update({
        username: profile.username,
        instagram_business_account_id: profile.id,
        profile_picture_url: profile.profile_picture_url ?? null,
        followers_count: profile.followers_count ?? null,
        follows_count: profile.follows_count ?? null,
        media_count: profile.media_count ?? null,
        last_synced_at: syncedAt,
        sync_status: "connected",
        sync_error: null,
      })
      .eq("id", accountId);

    if (profileError) throw new Error(profileError.message);

    await supabase
      .from("social_sync_logs")
      .update({
        status: "completed",
        posts_fetched: media.length,
        posts_upserted: posts.length,
        completed_at: syncedAt,
        error_message: null,
      })
      .eq("id", syncLogId);
  } catch (error) {
    const message = safeErrorMessage(error);
    const completedAt = new Date().toISOString();

    if (accountId) {
      await supabase
        .from("social_accounts")
        .update({
          sync_status: "error",
          sync_error: message,
        })
        .eq("id", accountId);
    }

    if (syncLogId) {
      await supabase
        .from("social_sync_logs")
        .update({
          status: "error",
          error_message: message,
          completed_at: completedAt,
        })
        .eq("id", syncLogId);
    }

    console.error("syncInstagramAction", message);
  }

  revalidatePath("/social");
}
