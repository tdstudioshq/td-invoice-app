import Image from "next/image";
import Link from "next/link";
import {
  ArrowSquareOutIcon,
  ChatCircleIcon,
  HeartIcon,
  ImageSquareIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react/dist/ssr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { SocialPost } from "@/lib/types/database";

function mediaLabel(mediaType: string): string {
  if (mediaType === "CAROUSEL_ALBUM") return "Carousel";
  if (mediaType === "REELS") return "Reel";
  if (mediaType === "VIDEO") return "Video";
  return "Image";
}

export function InstagramPostCard({ post }: { post: SocialPost }) {
  const previewUrl = post.thumbnail_url ?? post.media_url;
  const isVideo = post.media_type === "VIDEO" || post.media_type === "REELS";

  return (
    <Card className="gap-0 py-0">
      <div className="bg-muted relative aspect-square overflow-hidden">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={post.caption ? post.caption.slice(0, 120) : "Instagram post"}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 hover:scale-[1.02]"
            unoptimized
          />
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center">
            <ImageSquareIcon className="size-10" />
          </div>
        )}
        <Badge className="bg-background/85 text-foreground absolute top-2 left-2 backdrop-blur">
          {isVideo ? <VideoCameraIcon /> : <ImageSquareIcon />}
          {mediaLabel(post.media_type)}
        </Badge>
      </div>

      <CardContent className="space-y-3 py-4">
        <p className="text-muted-foreground line-clamp-3 min-h-[3.75rem] text-xs leading-5">
          {post.caption || "No caption"}
        </p>
        <div className="text-muted-foreground flex items-center gap-4 text-xs">
          {post.like_count != null ? (
            <span className="flex items-center gap-1">
              <HeartIcon className="size-3.5" />
              {post.like_count.toLocaleString()}
            </span>
          ) : null}
          {post.comments_count != null ? (
            <span className="flex items-center gap-1">
              <ChatCircleIcon className="size-3.5" />
              {post.comments_count.toLocaleString()}
            </span>
          ) : null}
          <span className="ml-auto">{formatDateTime(post.published_at)}</span>
        </div>
      </CardContent>

      <CardFooter>
        <Button variant="ghost" size="sm" className="ml-auto" asChild>
          <Link href={post.permalink} target="_blank" rel="noreferrer">
            Open on Instagram
            <ArrowSquareOutIcon />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
