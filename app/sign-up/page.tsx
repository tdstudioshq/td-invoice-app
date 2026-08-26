import { HomeLogoLink } from "@/components/layout/home-logo";

import { AnimatedBackground } from "@/app/login/animated-background";
import { SignUpForm } from "@/app/sign-up/sign-up-form";
import { BackToStudiosLink } from "@/components/layout/public-page-link";

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
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">
            Create your account
          </h1>
          <p className="text-muted-foreground max-w-sm text-base leading-relaxed md:text-sm">
            Create your account and we&apos;ll approve your client portal, where
            you&apos;ll find your files, projects and invoices.
          </p>
        </header>

        <SignUpForm />

        <BackToStudiosLink className="mx-auto" />
      </div>
    </main>
  );
}
