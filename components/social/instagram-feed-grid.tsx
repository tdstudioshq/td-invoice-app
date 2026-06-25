import { ImageSquareIcon } from "@phosphor-icons/react/dist/ssr";

import { InstagramPostCard } from "@/components/social/instagram-post-card";
import type { SocialPost } from "@/lib/types/database";

export function InstagramFeedGrid({ posts }: { posts: SocialPost[] }) {
  if (posts.length === 0) {
    return (
      <div className="border-border flex flex-col items-center justify-center border border-dashed px-6 py-16 text-center">
        <div className="bg-muted text-muted-foreground mb-4 flex size-10 items-center justify-center">
          <ImageSquareIcon className="size-5" />
        </div>
        <p className="text-sm font-medium">No Instagram posts cached yet</p>
        <p className="text-muted-foreground mt-1 max-w-md text-sm">
          Configure the Meta credentials and use Refresh to cache the latest
          posts from @tdstudiosco.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <InstagramPostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
