"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionCard, StepHeading, fieldClass } from "@/components/mylar-printing/wizard-ui";
import { designCountSchema, firstError } from "@/lib/mylar-printing/schema";
import {
  DESIGN_COUNT_CHOICES,
  DESIGN_COUNT_CUSTOM_MIN,
  MAX_DESIGN_COUNT,
} from "@/lib/mylar-printing/types";
import { cn } from "@/lib/utils";

/**
 * Step 3 — how many distinct designs are in the order.
 *
 * Only the TOTAL is captured. Quantities are deliberately not split across
 * designs: that split is a production decision made when the artwork is
 * reviewed, and guessing it here would put a number in the quote that nobody
 * agreed to.
 *
 * Whether the "More than 4" input is showing is its own state rather than
 * `count > 4`, so clearing the field (count 0 while typing) doesn't yank the
 * input away mid-edit. It seeds from the current value, and this step remounts
 * whenever it is navigated to, so returning here restores the right mode with
 * no syncing effect.
 */
export function DesignCountStep({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (designCount: number) => void;
}) {
  const [isCustom, setIsCustom] = useState(
    value !== undefined && value >= DESIGN_COUNT_CUSTOM_MIN,
  );

  const raw = value === undefined || value === 0 ? "" : String(value);
  const error = isCustom ? firstError(designCountSchema, value) : null;

  function selectPreset(count: number) {
    setIsCustom(false);
    onChange(count);
  }

  function selectCustom() {
    setIsCustom(true);
    if (value === undefined || value < DESIGN_COUNT_CUSTOM_MIN) {
      onChange(DESIGN_COUNT_CUSTOM_MIN);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        title="How many different designs are you printing?"
        subtitle="Let us know how many different bag designs are included in this order."
      />

      <div
        role="radiogroup"
        aria-label="Number of designs"
        className="grid gap-3 sm:grid-cols-2"
      >
        {DESIGN_COUNT_CHOICES.map((count) => (
          <OptionCard
            key={count}
            name="designCount"
            value={String(count)}
            checked={!isCustom && value === count}
            onSelect={() => selectPreset(count)}
            title={`${count} ${count === 1 ? "Design" : "Designs"}`}
          />
        ))}
        <OptionCard
          name="designCount"
          value="more"
          checked={isCustom}
          onSelect={selectCustom}
          title="More than 4"
          detail="Tell us the exact count."
          className="sm:col-span-2"
        />
      </div>

      {isCustom ? (
        <div className="space-y-2">
          <Label htmlFor="designCount" className="text-white">
            Number of designs
          </Label>
          <Input
            id="designCount"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            autoFocus
            value={raw}
            aria-describedby="designCount-hint"
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              const digits = event.target.value.replace(/[^0-9]/g, "");
              onChange(digits === "" ? 0 : Number.parseInt(digits, 10));
            }}
            onBlur={() =>
              onChange(
                Math.min(
                  MAX_DESIGN_COUNT,
                  Math.max(DESIGN_COUNT_CUSTOM_MIN, value || 0),
                ),
              )
            }
            className={cn("h-12 max-w-40 text-center text-base", fieldClass)}
          />
          <p
            id="designCount-hint"
            role={error ? "alert" : undefined}
            className={
              error ? "text-sm text-red-300" : "text-muted-foreground text-xs"
            }
          >
            {error ?? `Enter ${DESIGN_COUNT_CUSTOM_MIN} or more.`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
