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
  const shortMarker = `Step ${position} of ${STEP_COUNT}`;

  return (
    <div className="flex flex-col gap-3.5">
      {/*
        Back and the marker share a row, and on a 320px phone that row is the
        tightest horizontal budget in the wizard: "Back" plus "STEP 1 OF 5 ·
        BAG TYPE" at 13px of tracked caps is ~250px of the ~256px available.
        The marker therefore drops the step label below `xs` and keeps only
        "STEP 1 OF 5" — the label is repeated verbatim as the step's own <h2>
        two lines further down, so nothing is lost, and `aria-valuetext` on the
        rail still carries the full sentence for a screen reader.
      */}
      <div className="flex min-h-11 items-center justify-between gap-3">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground -ml-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none md:min-h-0 md:text-xs"
          >
            <ArrowLeftIcon weight="bold" className="size-4 md:size-3.5" />
            Back
          </button>
        ) : (
          <span />
        )}
        <p className="text-muted-foreground min-w-0 truncate text-right text-[13px] tracking-[0.18em] uppercase md:text-xs">
          <span className="xs:inline hidden">{marker}</span>
          <span className="xs:hidden">{shortMarker}</span>
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEP_COUNT}
        aria-valuenow={position}
        aria-valuetext={marker}
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
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
