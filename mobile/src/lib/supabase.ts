import "expo-sqlite/localStorage/install";

import { AppState, Platform } from "react-native";
import { createClient, processLock } from "@supabase/supabase-js";

import type { Database } from "@/src/types/database";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Exposed for direct Storage REST calls (resumable/progress uploads) that the
// supabase-js client doesn't surface progress for. The anon key is the public
// `apikey`; the per-request bearer is the user's own access token, so RLS still
// applies — no elevated access.
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

/**
 * Base URL of the deployed web app (e.g. https://invoices.tdstudios.app), used
 * to fetch the authoritative pdf-lib-rendered invoice PDF from the existing
 * `/api/invoices/[id]/pdf` route. When unset the PDF viewer falls back to a
 * locally-rendered HTML recreation, matching the app's graceful-degradation
 * pattern.
 */
export const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(
  /\/+$/,
  "",
);

export const supabase = createClient<Database>(
  supabaseUrl ?? "https://example.supabase.co",
  supabaseAnonKey ?? "missing-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  },
);

if (isSupabaseConfigured && Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
