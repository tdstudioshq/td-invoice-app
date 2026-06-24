import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { Brand } from "@/components/layout/brand";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  // Already signed in — skip the form.
  if (await getUser()) redirect("/dashboard");

  const { redirect: redirectTo } = await props.searchParams;
  const target = typeof redirectTo === "string" ? redirectTo : undefined;

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Brand />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Access your TD Studios invoicing workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm redirectTo={target} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
