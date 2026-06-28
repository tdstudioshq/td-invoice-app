import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { BioPageRender } from "@/components/bio/bio-page-render";
import { getPublicBioPage } from "@/lib/data";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// Public, no-auth bio page. Reads only PUBLISHED pages + VISIBLE links through
// the SECURITY DEFINER helpers (see getPublicBioPage). Allow-listed in proxy.ts.
// Rendering is delegated to <BioPageRender>, the same component the builder's
// live preview uses — so what the owner sees while editing is exactly this.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const data = await getPublicBioPage(username);
  if (!data) return { title: "Page not found" };
  const name = data.page.display_name || `@${data.page.username}`;
  return {
    title: `${name} · TD Studios`,
    description: data.page.bio ?? `${name} on TD Studios`,
  };
}

export default async function PublicBioPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  if (!isSupabaseConfigured()) notFound();

  const data = await getPublicBioPage(username);
  if (!data) notFound();

  const { page, links, avatarUrl } = data;

  // Best-effort view logging — never blocks the render.
  try {
    const headerList = await headers();
    const supabase = await createClient();
    await supabase.rpc("log_bio_page_view", {
      p_page_id: page.id,
      p_referrer: headerList.get("referer"),
      p_user_agent: headerList.get("user-agent"),
    });
  } catch {
    /* analytics are best-effort */
  }

  return (
    <main className="flex min-h-svh flex-col">
      <BioPageRender
        page={page}
        links={links}
        avatarUrl={avatarUrl}
        footer={
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-white/40 transition-colors hover:text-white/70"
          >
            <Image
              src="/logo.png"
              alt=""
              width={16}
              height={16}
              className="size-4 rounded-full"
            />
            Built with TD Studios
          </Link>
        }
      />
    </main>
  );
}
