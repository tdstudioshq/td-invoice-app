import { PageHeader } from "@/components/layout/page-header";
import { InstagramAccountCard } from "@/components/social/instagram-account-card";
import { InstagramFeedGrid } from "@/components/social/instagram-feed-grid";
import { getInstagramConfiguration } from "@/lib/social/instagram";
import { getSocialHubData } from "@/lib/social/data";

export const metadata = { title: "Social Hub" };

export default async function SocialPage() {
  const instagram = getInstagramConfiguration();
  const social = await getSocialHubData();

  return (
    <>
      <PageHeader
        title="Social Hub"
        description="Monitor connected social accounts and cache recent content."
      />

      <div className="space-y-8">
        <InstagramAccountCard
          account={social.account}
          latestSync={social.latestSync}
          configured={instagram.configured}
          graphApiVersion={instagram.graphApiVersion}
        />

        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Latest Instagram posts</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Read-only content cached from the official Instagram API.
            </p>
          </div>
          <InstagramFeedGrid posts={social.posts} />
        </section>
      </div>
    </>
  );
}
