import { redirect } from "next/navigation";

import { AnimatedBackground } from "@/app/login/animated-background";
import { HomeCard } from "@/app/home-card";

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
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 w-full max-w-sm">
        <HomeCard redirectTo={target} justReset={justReset} />
      </div>
    </main>
  );
}
