"use client";

import { MinusIcon, PlusIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StepHeading, fieldClass } from "@/components/mylar-printing/wizard-ui";
import { firstError, quantitySchema } from "@/lib/mylar-printing/schema";
import {
  MAX_QUANTITY,
  MIN_QUANTITY,
  QUANTITY_PRESETS,
  QUANTITY_STEP,
} from "@/lib/mylar-printing/types";
import { cn } from "@/lib/utils";

/**
 * Step 2 — how many bags.
 *
 * The typed value is held locally as a string so the field can be cleared while
 * editing; only whole numbers reach the draft, and blur clamps back into range.
 * No pricing, no per-bag cost, no discount tiers — this is a quote request, and
 * the numbers get quoted by hand.
 */
export function QuantityStep({
  value,
  onChange,
}: {
  value: number;
  onChange: (quantity: number) => void;
}) {
  // No local copy of the typed text: the field renders straight from `value`,
  // with 0 standing in for "cleared". That keeps presets, the steppers, and
  // back-navigation in sync for free — a mirrored string would need an effect
  // to chase the prop, which is the bug this avoids.
  const raw = value === 0 ? "" : String(value);
  const error = firstError(quantitySchema, value);

  const clamp = (next: number) =>
    Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, next));

  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        title="How many bags do you need?"
        subtitle={`Minimum order is ${MIN_QUANTITY} pieces.`}
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {QUANTITY_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            aria-pressed={value === preset}
            className={cn(
              "h-12 rounded-xl border text-sm transition-all active:translate-y-px focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none",
              value === preset
                ? "border-white/45 bg-white/[0.14] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)]"
                : "border-white/15 bg-black/40 text-white/80 hover:border-white/30 hover:bg-black/25",
            )}
          >
            {preset.toLocaleString()}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="quantity" className="text-white">
          Quantity
        </Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(clamp(value - QUANTITY_STEP))}
            disabled={value <= MIN_QUANTITY}
            aria-label={`Decrease quantity by ${QUANTITY_STEP} pieces`}
            className="size-12 shrink-0 rounded-xl border-white/15 bg-black/35 p-0 text-white hover:bg-black/25"
          >
            <MinusIcon weight="bold" className="size-4" />
          </Button>

          <div className="relative min-w-0 flex-1">
            <Input
              id="quantity"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={raw}
              aria-describedby="quantity-hint"
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                const digits = event.target.value.replace(/[^0-9]/g, "");
                onChange(digits === "" ? 0 : Number.parseInt(digits, 10));
              }}
              onBlur={() => onChange(clamp(value || MIN_QUANTITY))}
              className={cn("h-12 pr-14 text-center text-base", fieldClass)}
            />
            <span
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm"
            >
              pcs
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(clamp(value + QUANTITY_STEP))}
            aria-label={`Increase quantity by ${QUANTITY_STEP} pieces`}
            className="size-12 shrink-0 rounded-xl border-white/15 bg-black/35 p-0 text-white hover:bg-black/25"
          >
            <PlusIcon weight="bold" className="size-4" />
          </Button>
        </div>

        {/* One element, two states — aria-describedby has to keep resolving. */}
        <p
          id="quantity-hint"
          role={error ? "alert" : undefined}
          className={error ? "text-sm text-red-300" : "text-muted-foreground text-xs"}
        >
          {error ?? "Type any amount, or use the presets above."}
        </p>
      </div>
    </div>
  );
}
