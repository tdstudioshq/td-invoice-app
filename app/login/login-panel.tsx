"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ForgotPasswordForm } from "@/app/login/forgot-password-form";
import { LoginForm } from "@/app/login/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginPanel({
  redirectTo,
  justReset,
}: {
  redirectTo?: string;
  justReset?: boolean;
}) {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");

  useEffect(() => {
    if (justReset) {
      toast.success("Password updated. Sign in with your new password.");
    }
  }, [justReset]);

  const isSignin = mode === "signin";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isSignin ? "Sign in" : "Reset password"}</CardTitle>
        <CardDescription>
          {isSignin
            ? "Access your TD Studios invoicing workspace."
            : "Enter your email and we'll send you a reset link."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isSignin ? (
          <LoginForm
            redirectTo={redirectTo}
            onForgot={() => setMode("forgot")}
          />
        ) : (
          <ForgotPasswordForm onBack={() => setMode("signin")} />
        )}
      </CardContent>
    </Card>
  );
}
