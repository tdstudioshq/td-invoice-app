import { redirect } from "next/navigation";

import { AnimatedBackground } from "@/app/login/animated-background";
import { HomeCard } from "@/app/home-card";
import { HomeMobileBackground } from "@/app/home-mobile-background";

export const metadata = { title: "TD Studios" };

// The homepage is a public "link in bio" card. Its Admin button flips the card
// into the sign-in form in place (no navigation); /login keeps the standalone
// AuthScreen for direct sign-in links and post-reset redirects.
export default async function Home(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const target = typeof sp.redirect === "string" ? sp.redirect : undefined;
  const justReset = sp.reset === "success";

  // If Supabase's Redirect URLs allowlist is missing /auth/callback, OAuth
  // falls back to the Site URL (here) with the PKCE `?code=` attached. Forward
  // it to the real callback so the exchange + role routing still happen.
  const code = typeof sp.code === "string" ? sp.code : undefined;
  if (code) {
    const params = new URLSearchParams({ code });
    if (target) params.set("redirect", target);
    redirect(`/auth/callback?${params.toString()}`);
  }

  return (
    // `min-h-svh`, not `dvh`/`vh`: the *small* viewport height is the one that
    // holds while Safari's address bar is expanded, so the card is never sized
    // against space the browser is about to take back. Anything taller than the
    // shell simply scrolls. `.home-shell` supplies the padding — safe-area aware
    // on phones, the original `px-4 py-12` box from `md` up.
    <main className="on-glass home-shell relative flex min-h-svh flex-col items-center justify-center overflow-hidden">
      {/* Mobile gets the scratch-off ticket art; md+ keeps the animated diamonds. */}
      <HomeMobileBackground />
      <div className="absolute inset-0 hidden md:block">
        <AnimatedBackground dimmed={false} />
      </div>
      <div className="home-card-slot relative z-10 w-full max-w-[26rem] md:max-w-sm">
        <HomeCard redirectTo={target} justReset={justReset} />
      </div>
      {/* Landing room for the floating Mylar CTA, so the last bio button is
          still reachable at the bottom of the scroll. It doubles as the nudge
          that lifts the card off dead-centre on phones, which is where a
          link-in-bio card wants to sit. `h-16` is the tall-phone value and the
          fallback; `--home-cta-room` (declared on `.home-shell` alongside the
          rest of the card's viewport-height scale) shrinks it on short screens,
          where this strip is the cheapest space to give back. Removed from the
          flow at `md`, leaving the desktop composition byte-identical. */}
      <div aria-hidden className="home-cta-room h-16 shrink-0 md:hidden" />
    </main>
  );
}
