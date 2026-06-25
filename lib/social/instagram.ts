import "server-only";

import { createHmac } from "node:crypto";

const GRAPH_API_VERSION = "v25.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const DEFAULT_USERNAME = "tdstudiosco";
const DEFAULT_MEDIA_LIMIT = 24;

const PROFILE_FIELDS = [
  "id",
  "username",
  "profile_picture_url",
  "followers_count",
  "follows_count",
  "media_count",
].join(",");

const MEDIA_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_product_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "timestamp",
  "username",
  "like_count",
  "comments_count",
].join(",");

export interface InstagramConfiguration {
  configured: boolean;
  businessAccountId: string | null;
  username: string;
  graphApiVersion: string;
}

export interface InstagramProfile {
  id: string;
  username: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  username?: string;
  like_count?: number;
  comments_count?: number;
}

interface InstagramMediaResponse {
  data: InstagramMedia[];
}

interface MetaErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly subcode?: number,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

export function getInstagramConfiguration(): InstagramConfiguration {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const businessAccountId =
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim() || null;

  return {
    configured: Boolean(accessToken && businessAccountId),
    businessAccountId,
    username: DEFAULT_USERNAME,
    graphApiVersion: GRAPH_API_VERSION,
  };
}

export function isInstagramConfigured(): boolean {
  return getInstagramConfiguration().configured;
}

function getServerCredentials() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const businessAccountId =
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();

  if (!accessToken || !businessAccountId) {
    throw new InstagramApiError(
      "Instagram is not configured. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID.",
    );
  }

  return {
    accessToken,
    businessAccountId,
    appSecret: process.env.INSTAGRAM_APP_SECRET?.trim(),
  };
}

async function graphRequest<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const { accessToken, appSecret } = getServerCredentials();
  const url = new URL(`${GRAPH_API_BASE}/${path}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  if (appSecret) {
    url.searchParams.set(
      "appsecret_proof",
      createHmac("sha256", appSecret).update(accessToken).digest("hex"),
    );
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const payload = (await response.json()) as T & MetaErrorResponse;
  if (!response.ok || payload.error) {
    throw new InstagramApiError(
      payload.error?.message ??
        `Meta Graph API request failed (${response.status}).`,
      payload.error?.code,
      payload.error?.error_subcode,
    );
  }

  return payload;
}

export async function fetchLatestInstagramData(limit = DEFAULT_MEDIA_LIMIT) {
  const { businessAccountId } = getServerCredentials();
  const accountPath = encodeURIComponent(businessAccountId);

  const [profile, media] = await Promise.all([
    graphRequest<InstagramProfile>(accountPath, {
      fields: PROFILE_FIELDS,
    }),
    graphRequest<InstagramMediaResponse>(`${accountPath}/media`, {
      fields: MEDIA_FIELDS,
      limit: String(Math.min(100, Math.max(1, limit))),
    }),
  ]);

  return {
    profile,
    media: media.data ?? [],
  };
}
