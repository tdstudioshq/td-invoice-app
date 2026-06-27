"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  PaperPlaneTiltIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const FORMSPREE_ENDPOINT = "https://formspree.io/f/movkvrpz";

// Accepted upload types: images, PDFs, and common design source files. The
// browser only surfaces what it recognizes — extensions cover formats with no
// reliable MIME type (AI/EPS/PSD).
const FILE_ACCEPT =
  "image/*,application/pdf,.ai,.eps,.psd,.svg,application/postscript,application/illustrator,application/vnd.adobe.photoshop,image/svg+xml";

const fieldClass =
  "rounded-xl border-white/15 bg-white/[0.05] px-3.5 text-white placeholder:text-white/40 dark:bg-white/[0.05]";

type Status = "idle" | "submitting" | "success" | "error";

export function CustomDesignForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        form.reset();
        setStatus("success");
        return;
      }

      const data = (await response.json().catch(() => null)) as {
        errors?: { message: string }[];
      } | null;
      setError(
        data?.errors?.map((e) => e.message).join(", ") ||
          "Something went wrong. Please try again.",
      );
      setStatus("error");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md">
        <CheckCircleIcon
          weight="fill"
          className="size-12 text-emerald-400"
        />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Request sent!</h2>
          <p className="text-muted-foreground text-sm">
            Thanks — we&apos;ll review your custom design request and get back to
            you shortly.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setStatus("idle")}
          className="border-white/15 bg-white/[0.05] text-white hover:bg-white/[0.12]"
        >
          Submit another request
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      action={FORMSPREE_ENDPOINT}
      method="POST"
      encType="multipart/form-data"
      className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:p-8"
    >
      {/* Subject line for the email Formspree sends. */}
      <input type="hidden" name="_subject" value="New Custom Design Request" />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-white">
            Name
          </Label>
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            placeholder="Your full name"
            className={`h-11 ${fieldClass}`}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-white">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className={`h-11 ${fieldClass}`}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-white">
            Phone number
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            placeholder="(555) 555-5555"
            className={`h-11 ${fieldClass}`}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="instagram" className="text-white">
            Instagram username
          </Label>
          <Input
            id="instagram"
            name="instagram"
            type="text"
            required
            placeholder="@yourhandle"
            className={`h-11 ${fieldClass}`}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="design_type" className="text-white">
          Design type
        </Label>
        <select
          id="design_type"
          name="design_type"
          required
          defaultValue=""
          className={`h-11 w-full appearance-none rounded-xl border bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat ${fieldClass}`}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
          }}
        >
          <option value="" disabled className="bg-neutral-900 text-white">
            Select a design type
          </option>
          <option value="Bag design" className="bg-neutral-900 text-white">
            Bag design
          </option>
          <option value="Jar design" className="bg-neutral-900 text-white">
            Jar design
          </option>
          <option value="Other" className="bg-neutral-900 text-white">
            Other
          </option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-white">
          Project notes / request details
        </Label>
        <Textarea
          id="notes"
          name="notes"
          required
          rows={5}
          placeholder="Tell us about your project — colors, style, quantity, deadlines, and anything else we should know."
          className={`min-h-28 py-2.5 ${fieldClass}`}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="assets" className="text-white">
          Logos / assets / references
        </Label>
        <Input
          id="assets"
          name="assets"
          type="file"
          multiple
          accept={FILE_ACCEPT}
          className={`h-auto py-2.5 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-sm file:text-white ${fieldClass}`}
        />
        <p className="text-muted-foreground text-xs">
          Images, PDFs, and AI/PSD/EPS/SVG files. You can select multiple.
        </p>
      </div>

      {status === "error" && error && (
        <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
          <WarningCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={status === "submitting"}
        className="h-11 w-full gap-2 bg-white text-neutral-900 hover:bg-white/90"
      >
        <PaperPlaneTiltIcon weight="bold" className="size-4" />
        {status === "submitting" ? "Sending…" : "Send Request"}
      </Button>
    </form>
  );
}
