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

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 w-full max-w-sm">
        <HomeCard redirectTo={target} justReset={justReset} />
      </div>
    </main>
  );
}
