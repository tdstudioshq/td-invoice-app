import { HomeLogoLink } from "@/components/layout/home-logo";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { SignUpForm } from "@/app/sign-up/sign-up-form";

export const metadata = {
  title: "Create account",
  description:
    "Create a TD Studios account to request access to your own client portal.",
};

// Public, no-auth customer self-signup: the front door to a client portal.
// Creates a Supabase Auth user with NO role — admins are a separate server-side
// allowlist, and portal access is a client_users row an admin creates on
// approval. Until then the account can only reach /account/pending.
export default function SignUpPage() {
  return (
    <main className="on-glass relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Create your account
          </h1>
          <p className="text-muted-foreground max-w-sm text-sm">
            Create your account and we&apos;ll approve your client portal, where
            you&apos;ll find your files, projects and invoices.
          </p>
        </header>

        <SignUpForm />

        <Link
          href="/"
          className="text-on-photo text-muted-foreground hover:text-foreground mx-auto inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <ArrowLeftIcon weight="bold" className="size-3.5" />
          Back to TD Studios
        </Link>
      </div>
    </main>
  );
}
