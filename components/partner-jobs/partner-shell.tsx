import Link from "next/link";
import Image from "next/image";

import { SignOutButton } from "@/components/layout/sign-out-button";

/**
 * Chrome for a print-partner portal.
 *
 * Deliberately NOT the AppShell or the PortalShell: this is a focused
 * single-purpose workspace with two destinations, so a sidebar would be mostly
 * empty. A slim header, the company's own name, and nothing from the TD Studios
 * marketing site.
 *
 * Server component — it holds no state, and keeping it one means the login
 * screen and the signed-in pages share exactly the same frame.
 */
export function PartnerShell({
  companyName,
  basePath,
  userEmail,
  signedIn = false,
  children,
}: {
  companyName: string;
  /** External link prefix — "" on the subdomain. See partnerBasePath(). */
  basePath: string;
  userEmail?: string | null;
  signedIn?: boolean;
  children: React.ReactNode;
}) {
  const home = signedIn ? `${basePath}/jobs` : `${basePath}/login`;

  return (
    <div className="flex min-h-svh w-full flex-col">
      <header className="bg-background/80 border-border sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-5xl items-center gap-3 px-[max(1rem,env(safe-area-inset-left))] pt-[env(safe-area-inset-top)]">
          <Link
            href={home || "/"}
            className="flex min-w-0 items-center gap-2.5 select-none"
          >
            <Image
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              className="size-9 shrink-0"
              priority
            />
            <span className="flex min-w-0 flex-col leading-none">
              <span className="truncate text-sm font-semibold tracking-tight">
                {companyName} Orders
              </span>
              <span className="text-muted-foreground text-[10px] tracking-[0.18em] uppercase">
                Design Jobs
              </span>
            </span>
          </Link>

          {signedIn ? (
            <div className="ml-auto flex items-center gap-3">
              {userEmail ? (
                <span className="text-muted-foreground hidden max-w-48 truncate text-xs sm:block">
                  {userEmail}
                </span>
              ) : null}
              <SignOutButton />
            </div>
          ) : null}
        </div>
      </header>

      <main className="min-w-0 flex-1 px-[max(1rem,env(safe-area-inset-left))] py-6 pb-[calc(env(safe-area-inset-bottom)_+_2rem)] md:px-8 md:py-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto w-full max-w-5xl px-[max(1rem,env(safe-area-inset-left))] py-5 text-center text-[11px]">
          Powered by TD Studios
        </div>
      </footer>
    </div>
  );
}
