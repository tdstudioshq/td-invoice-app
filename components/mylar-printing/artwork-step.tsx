"use client";

import { PlusIcon, TrashIcon, CheckCircleIcon } from "@phosphor-icons/react";

import { ArtworkUploader } from "@/components/mylar-printing/artwork-uploader";
import { StepHeading, fieldClass } from "@/components/mylar-printing/wizard-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ARTWORK_TYPES_LABEL,
  MAX_ARTWORK_BYTES,
  formatArtworkBytes,
} from "@/lib/mylar-printing/artwork";
import { allocationError, totalAllocated } from "@/lib/mylar-printing/schema";
import {
  MAX_DESIGNS_PER_ORDER,
  type MylarArtworkFile,
  type MylarArtworkSide,
  type MylarDesignDraft,
} from "@/lib/mylar-printing/types";
import { cn } from "@/lib/utils";

/**
 * Step 4 — the designs in the order, each with its own allocation and artwork.
 *
 * The order's TOTAL quantity was set on step 2; this step is where it gets
 * split. Designs are seeded from the count given on step 3 with the quantity
 * distributed evenly, so the common case — one design, everything allocated to
 * it — needs no numeric input at all, and a customer who said "4 designs" finds
 * four cards already waiting rather than an "Add another design" button pressed
 * four times.
 *
 * Artwork stays optional: plenty of orders start before the files are ready, so
 * "I'll send my artwork later" lets the request through with nothing attached.
 * The ALLOCATION is not optional either way — deferring the artwork still
 * records which design gets how many bags, because that is what gets quoted.
 */
export function ArtworkStep({
  designs,
  orderQuantity,
  comingLater,
  inquiryId,
  showAllErrors,
  onArtworkChange,
  onQuantityChange,
  onAddDesign,
  onRemoveDesign,
  onComingLaterChange,
}: {
  designs: MylarDesignDraft[];
  orderQuantity: number;
  comingLater: boolean;
  inquiryId: string | null;
  showAllErrors: boolean;
  onArtworkChange: (
    designId: string,
    side: MylarArtworkSide,
    inquiryId: string | null,
    file: MylarArtworkFile | undefined,
  ) => void;
  onQuantityChange: (designId: string, quantity: number) => void;
  onAddDesign: () => void;
  onRemoveDesign: (designId: string) => void;
  onComingLaterChange: (comingLater: boolean) => void;
}) {
  const allocated = totalAllocated(designs);
  const remaining = orderQuantity - allocated;
  const problem = allocationError(designs, orderQuantity);
  const balanced = problem === null;
  const single = designs.length === 1;

  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        title="Upload your artwork"
        subtitle={
          single
            ? "Upload the front and back artwork you want printed."
            : "Split your order between your designs, and upload the artwork for each."
        }
      />

      {/*
        Allocation ledger. Live, and above the designs rather than below them,
        so the customer can see what is left to assign while they are typing
        into the fields that change it.

        The three figures are hidden for a single design: there is nothing to
        allocate, the one card already holds the whole order, and showing
        "1,000 / 1,000" to somebody who never asked for a split is noise.

        An allocation PROBLEM is never hidden, though — see the fail-safe below.
        A single design that has somehow fallen out of step with the order total
        blocks Continue, and hiding the reason (as this did) left the customer
        staring at a dead button with no explanation and no visible control.
      */}
      {!single ? (
        <div
          className="rounded-2xl border border-white/12 bg-black/35 p-4 sm:p-5"
          aria-live="polite"
        >
          <div className="grid grid-cols-3 gap-3 text-center">
            <Figure label="Order Quantity" value={orderQuantity} />
            <Figure label="Allocated" value={allocated} />
            <Figure
              label="Remaining"
              value={remaining}
              tone={
                remaining === 0 ? "ok" : remaining > 0 ? "warn" : "over"
              }
            />
          </div>

          <p
            className={cn(
              "mt-4 flex items-start gap-2 text-sm",
              balanced ? "text-emerald-300" : "text-amber-300",
            )}
            role={problem && showAllErrors ? "alert" : undefined}
          >
            {balanced ? (
              <>
                <CheckCircleIcon
                  weight="fill"
                  className="mt-0.5 size-4 shrink-0"
                />
                All bags assigned
              </>
            ) : (
              problem
            )}
          </p>
        </div>
      ) : problem ? (
        /*
          Fail-safe for the single-design case. `realignDesigns` in the wizard
          keeps one design pinned to the order total, so reaching this should be
          impossible — which is exactly why it is here. If the invariant ever
          breaks again the customer gets the reason and, via `showQuantity`
          below, a field to correct it, instead of a silently disabled button.
        */
        <div
          className="rounded-2xl border border-amber-300/30 bg-black/35 p-4 sm:p-5"
          aria-live="polite"
        >
          <p
            className="text-sm text-amber-300"
            role={showAllErrors ? "alert" : undefined}
          >
            {problem}
          </p>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            Your order is {orderQuantity.toLocaleString()}{" "}
            {orderQuantity === 1 ? "bag" : "bags"}. Set the quantity below to
            match it, or go back and change your order quantity.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-5">
        {designs.map((design, index) => (
          <DesignCard
            key={design.id}
            design={design}
            designNumber={index + 1}
            inquiryId={inquiryId}
            comingLater={comingLater}
            // Normally hidden for a single design — it can only ever hold the
            // whole order. Revealed the moment that stops being true, so the
            // allocation is always correctable from the step that reports it.
            showQuantity={!single || !balanced}
            canRemove={designs.length > 1}
            onQuantityChange={onQuantityChange}
            onRemove={() => onRemoveDesign(design.id)}
            onArtworkChange={onArtworkChange}
          />
        ))}
      </div>

      {designs.length < MAX_DESIGNS_PER_ORDER ? (
        <Button
          type="button"
          variant="outline"
          onClick={onAddDesign}
          className="h-12 gap-2 border-white/15 bg-black/35 text-white hover:bg-black/25"
        >
          <PlusIcon weight="bold" className="size-4" />
          Add another design
        </Button>
      ) : null}

      <p className="text-muted-foreground text-xs">
        {ARTWORK_TYPES_LABEL} · up to {formatArtworkBytes(MAX_ARTWORK_BYTES)} per
        file. Print-ready files are best, but we can work from what you have.
      </p>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 bg-black/40 px-4 py-3.5 text-sm text-white transition-colors hover:bg-black/25 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/70">
        <input
          type="checkbox"
          checked={comingLater}
          onChange={(event) => onComingLaterChange(event.target.checked)}
          className="border-input accent-foreground size-4"
        />
        I&apos;ll send my artwork later
      </label>
    </div>
  );
}

/** One figure in the allocation ledger. */
function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "over";
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[11px] tracking-[0.14em] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl tabular-nums",
          tone === "over"
            ? "text-red-300"
            : tone === "warn"
              ? "text-amber-300"
              : "text-white",
        )}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

