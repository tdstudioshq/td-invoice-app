import { AuthScreen } from "@/app/login/login-screen";

export const metadata = { title: "Sign in" };

// The homepage is the TD Studios sign-in screen (same component as /login).
export default async function Home(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const target = typeof sp.redirect === "string" ? sp.redirect : undefined;
  const justReset = sp.reset === "success";

  return <AuthScreen redirectTo={target} justReset={justReset} />;
}
