"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircleIcon,
  PaperPlaneTiltIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitCustomDesignRequestAction } from "@/app/actions/design-requests";
import {
  formFieldClass as fieldClass,
  uploadDesignRequestAssets as uploadAssets,
} from "@/lib/design-request-upload";
import { ACCEPT_ATTRIBUTE, ALLOWED_TYPES_LABEL } from "@/lib/uploads";

type Status = "idle" | "uploading" | "submitting" | "success" | "error";

export function CustomDesignForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);

    try {
      const formData = new FormData(form);

      const files = formData
        .getAll("assets")
        .filter((v): v is File => v instanceof File && v.size > 0);
      let requestId: string | null =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : null;
      let uploadedAssets: {
        path: string;
        name: string;
        size: number;
        mimeType: string;
      }[] = [];

      if (files.length > 0) {
        setStatus("uploading");
        const result = await uploadAssets(files);
        if ("error" in result) {
          setError(result.error);
          setStatus("error");
          return;
        }
        requestId = result.requestId;
        uploadedAssets = result.files;
      }

      setStatus("submitting");
      const response = await submitCustomDesignRequestAction({
        requestId,
        customerName: String(formData.get("name") ?? ""),
        customerEmail: String(formData.get("email") ?? ""),
        customerPhone: String(formData.get("phone") ?? ""),
        instagramUsername: String(formData.get("instagram") ?? ""),
        designType: String(formData.get("design_type") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        assets: uploadedAssets,
        website: String(formData.get("website") ?? ""),
        startedAt: startedAt.current ?? Date.now(),
      });

      if ("error" in response) {
        setError(response.error);
        setStatus("error");
        return;
      }

      form.reset();
      setReferenceNumber(response.referenceNumber);
      setStatus("success");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/40 p-8 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md">
        <CheckCircleIcon
          weight="fill"
          className="size-14 text-emerald-400 md:size-12"
        />
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-white md:text-lg">Request sent!</h2>
          <p className="text-muted-foreground text-sm">
            Thanks — we&apos;ll review your custom design request and get back to
            you shortly.
          </p>
          {referenceNumber ? (
            <p className="text-sm text-white/70 md:text-xs">
              Reference: <span className="font-medium text-white">{referenceNumber}</span>
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            startedAt.current = Date.now();
            setReferenceNumber(null);
            setStatus("idle");
          }}
          className="border-white/15 bg-black/35 text-white hover:bg-black/25"
        >
          Submit another request
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-black/40 p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:p-8"
    >
      <div className="absolute left-[-10000px] top-auto size-px overflow-hidden" aria-hidden="true">
        <label htmlFor="custom-design-website">Website</label>
        <input
          id="custom-design-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
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
            className={`h-12 md:h-11 ${fieldClass}`}
          />
        </div>

        <div className="flex flex-col gap-2">
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
            className={`h-12 md:h-11 ${fieldClass}`}
          />
        </div>

        <div className="flex flex-col gap-2">
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
            className={`h-12 md:h-11 ${fieldClass}`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="instagram" className="text-white">
            Instagram username
          </Label>
          <Input
            id="instagram"
            name="instagram"
            type="text"
            required
            placeholder="@yourhandle"
            className={`h-12 md:h-11 ${fieldClass}`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="design_type" className="text-white">
          Design type
        </Label>
        <select
          id="design_type"
          name="design_type"
          required
          defaultValue=""
          className={`h-12 w-full appearance-none rounded-xl border bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat md:h-11 ${fieldClass}`}
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

      <div className="flex flex-col gap-2">
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="assets" className="text-white">
          Logos / assets / references
        </Label>
        <Input
          id="assets"
          name="assets"
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className={`h-auto py-2.5 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white ${fieldClass}`}
        />
        <p className="text-muted-foreground text-sm leading-relaxed md:text-xs">
          {ALLOWED_TYPES_LABEL} files, up to 25 MB each. You can select
          multiple.
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
        disabled={status === "uploading" || status === "submitting"}
        className="h-12 w-full gap-2 text-base bg-white text-neutral-900 hover:bg-white/90 md:h-11 md:text-[15px]"
      >
        <PaperPlaneTiltIcon weight="bold" className="size-4" />
        {status === "uploading"
          ? "Uploading files…"
          : status === "submitting"
            ? "Sending…"
            : "Send Request"}
      </Button>
    </form>
  );
}
