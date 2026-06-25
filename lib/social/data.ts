import {
  createClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import type {
  SocialAccount,
  SocialPost,
  SocialSyncLog,
} from "@/lib/types/database";

export interface SocialHubData {
  account: SocialAccount | null;
  posts: SocialPost[];
  latestSync: SocialSyncLog | null;
}

const EMPTY_SOCIAL_HUB: SocialHubData = {
  account: null,
  posts: [],
  latestSync: null,
};

export async function getSocialHubData(limit = 24): Promise<SocialHubData> {
  if (!isSupabaseConfigured()) return EMPTY_SOCIAL_HUB;

  const supabase = await createClient();
  const { data: account, error: accountError } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("platform", "instagram")
    .maybeSingle();

  if (accountError) {
    console.error("getSocialHubData account", accountError.message);
    return EMPTY_SOCIAL_HUB;
  }
  if (!account) return EMPTY_SOCIAL_HUB;

  const [postsResult, syncResult] = await Promise.all([
    supabase
      .from("social_posts")
      .select("*")
      .eq("social_account_id", account.id)
      .order("published_at", { ascending: false })
      .limit(Math.min(100, Math.max(1, limit))),
    supabase
      .from("social_sync_logs")
      .select("*")
      .eq("social_account_id", account.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (postsResult.error) {
    console.error("getSocialHubData posts", postsResult.error.message);
  }
  if (syncResult.error) {
    console.error("getSocialHubData sync", syncResult.error.message);
  }

  return {
    account,
    posts: postsResult.data ?? [],
    latestSync: syncResult.data ?? null,
  };
}
