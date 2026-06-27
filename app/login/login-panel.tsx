"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { GlassCard } from "@developer-hub/liquid-glass";
import { toast } from "sonner";

import { ForgotPasswordForm } from "@/app/login/forgot-password-form";
import { LoginForm } from "@/app/login/login-form";
import { CardDescription, CardTitle } from "@/components/ui/card";

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
    <GlassCard
      shadowMode
      cornerRadius={24}
      padding="0px"
      className="flex w-full justify-center"
    >
      <div className="flex flex-col gap-6 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
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
        </div>
        {isSignin ? (
          <LoginForm redirectTo={redirectTo} onForgot={() => setMode("forgot")} />
        ) : (
          <ForgotPasswordForm onBack={() => setMode("signin")} />
        )}
      </div>
    </GlassCard>
  );
}
