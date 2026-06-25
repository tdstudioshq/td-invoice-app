import { redirect } from "next/navigation";

import { LoginPanel } from "@/app/login/login-panel";
import { Brand } from "@/components/layout/brand";
import { getUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  // Already signed in — skip the form.
  if (await getUser()) redirect("/dashboard");

  const sp = await props.searchParams;
  const target = typeof sp.redirect === "string" ? sp.redirect : undefined;
  const justReset = sp.reset === "success";

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Brand />
        </div>
        <LoginPanel redirectTo={target} justReset={justReset} />
      </div>
    </main>
  );
}
