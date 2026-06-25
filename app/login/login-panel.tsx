"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
    <Card className="relative overflow-hidden rounded-3xl border border-white/20 bg-white/[0.035] shadow-[0_22px_55px_-12px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.35),inset_0_0_0_1px_rgba(255,255,255,0.04)] ring-0 backdrop-blur-xl backdrop-saturate-150 before:pointer-events-none before:absolute before:inset-0 before:rounded-3xl before:bg-gradient-to-b before:from-white/[0.20] before:via-white/[0.03] before:to-transparent before:content-[''] after:pointer-events-none after:absolute after:inset-0 after:rounded-3xl after:bg-[linear-gradient(120deg,transparent_30%,rgba(255,255,255,0.16)_42%,rgba(255,255,255,0.05)_50%,transparent_60%)] after:content-['']">
      <CardHeader className="relative z-10 flex flex-col items-center gap-2 text-center">
        <Image
          src="/logo.png"
          alt="TD Studios"
          width={56}
          height={56}
          priority
          className="size-14 rounded-full shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)] ring-1 ring-white/25"
        />
        <CardTitle>{isSignin ? "Sign in" : "Reset password"}</CardTitle>
        <CardDescription>
          {isSignin
            ? "Access your TD Studios invoicing workspace."
            : "Enter your email and we'll send you a reset link."}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative z-10">
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
