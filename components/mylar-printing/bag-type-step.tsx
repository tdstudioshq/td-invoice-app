"use client";

import {
  BagPreview,
  OptionCard,
  StepHeading,
} from "@/components/mylar-printing/wizard-ui";
import { MYLAR_BAG_OPTIONS, type MylarBagType } from "@/lib/mylar-printing/types";

/** Step 1 — which bag style we're printing. */
export function BagTypeStep({
  value,
  onChange,
}: {
  value: MylarBagType | undefined;
  onChange: (bagType: MylarBagType) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        title="What type of Mylar bag do you need?"
        subtitle="Select the bag style you want us to print."
        note="High quality · 6 mil heavy duty"
      />
      {/* One column on phones so the whole card stays an easy tap target;
          two from sm up, where four cards would otherwise run very long. */}
      <div
        role="radiogroup"
        aria-label="Bag type"
        className="grid gap-3 sm:grid-cols-2 sm:gap-4"
      >
        {MYLAR_BAG_OPTIONS.map((option) => (
          <OptionCard
            key={option.id}
            name="bagType"
            value={option.id}
            checked={value === option.id}
            onSelect={() => onChange(option.id)}
            title={option.label}
            meta={option.dimensions}
            detail={option.detail}
            visual={<BagPreview src={option.image} />}
          />
        ))}
      </div>
    </div>
  );
}
