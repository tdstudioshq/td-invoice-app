import { AuthScreen } from "@/app/login/login-screen";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const target = typeof sp.redirect === "string" ? sp.redirect : undefined;
  const justReset = sp.reset === "success";

  return <AuthScreen redirectTo={target} justReset={justReset} />;
}