/**
 * One design: its allocation and its two artwork slots.
 *
 * The two uploaders stay stacked until `sm`. Side by side on a phone would give
 * each drop zone roughly 150px, which is too narrow to read its own label — and
 * with several designs on the page the column of full-width cards is also much
 * easier to scan than a grid of small ones.
 */
function DesignCard({
  design,
  designNumber,
  inquiryId,
  comingLater,
  showQuantity,
  canRemove,
  onQuantityChange,
  onRemove,
  onArtworkChange,
}: {
  design: MylarDesignDraft;
  designNumber: number;
  inquiryId: string | null;
  comingLater: boolean;
  showQuantity: boolean;
  canRemove: boolean;
  onQuantityChange: (designId: string, quantity: number) => void;
  onRemove: () => void;
  onArtworkChange: (
    designId: string,
    side: MylarArtworkSide,
    inquiryId: string | null,
    file: MylarArtworkFile | undefined,
  ) => void;
}) {
  const quantityId = `design-quantity-${design.id}`;

  return (
    <section
      aria-label={`Design ${designNumber}`}
      className="rounded-2xl border border-white/12 bg-black/25 p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base tracking-[0.14em] text-white uppercase">
          Design {designNumber}
        </h3>
        <span className="text-muted-foreground text-sm tabular-nums">
          {design.quantity.toLocaleString()}{" "}
          {design.quantity === 1 ? "bag" : "bags"}
        </span>
      </header>

      {showQuantity ? (
        <div className="mt-4 space-y-2">
          <Label htmlFor={quantityId} className="text-white">
            Quantity
          </Label>
          <Input
            id={quantityId}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={design.quantity === 0 ? "" : String(design.quantity)}
            onChange={(event) => {
              // Digits only, and an empty field reads as 0 rather than NaN so
              // the ledger keeps totalling while the customer retypes.
              const digits = event.target.value.replace(/[^0-9]/g, "");
              onQuantityChange(
                design.id,
                digits === "" ? 0 : Number.parseInt(digits, 10),
              );
            }}
            className={cn("h-12 max-w-40 text-center text-base", fieldClass)}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ArtworkUploader
          designId={design.id}
          designNumber={designNumber}
          side="front"
          value={design.frontArtwork}
          inquiryId={inquiryId}
          disabled={comingLater}
          onUploaded={(id, file) =>
            onArtworkChange(design.id, "front", id, file)
          }
          onRemove={() =>
            onArtworkChange(design.id, "front", inquiryId, undefined)
          }
        />
        <ArtworkUploader
          designId={design.id}
          designNumber={designNumber}
          side="back"
          value={design.backArtwork}
          inquiryId={inquiryId}
          disabled={comingLater}
          onUploaded={(id, file) => onArtworkChange(design.id, "back", id, file)}
          onRemove={() =>
            onArtworkChange(design.id, "back", inquiryId, undefined)
          }
        />
      </div>

      {canRemove ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRemove}
          className="mt-4 gap-1.5 border-white/15 bg-black/35 text-white hover:bg-black/25"
        >
          <TrashIcon weight="bold" className="size-3.5" />
          Remove design
          <span className="sr-only"> {designNumber}</span>
        </Button>
      ) : null}
    </section>
  );
}
