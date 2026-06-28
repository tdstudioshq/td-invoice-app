import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { BioBuilder } from "@/app/link-builder/bio-builder";
import {
  getCustomerProfile,
  getPortalContext,
  getUser,
  isAdminEmail,
} from "@/lib/auth";
import { getBioAvatarUrl, getMyBioPage } from "@/lib/data";
import { getSiteUrl } from "@/lib/email/client";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = {
  title: "Bio Page Builder",
  description:
    "Create your own TD Studios bio page — a single link to share all of yours.",
};

export default async function LinkBuilderPage() {
  if (!isSupabaseConfigured()) {
    return (
      <p className="text-muted-foreground text-center text-sm">
        The bio page builder is unavailable until Supabase is configured.
      </p>
    );
  }

  // Step 1 — Account. The proxy already redirected anonymous users to login;
  // re-check here for defense in depth and to apply the onboarding gate.
  const user = await getUser();
  if (!user) redirect("/login?redirect=/link-builder");

  // Customers (not admins, not portal users) must finish onboarding first.
  if (!isAdminEmail(user.email) && !(await getPortalContext())) {
    const profile = await getCustomerProfile(user.id);
    if (!profile?.onboardedAt) redirect("/onboarding");
  }

  const page = await getMyBioPage();
  const avatarUrl = await getBioAvatarUrl(page?.avatar_path ?? null);
  // Where the back link / post-publish flow points for this user's role.
  const accountHref = isAdminEmail(user.email) ? "/dashboard" : "/account";

  return (
    <>
      <header className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 text-center">
        <Image
          src="/logo.png"
          alt="TD Studios"
          width={56}
          height={56}
          priority
          className="size-14 rounded-full shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)] ring-1 ring-white/25"
        />
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {page ? "Your Bio Page" : "Create your Bio Page"}
        </h1>
        <p className="text-muted-foreground max-w-md text-sm">
          {page
            ? "Edit your profile, links, and theme — then publish to share."
            : "Claim your username and build a single link for all of yours."}
        </p>
      </header>

      <BioBuilder page={page} avatarUrl={avatarUrl} siteOrigin={getSiteUrl()} />

      <Link
        href={accountHref}
        className="text-muted-foreground hover:text-foreground mx-auto inline-flex items-center gap-1.5 text-xs transition-colors"
      >
        <ArrowLeftIcon weight="bold" className="size-3.5" />
        Back
      </Link>
    </>
  );
}
