import { redirect } from "next/navigation";

import { HomeCard } from "@/app/home-card";
import styles from "./home.module.css";

export const metadata = { title: "TD Studios" };

// Public studio links; preserve the in-place sign-in after password recovery.
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
    <main className={`on-glass ${styles.shell}`}>
      <HomeCard redirectTo={target} justReset={justReset} />
    </main>
  );
}
