"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(
      new FormData(event.currentTarget).get("email") ?? "",
    ).trim();
    if (!email) return;

    setSubmitting(true);
    try {
      const supabase = createClient();
      // redirectTo uses the current origin so it works in local + production
      // (both must be allow-listed in Supabase → Auth → URL Configuration).
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // Swallow errors — never reveal whether an email is registered.
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          If an account exists for that email, a password reset link is on its
          way. Check your inbox and spam folder.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onBack}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={submitting}
        aria-disabled={submitting}
      >
        {submitting ? "Sending…" : "Send reset link"}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground block w-full text-center text-xs underline-offset-4 hover:underline"
      >
        Back to sign in
      </button>
    </form>
  );
}
