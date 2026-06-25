"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Database } from "@/lib/types/database";

type Phase = "verifying" | "ready" | "invalid";

export function ResetPasswordForm() {
  const router = useRouter();

  // Dedicated client with detectSessionInUrl disabled so we parse the recovery
  // hash ourselves (deterministic), rather than racing the auto-detector.
  const supabase = useMemo(
    () =>
      createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { detectSessionInUrl: false } },
      ),
    [],
  );

  const [phase, setPhase] = useState<Phase>("verifying");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function init() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      // Supabase reports failures (expired/used link) in the hash.
      const errText = hash.get("error_description") ?? hash.get("error");
      if (errText) {
        if (active) {
          setReason(errText.replace(/\+/g, " "));
          setPhase("invalid");
        }
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!active) return;
        if (sessionError) {
          setReason(sessionError.message);
          setPhase("invalid");
          return;
        }
        // Strip the tokens from the URL so they don't linger in history.
        window.history.replaceState(null, "", window.location.pathname);
        setPhase("ready");
        return;
      }

      // No recovery tokens — allow an already-signed-in user to set a password.
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        setPhase("ready");
      } else {
        setReason("This reset link is invalid or has expired.");
        setPhase("invalid");
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSubmitting(false);
      setError(updateError.message);
      toast.error(updateError.message);
      return;
    }

    // Clear the recovery session, then send them to sign in fresh.
    await supabase.auth.signOut();
    toast.success("Password updated. Please sign in.");
    router.replace("/login?reset=success");
  }

  if (phase === "verifying") {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Verifying reset link…
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-destructive">{reason}</p>
        <p className="text-muted-foreground">
          Request a new reset link from the sign-in page.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <Button
        type="submit"
        className="w-full"
        disabled={submitting}
        aria-disabled={submitting}
      >
        {submitting ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
