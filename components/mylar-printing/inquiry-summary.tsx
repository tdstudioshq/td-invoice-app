"use client";

import { PencilSimpleIcon } from "@phosphor-icons/react";

import { formatArtworkBytes } from "@/lib/mylar-printing/artwork";
import {
  bagTypeLabel,
  type MylarPrintingDraft,
  type WizardStepId,
} from "@/lib/mylar-printing/types";

/**
 * The "Printing Request" recap, shown at the foot of step 5 and again on the
 * confirmation screen.
 *
 * Deliberately price-free: this flow produces a quote request, and showing any
 * figure here would read as an agreed total. `onEdit` jumps back to the owning
 * step without discarding anything captured after it — the wizard keeps one
 * draft object, so moving the step index never clears a field.
 */
export function InquirySummary({
  draft,
  onEdit,
}: {
  draft: MylarPrintingDraft;
  onEdit?: (step: WizardStepId) => void;
}) {
  const artworkLabel = (side: "front" | "back") => {
    if (draft.artworkComingLater) return "Sending later";
    const file = side === "front" ? draft.frontArtwork : draft.backArtwork;
    if (!file) return "Not provided";
    return `${file.name} (${formatArtworkBytes(file.size)})`;
  };

  const rows: {
    label: string;
    value: string;
    step: WizardStepId;
    truncate?: boolean;
  }[] = [
    { label: "Bag Type", value: bagTypeLabel(draft.bagType), step: "bag-type" },
    {
      label: "Quantity",
      value: `${draft.quantity.toLocaleString()} pieces`,
      step: "quantity",
    },
    {
      label: "Designs",
      value: draft.designCount
        ? `${draft.designCount} ${draft.designCount === 1 ? "design" : "designs"}`
        : "—",
      step: "designs",
    },
    {
      label: "Front Artwork",
      value: artworkLabel("front"),
      step: "artwork",
      truncate: true,
    },
    {
      label: "Back Artwork",
      value: artworkLabel("back"),
      step: "artwork",
      truncate: true,
    },
  ];

  if (draft.notes.trim()) {
    rows.push({
      label: "Additional Notes",
      value: draft.notes.trim(),
      step: "details",
    });
  }

  return (
    <section
      aria-labelledby="printing-request-summary"
      className="rounded-2xl border border-white/12 bg-black/35 p-5 sm:p-6"
    >
      <h3
        id="printing-request-summary"
        className="mb-4 text-lg leading-none text-white"
      >
        Printing Request
      </h3>

      <dl className="divide-y divide-white/8">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <dt className="text-muted-foreground text-xs tracking-wider uppercase">
                {row.label}
              </dt>
              <dd
                className={`mt-0.5 text-sm text-white ${
                  row.truncate ? "truncate" : "break-words whitespace-pre-wrap"
                }`}
                title={row.truncate ? row.value : undefined}
              >
                {row.value}
              </dd>
            </div>
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(row.step)}
                className="text-muted-foreground hover:text-foreground -mr-1 inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
              >
                <PencilSimpleIcon weight="bold" className="size-3" />
                <span>Edit</span>
                <span className="sr-only"> {row.label}</span>
              </button>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
