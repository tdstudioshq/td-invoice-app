"use client";

import { PencilSimpleIcon } from "@phosphor-icons/react";

import { formatArtworkBytes } from "@/lib/mylar-printing/artwork";
import {
  bagTypeLabel,
  contactMethodLabel,
  type MylarArtworkFile,
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
  const artworkLabel = (file: MylarArtworkFile | undefined) => {
    if (draft.artworkComingLater) return "Sending later";
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
      value: draft.designs.length
        ? `${draft.designs.length} ${draft.designs.length === 1 ? "design" : "designs"}`
        : "—",
      step: "designs",
    },
  ];

  // Lead fields, only when answered — an empty "Brand: —" row is noise on a
  // recap whose job is letting the customer check what they are about to send.
  if (draft.brandName.trim()) {
    rows.push({
      label: "Brand",
      value: draft.brandName.trim(),
      step: "details",
      truncate: true,
    });
  }

  if (draft.contactMethod) {
    rows.push({
      label: "Contact By",
      value: contactMethodLabel(draft.contactMethod),
      step: "details",
    });
  }

  if (draft.neededBy) {
    rows.push({ label: "Needed By", value: draft.neededBy, step: "details" });
  }

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

      {/*
        Per-design breakdown, below the flat rows rather than folded into them.
        A single "Front Artwork" row cannot describe three designs, and stacking
        six rows into the definition list would bury the order details above it.
        Each design gets its allocation and its two filenames, which is exactly
        what the customer needs to check before submitting.
      */}
      {draft.designs.length > 0 ? (
        <div className="mt-5 border-t border-white/8 pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-muted-foreground text-xs tracking-wider uppercase">
              Designs
            </h4>
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit("artwork")}
                className="text-muted-foreground hover:text-foreground -mr-1 inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
              >
                <PencilSimpleIcon weight="bold" className="size-3" />
                <span>Edit</span>
                <span className="sr-only"> designs and artwork</span>
              </button>
            ) : null}
          </div>

          <ul className="space-y-3">
            {draft.designs.map((design, index) => (
              <li
                key={design.id}
                className="rounded-xl border border-white/10 bg-black/25 p-3.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-white">Design {index + 1}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {design.quantity.toLocaleString()}{" "}
                    {design.quantity === 1 ? "piece" : "pieces"}
                  </p>
                </div>
                <dl className="mt-2 space-y-1">
                  <ArtworkLine
                    label="Front"
                    value={artworkLabel(design.frontArtwork)}
                  />
                  <ArtworkLine
                    label="Back"
                    value={artworkLabel(design.backArtwork)}
                  />
                </dl>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** "Front: design-a-front.ai (2.1 MB)" — one artwork line inside a design. */
function ArtworkLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2 text-xs">
      <dt className="text-muted-foreground shrink-0">{label}:</dt>
      <dd className="truncate text-white/85" title={value}>
        {value}
      </dd>
    </div>
  );
}
