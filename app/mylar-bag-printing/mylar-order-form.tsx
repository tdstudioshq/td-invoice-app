"use client";

import { useMemo, useState } from "react";
import {
  CheckCircleIcon,
  CheckIcon,
  MinusIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
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
import {
  BAG_TYPES,
  MIN_PIECES,
  PIECES_PER_POUND,
  type BagType,
} from "@/app/mylar-bag-printing/bag-types";

type Status = "idle" | "uploading" | "submitting" | "success" | "error";

/** ± nudge per click. Pounds move one at a time; pieces need a coarser step. */
const STEP = { pounds: 1, pieces: 16 } as const;

/** Floor for each mode — the same 128-bag print minimum, in that mode's unit. */
const MIN = { pounds: 1, pieces: MIN_PIECES } as const;

/**
 * Custom mylar bag order form. Shares the Formspree inbox and the private
 * `design-requests` bucket upload pipeline with /custom-design-request and
 * /how-to-order (see lib/design-request-upload.ts); only `_subject` and the
 * order fields distinguish it in the inbox.
 */
export function MylarOrderForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bagType, setBagType] = useState<BagType>(BAG_TYPES[0]);
  // Held as a string so the field can be cleared while typing; coerced on blur.
  const [quantity, setQuantity] = useState("1");

  const mode = bagType.mode;
  const min = MIN[mode];
  const value = Number.parseInt(quantity, 10);
  const amount = Number.isNaN(value) ? min : value;

  /** Total bags printed — what the shop floor actually needs to know. */
  const pieces = mode === "pounds" ? amount * PIECES_PER_POUND : amount;
  const belowMinimum = amount < min;

  const summary = useMemo(
    () =>
      mode === "pounds"
        ? `${amount} lb (${pieces.toLocaleString()} pcs)`
        : `${pieces.toLocaleString()} pcs`,
    [mode, amount, pieces],
  );

  /** Switching bag type re-bases the quantity into the new mode's unit. */
  function selectBagType(next: BagType) {
    if (next.id === bagType.id) return;
    if (next.mode !== bagType.mode) setQuantity(String(MIN[next.mode]));
    setBagType(next);
  }

  function nudge(direction: 1 | -1) {
    setQuantity(String(Math.max(min, amount + direction * STEP[mode])));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);

    if (belowMinimum) {
      setError(
        `The minimum order is ${MIN_PIECES} pcs (1 lb). Please raise the quantity.`,
      );
      setStatus("error");
      return;
    }

    try {
      const formData = new FormData(form);

      // Pull the files out of the POST body — Formspree's free plan rejects
      // any multipart submission that carries a file.
      const files = formData
        .getAll("artwork")
        .filter((v): v is File => v instanceof File && v.size > 0);
      formData.delete("artwork");

      if (files.length > 0) {
        setStatus("uploading");
        const result = await uploadAssets(files);
        if ("error" in result) {
          setError(result.error);
          setStatus("error");
          return;
        }
        formData.set(
          "artwork",
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
        setBagType(BAG_TYPES[0]);
        setQuantity("1");
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
            Thanks — I&apos;ll review your bag order and text you back shortly
            with pricing and a proof.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setStatus("idle")}
          className="border-white/15 bg-white/[0.05] text-white hover:bg-white/[0.12]"
        >
          Place another order
        </Button>
      </div>
    );
  }

  const busy = status === "uploading" || status === "submitting";

  return (
    <form
      onSubmit={handleSubmit}
      action={FORMSPREE_ENDPOINT}
      method="POST"
      encType="multipart/form-data"
      className="flex flex-col gap-7 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:p-8"
    >
      {/* Subject line for the email Formspree sends. */}
      <input type="hidden" name="_subject" value="New Mylar Bag Order" />
      {/* The two derived values, so the email reads without doing the math. */}
      <input type="hidden" name="bag_type" value={bagType.label} />
      <input type="hidden" name="quantity" value={summary} />
      <input type="hidden" name="total_bags" value={pieces} />

      {/* ---------- 1. Bag type ---------- */}
      <fieldset className="space-y-3">
        <legend className="text-white">Bag type</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {BAG_TYPES.map((type) => {
            const selected = type.id === bagType.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => selectBagType(type)}
                aria-pressed={selected}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-all active:translate-y-px ${
                  selected
                    ? "border-white/40 bg-white/[0.14] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)]"
                    : "border-white/15 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.09]"
                }`}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm leading-tight text-white">
                    {type.label}
                  </span>
                  <span className="text-muted-foreground text-xs leading-tight">
                    {type.detail}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                    selected
                      ? "border-white bg-white text-neutral-900"
                      : "border-white/25"
                  }`}
                >
                  {selected && <CheckIcon weight="bold" className="size-3" />}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ---------- 2. Quantity ---------- */}
      <div className="space-y-2">
        <Label htmlFor="quantity_amount" className="text-white">
          Quantity
        </Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => nudge(-1)}
            disabled={amount <= min}
            aria-label={`Decrease quantity by ${STEP[mode]} ${mode === "pounds" ? "lb" : "pcs"}`}
            className="size-11 shrink-0 rounded-xl border-white/15 bg-white/[0.05] p-0 text-white hover:bg-white/[0.12]"
          >
            <MinusIcon weight="bold" className="size-4" />
          </Button>

          <div className="relative flex-1">
            <Input
              id="quantity_amount"
              inputMode="numeric"
              pattern="[0-9]*"
              value={quantity}
              onChange={(e) =>
                setQuantity(e.target.value.replace(/[^0-9]/g, ""))
              }
              onBlur={() => setQuantity(String(Math.max(min, amount)))}
              aria-describedby="quantity_hint"
              className={`h-11 pr-12 text-center ${fieldClass}`}
            />
            <span
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm"
            >
              {mode === "pounds" ? "lb" : "pcs"}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => nudge(1)}
            aria-label={`Increase quantity by ${STEP[mode]} ${mode === "pounds" ? "lb" : "pcs"}`}
            className="size-11 shrink-0 rounded-xl border-white/15 bg-white/[0.05] p-0 text-white hover:bg-white/[0.12]"
          >
            <PlusIcon weight="bold" className="size-4" />
          </Button>
        </div>

        <p
          id="quantity_hint"
          className={`text-xs ${belowMinimum ? "text-red-300" : "text-muted-foreground"}`}
        >
          {mode === "pounds" ? (
            <>
              = {pieces.toLocaleString()} pcs &middot; {PIECES_PER_POUND}{" "}
              bags per lb &middot; 1 lb ({MIN_PIECES} pcs) minimum
            </>
          ) : (
            <>Counted by the bag &middot; {MIN_PIECES} pcs minimum</>
          )}
        </p>
      </div>

      {/* ---------- 3. Artwork ---------- */}
      <div className="space-y-1.5">
        <Label htmlFor="artwork" className="text-white">
          Artwork
        </Label>
        <Input
          id="artwork"
          name="artwork"
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className={`h-auto py-2.5 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-sm file:text-white ${fieldClass}`}
        />
        <p className="text-muted-foreground text-xs">
          Print-ready files, logos, QR codes or reference images.{" "}
          {ALLOWED_TYPES_LABEL} files, up to 25 MB each — you can select
          multiple. No artwork yet? Leave this empty and say so in the notes.
        </p>
      </div>

      {/* ---------- 4. Notes ---------- */}
      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-white">
          Notes
        </Label>
        <Textarea
          id="notes"
          name="notes"
          rows={5}
          placeholder="Strain names, finish (matte / gloss / holographic), colors, deadlines, and anything else I should know."
          className={`min-h-28 py-2.5 ${fieldClass}`}
        />
      </div>

      {/* ---------- 5. Contact ---------- */}
      <fieldset className="space-y-3">
        <legend className="text-white">Contact information</legend>
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
            <Label htmlFor="email" className="text-white">
              Email{" "}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={`h-11 ${fieldClass}`}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instagram" className="text-white">
              Instagram{" "}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="instagram"
              name="instagram"
              type="text"
              placeholder="@yourhandle"
              className={`h-11 ${fieldClass}`}
            />
          </div>
        </div>
      </fieldset>

      {status === "error" && error && (
        <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
          <WarningCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {/* Restate the order right above the button — the two choices live far
          enough apart on mobile that they scroll out of view before submit. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3">
        <span className="text-muted-foreground text-xs">Your order</span>
        <span className="text-right text-sm leading-tight text-white">
          {bagType.label} &middot; {summary}
        </span>
      </div>

      <Button
        type="submit"
        disabled={busy}
        className="h-11 w-full gap-2 bg-white text-neutral-900 hover:bg-white/90"
      >
        <PaperPlaneTiltIcon weight="bold" className="size-4" />
        {status === "uploading"
          ? "Uploading artwork…"
          : status === "submitting"
            ? "Sending…"
            : "Place Order"}
      </Button>
    </form>
  );
}
