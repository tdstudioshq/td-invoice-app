"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { BackspaceIcon } from "@phosphor-icons/react";

import { enterTasteBudzCodeAction } from "@/app/taste-budz/access";
import { cn } from "@/lib/utils";

const CODE_LENGTH = 4;

/**
 * Phone-style keypad gate. Collects a 4-digit code and auto-submits it to the
 * server action, which validates and sets the access cookie; on success the
 * revalidated /taste-budz re-renders with the gallery.
 */
export function TasteBudzKeypad({ logoUrl }: { logoUrl: string }) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [pending, startTransition] = useTransition();
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
    },
    [],
  );

  const submit = useCallback((code: string) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("code", code);
      const result = await enterTasteBudzCodeAction({}, formData);
      if (result.error) {
        setError(result.error);
        setDigits("");
        setShake(true);
        if (shakeTimer.current) clearTimeout(shakeTimer.current);
        shakeTimer.current = setTimeout(() => setShake(false), 500);
      }
      // On success revalidatePath re-renders the server page to the gallery.
    });
  }, []);

  const press = (d: string) => {
    // Compute the next code here in the event handler — never inside the
    // setState updater, which React may run during render.
    if (pending || digits.length >= CODE_LENGTH) return;
    setError(null);
    const next = digits + d;
    setDigits(next);
    if (next.length === CODE_LENGTH) submit(next);
  };
  const backspace = () => setDigits((cur) => cur.slice(0, -1));

  return (
    <div className="flex flex-col items-center gap-8">
      <img src={logoUrl} alt="TASTE BUDZ" className="w-full max-w-xs" />

      <div className="flex flex-col items-center gap-6">
        <div
          className={cn(
            "flex items-center gap-4",
            shake && "animate-[shake_0.4s_ease-in-out]",
          )}
          aria-label="Entry code"
        >
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-4 rounded-full border border-white/40 transition-colors",
                i < digits.length && "border-red-500 bg-red-500",
              )}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <KeypadButton key={d} onClick={() => press(d)} disabled={pending}>
              {d}
            </KeypadButton>
          ))}
          <span />
          <KeypadButton onClick={() => press("0")} disabled={pending}>
            0
          </KeypadButton>
          <KeypadButton
            onClick={backspace}
            disabled={pending || digits.length === 0}
            aria-label="Delete last digit"
          >
            <BackspaceIcon className="size-6" />
          </KeypadButton>
        </div>

        <p
          className={cn("h-4 text-xs", error ? "text-red-400" : "text-white/50")}
          role={error ? "alert" : undefined}
        >
          {pending ? "Checking…" : (error ?? "Enter the code to come inside.")}
        </p>
      </div>

      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
    </div>
  );
}

function KeypadButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex size-16 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-xl font-semibold text-white backdrop-blur-md transition-all",
        "hover:border-white/30 hover:bg-white/[0.12] active:scale-95 disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
