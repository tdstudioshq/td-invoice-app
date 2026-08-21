"use client";

import { motion } from "framer-motion";
import { ArrowLeftIcon } from "@phosphor-icons/react";

import { STEP_COUNT, WIZARD_STEPS } from "@/lib/mylar-printing/types";

/**
 * Step header: Back (from step 2 on), the "STEP n OF m · LABEL" marker, and the
 * progress rail.
 *
 * The count and the labels both come from WIZARD_STEPS, so inserting a future
 * step (material, finish, turnaround…) updates this header with no edit here.
 * The rail is the accessible progressbar; the text marker is its visible label.
 */
export function WizardProgress({
  stepIndex,
  onBack,
}: {
  stepIndex: number;
  onBack: () => void;
}) {
  const step = WIZARD_STEPS[stepIndex];
  const position = stepIndex + 1;
  const marker = `Step ${position} of ${STEP_COUNT} · ${step.label}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-8 items-center justify-between gap-3">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground -ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-1 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
          >
            <ArrowLeftIcon weight="bold" className="size-3.5" />
            Back
          </button>
        ) : (
          <span />
        )}
        <p className="text-muted-foreground min-w-0 truncate text-right text-xs tracking-[0.18em] uppercase">
          {marker}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEP_COUNT}
        aria-valuenow={position}
        aria-valuetext={marker}
        className="h-1 w-full overflow-hidden rounded-full bg-white/10"
      >
        <motion.div
          className="h-full rounded-full bg-white"
          initial={false}
          animate={{ width: `${(position / STEP_COUNT) * 100}%` }}
          transition={{ type: "spring", stiffness: 260, damping: 32 }}
        />
      </div>
    </div>
  );
}
