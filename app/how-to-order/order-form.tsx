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
import {
  FORMSPREE_ENDPOINT,
  formFieldClass as fieldClass,
  uploadDesignRequestAssets as uploadAssets,
} from "@/lib/design-request-upload";
import { ACCEPT_ATTRIBUTE, ALLOWED_TYPES_LABEL } from "@/lib/uploads";

type Status = "idle" | "uploading" | "submitting" | "success" | "error";

/**
 * The step 3 submission form: notes, asset upload, and contact details. Shares
 * the Formspree inbox and the private-bucket upload pipeline with
 * /custom-design-request (see lib/design-request-upload.ts); only `_subject`
 * distinguishes the two in the inbox.
 */
export function OrderForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);

    try {
      const formData = new FormData(form);

      // Pull the files out of the POST body — Formspree's free plan rejects
      // any multipart submission that carries a file.
      const files = formData
        .getAll("assets")
        .filter((v): v is File => v instanceof File && v.size > 0);
      formData.delete("assets");

      if (files.length > 0) {
        setStatus("uploading");
        const result = await uploadAssets(files);
        if ("error" in result) {
          setError(result.error);
          setStatus("error");
          return;
        }
        formData.set(
          "assets",
          result.links.map((link) => `${link.name}: ${link.url}`).join("\n\n"),
        );
      }

      setStatus("submitting");
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        body: formData,
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
        <CheckCircleIcon weight="fill" className="size-12 text-emerald-400" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Order sent!</h2>
          <p className="text-muted-foreground text-sm">
            Thanks — I&apos;ll review your order and text you back shortly.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setStatus("idle")}
          className="border-white/15 bg-white/[0.05] text-white hover:bg-white/[0.12]"
        >
          Send another order
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
      <input type="hidden" name="_subject" value="New Order Request" />

      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-white">
          Additional notes
        </Label>
        <Textarea
          id="notes"
          name="notes"
          rows={5}
          placeholder="Which designs are you ordering, how many, and anything else I should know."
          className={`min-h-28 py-2.5 ${fieldClass}`}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="assets" className="text-white">
          Upload your files
        </Label>
        <Input
          id="assets"
          name="assets"
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className={`h-auto py-2.5 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-sm file:text-white ${fieldClass}`}
        />
        <p className="text-muted-foreground text-xs">
          Screenshots, logos, QR codes and any other assets. {ALLOWED_TYPES_LABEL}{" "}
          files, up to 25 MB each — you can select multiple.
        </p>
      </div>

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
          <Label htmlFor="instagram" className="text-white">
            Instagram name
          </Label>
          <Input
            id="instagram"
            name="instagram"
            type="text"
            placeholder="@yourhandle"
            className={`h-11 ${fieldClass}`}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
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
      </div>

      {status === "error" && error && (
        <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
          <WarningCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={status === "uploading" || status === "submitting"}
        className="h-11 w-full gap-2 bg-white text-neutral-900 hover:bg-white/90"
      >
        <PaperPlaneTiltIcon weight="bold" className="size-4" />
        {status === "uploading"
          ? "Uploading files…"
          : status === "submitting"
            ? "Sending…"
            : "Send Order"}
      </Button>
    </form>
  );
}
