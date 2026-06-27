import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ImagesIcon,
  LinkIcon,
  PaintBrushIcon,
  QrCodeIcon,
  SignOutIcon,
} from "@phosphor-icons/react/dist/ssr";

import { AccountProfileForm } from "@/app/(customer)/account/account-profile-form";
import { signOutAction } from "@/app/actions/auth";
import { requireCustomer } from "@/lib/auth";

export const metadata = { title: "Your account" };

const linkClass =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:border-white/25 hover:bg-white/[0.12]";

export default async function AccountPage() {
  const ctx = await requireCustomer();
  if (!ctx) {
    return (
      <p className="text-muted-foreground text-center text-sm">
        Accounts are unavailable until Supabase is configured.
      </p>
    );
  }
  // A customer who hasn't finished onboarding has no profile to show yet.
  if (!ctx.profile?.onboardedAt) redirect("/onboarding");

  const { profile } = ctx;

  return (
    <>
      <header className="flex flex-col items-center gap-3 text-center">
        <Image
          src="/logo.png"
          alt="TD Studios"
          width={56}
          height={56}
          priority
          className="size-14 rounded-full shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)] ring-1 ring-white/25"
        />
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {profile.fullName ? `Welcome, ${profile.fullName}` : "Your account"}
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage your TD Studios profile and start a new project.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-white">Quick actions</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/link-builder" className={linkClass}>
            <LinkIcon weight="bold" className="size-4" />
            Manage bio page
          </Link>
          <Link href="/custom-design-request" className={linkClass}>
            <PaintBrushIcon weight="bold" className="size-4" />
            Request a design
          </Link>
          <Link href="/qr-generator/designs" className={linkClass}>
            <ImagesIcon weight="bold" className="size-4" />
            Premade designs
          </Link>
          <Link href="/qr-generator" className={linkClass}>
            <QrCodeIcon weight="bold" className="size-4" />
            QR generator
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-white">Your profile</h2>
        <AccountProfileForm
          profile={{
            fullName: profile.fullName,
            email: profile.email,
            phone: profile.phone,
            instagram: profile.instagram,
            businessName: profile.businessName,
          }}
        />
      </section>

      <form action={signOutAction} className="flex justify-center">
        <button
          type="submit"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <SignOutIcon weight="bold" className="size-3.5" />
          Sign out
        </button>
      </form>
    </>
  );
}
