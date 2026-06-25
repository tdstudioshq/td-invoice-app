import Image from "next/image";
import Link from "next/link";
import {
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  InstagramLogoIcon,
} from "@phosphor-icons/react/dist/ssr";

import { syncInstagramAction } from "@/app/actions/social";
import { SubmitButton } from "@/components/shared/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type {
  SocialAccount,
  SocialSyncLog,
} from "@/lib/types/database";

const numberFormatter = new Intl.NumberFormat("en-US");

function accountStatus(
  configured: boolean,
  account: SocialAccount | null,
): {
  label: string;
  className: string;
} {
  if (!configured) {
    return {
      label: "Not configured",
      className: "bg-muted text-muted-foreground",
    };
  }
  if (account?.sync_status === "error") {
    return {
      label: "Sync error",
      className: "bg-destructive/15 text-destructive",
    };
  }
  if (account?.sync_status === "syncing") {
    return {
      label: "Syncing",
      className: "bg-amber-500/15 text-amber-300",
    };
  }
  if (account?.sync_status === "connected") {
    return {
      label: "Connected",
      className: "bg-emerald-500/15 text-emerald-300",
    };
  }
  return {
    label: "Ready to sync",
    className: "bg-secondary text-secondary-foreground",
  };
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div className="border-border border p-3">
      <p className="text-muted-foreground text-[11px] uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold tabular-nums">
        {value == null ? "—" : numberFormatter.format(value)}
      </p>
    </div>
  );
}

export function InstagramAccountCard({
  account,
  latestSync,
  configured,
  graphApiVersion,
}: {
  account: SocialAccount | null;
  latestSync: SocialSyncLog | null;
  configured: boolean;
  graphApiVersion: string;
}) {
  const status = accountStatus(configured, account);
  const username = account?.username ?? "tdstudiosco";

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex min-w-0 items-center gap-3">
          {account?.profile_picture_url ? (
            <Image
              src={account.profile_picture_url}
              alt={`@${username} profile`}
              width={48}
              height={48}
              className="size-12 rounded-full object-cover"
              unoptimized
            />
          ) : (
            <div className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-full">
              <InstagramLogoIcon className="size-6" />
            </div>
          )}
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2">
              Instagram
              <Badge className={status.className}>{status.label}</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              @{username} · Meta Graph API {graphApiVersion}
            </CardDescription>
          </div>
        </div>
        <CardAction className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`https://instagram.com/${username}`}
              target="_blank"
              rel="noreferrer"
            >
              <ArrowSquareOutIcon />
              Profile
            </Link>
          </Button>
          <form action={syncInstagramAction}>
            <SubmitButton
              size="sm"
              disabled={!configured}
              pendingText="Syncing…"
            >
              <ArrowsClockwiseIcon />
              Refresh
            </SubmitButton>
          </form>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {!configured ? (
          <div className="border-border bg-muted/40 border p-3">
            <p className="font-medium">Instagram credentials are missing.</p>
            <p className="text-muted-foreground mt-1">
              Set the server-only access token and business account ID, then
              restart the app.
            </p>
          </div>
        ) : null}

        {account?.sync_error ? (
          <div className="border-destructive/40 bg-destructive/10 text-destructive border p-3">
            <p className="font-medium">Last sync failed</p>
            <p className="mt-1 break-words">{account.sync_error}</p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Followers" value={account?.followers_count} />
          <Metric label="Following" value={account?.follows_count} />
          <Metric label="Posts" value={account?.media_count} />
        </div>

        <div className="text-muted-foreground flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>Last synced: {formatDateTime(account?.last_synced_at)}</span>
          {latestSync ? (
            <span>
              Last run: {latestSync.status} · {latestSync.posts_upserted} posts
              cached
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
