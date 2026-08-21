"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { ArtworkStep } from "@/components/mylar-printing/artwork-step";
import { BagTypeStep } from "@/components/mylar-printing/bag-type-step";
import { CustomerDetailsStep } from "@/components/mylar-printing/customer-details-step";
import { DesignCountStep } from "@/components/mylar-printing/design-count-step";
import { InquirySummary } from "@/components/mylar-printing/inquiry-summary";
import { InquirySuccess } from "@/components/mylar-printing/inquiry-success";
import { QuantityStep } from "@/components/mylar-printing/quantity-step";
import { WizardProgress } from "@/components/mylar-printing/wizard-progress";
import {
  panelClass,
  primaryButtonClass,
} from "@/components/mylar-printing/wizard-ui";
import {
  discardMylarArtworkAction,
  submitMylarInquiryAction,
} from "@/app/actions/mylar-printing";
import {
  allocationError,
  designCountSchema,
  firstError,
  mylarInquirySubmissionSchema,
  quantitySchema,
} from "@/lib/mylar-printing/schema";
import {
  ARTWORK_SIDES,
  EMPTY_DRAFT,
  STEP_COUNT,
  WIZARD_STEPS,
  distributeQuantity,
  resizeDesigns,
  stepIndexOf,
  type MylarArtworkFile,
  type MylarArtworkSide,
  type MylarDesignDraft,
  type MylarPrintingDraft,
  type WizardStepId,
} from "@/lib/mylar-printing/types";

/**
 * The Custom Mylar Printing wizard — one page, five steps, then a confirmation.
 *
 * STATE. One `MylarPrintingDraft` object owned here, plus a step index. Going
 * Back or using an Edit link only moves the index, so nothing captured later is
 * ever discarded. No Redux/Zustand and no react-hook-form: a single draft plus
 * the shared zod field schemas covers it, and matches how the rest of this
 * codebase does forms.
 *
 * PERSISTENCE. Scalars mirror into sessionStorage so an accidental refresh
 * doesn't wipe five steps of answers. `File` objects never go in — but the
 * *uploaded* artwork metadata does, because by then the bytes are already in
 * Storage and only the object key matters. Reads happen in an effect after
 * mount so the server-rendered markup and the first client render agree.
 *
 * SUBMISSION. The button is disabled while in flight, and the row's primary key
 * is the same uuid the artwork was uploaded under — so even a double-fire that
 * beats the disabled state hits the primary key and returns the reference
 * already issued, instead of filing a second request.
 */

const STORAGE_KEY = "td-mylar-printing-draft-v1";

type PersistedState = {
  step: number;
  inquiryId: string | null;
  draft: MylarPrintingDraft;
};

/** Which step owns a given payload field, for error routing. */
const STEP_FOR_FIELD: Record<string, WizardStepId> = {
  bagType: "bag-type",
  quantity: "quantity",
  designCount: "designs",
  artworkComingLater: "artwork",
  designs: "artwork",
  customerName: "details",
  customerEmail: "details",
  customerPhone: "details",
  notes: "details",
};

export function MylarPrintingWizard() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [draft, setDraft] = useState<MylarPrintingDraft>(EMPTY_DRAFT);
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState<
    Record<string, string>
  >({});
  const [result, setResult] = useState<{
    referenceNumber: string;
    draft: MylarPrintingDraft;
  } | null>(null);

  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const stepPanelRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);
  // Stamped in the mount effect rather than during render: Date.now() is
  // impure, and a value that shifts between renders would make the "filled too
  // fast" heuristic meaningless anyway.
  const mountedAt = useRef<number | null>(null);

  // --- sessionStorage: restore once, then mirror on change. Every access is
  // guarded: Safari private mode throws on write, and a corrupt or tampered
  // value must degrade to a blank wizard rather than crash it (the server
  // re-validates everything anyway, so tampering buys nothing).
  useEffect(() => {
    mountedAt.current = Date.now();
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PersistedState>;
        // sessionStorage cannot be read during render without desyncing the
        // server HTML from the first client render, so the restore is a
        // deliberate post-mount state update. It runs exactly once.
        if (parsed.draft && typeof parsed.draft === "object") {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setDraft({ ...EMPTY_DRAFT, ...parsed.draft });
        }
        if (typeof parsed.inquiryId === "string") {
          setInquiryId(parsed.inquiryId);
        }
        if (
          typeof parsed.step === "number" &&
          parsed.step >= 0 &&
          parsed.step < STEP_COUNT
        ) {
          setStep(parsed.step);
        }
      }
    } catch {
      /* unreadable storage just means a fresh wizard */
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current || result) return;
    try {
      const payload: PersistedState = { step, inquiryId, draft };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* storage full or blocked — persistence is a convenience, not a feature */
    }
  }, [draft, inquiryId, result, step]);

  const clearStorage = useCallback(() => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing to do */
    }
  }, []);

  // --- Step changes: pull the card back into view when it has scrolled off the
  // top (tall steps on a phone), and move focus so a screen reader lands on the
  // new question instead of staying on the button that was just pressed.
  useEffect(() => {
    if (!hydrated.current) return;
    const container = containerRef.current;
    if (container && container.getBoundingClientRect().top < 0) {
      container.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    stepPanelRef.current?.focus({ preventScroll: true });
  }, [step]);

  const patch = useCallback((changes: Partial<MylarPrintingDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
  }, []);

  const goTo = useCallback(
    (next: number) => {
      setDirection(next > step ? 1 : -1);
      setStep(Math.min(STEP_COUNT - 1, Math.max(0, next)));
    },
    [step],
  );

  const goToStepId = useCallback(
    (id: WizardStepId) => goTo(stepIndexOf(id)),
    [goTo],
  );

  /**
   * A stable uuid for a new design. Web Crypto only exists in a secure context;
   * on plain http (a LAN IP while testing on a phone) it is undefined, so this
   * falls back to a v4-shaped random string. Either way the id is a real
   * identifier that survives reordering — never an array index, which would
   * silently re-point a design's artwork the moment one above it is removed.
   */
  const makeDesignId = useCallback(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    const hex = "0123456789abcdef";
    let out = "";
    for (let i = 0; i < 36; i += 1) {
      if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
      else if (i === 14) out += "4";
      else if (i === 19) out += hex[8 + Math.floor(Math.random() * 4)];
      else out += hex[Math.floor(Math.random() * 16)];
    }
    return out;
  }, []);

  /**
   * Seed the design list when the artwork step opens.
   *
   * This is the whole "don't make them press Add four times" behaviour: the
   * count from step 3 and the total from step 2 become N cards with the total
   * distributed evenly between them. It only fires when the list is EMPTY or
   * its length has fallen out of step with `designCount` — editing a quantity
   * must never be undone by a re-seed, and neither must an uploaded file.
   * `resizeDesigns` preserves surviving entries by id, so artwork already
   * attached to Design 1 stays on Design 1 when Design 4 is added.
   */
  useEffect(() => {
    if (!hydrated.current) return;
    if (WIZARD_STEPS[step].id !== "artwork") return;
    const wanted = draft.designCount ?? 1;
    if (draft.designs.length === wanted) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft((current) => {
      if (current.designs.length === wanted) return current;
      return {
        ...current,
        designs: resizeDesigns(
          current.designs,
          wanted,
          current.quantity,
          makeDesignId,
        ),
      };
    });
  }, [draft.designCount, draft.designs.length, makeDesignId, step]);

  const handleArtworkChange = useCallback(
    (
      designId: string,
      side: MylarArtworkSide,
      nextInquiryId: string | null,
      file: MylarArtworkFile | undefined,
    ) => {
      if (nextInquiryId) setInquiryId(nextInquiryId);
      setDraft((current) => {
        // An upload that resolves after "send artwork later" was ticked is
        // dropped: attaching it would contradict the checkbox and fail the
        // schema at submit time.
        if (file && current.artworkComingLater) return current;
        return {
          ...current,
          designs: current.designs.map((design) =>
            design.id === designId
              ? side === "front"
                ? { ...design, frontArtwork: file }
                : { ...design, backArtwork: file }
              : design,
          ),
        };
      });
    },
    [],
  );

  const handleDesignQuantityChange = useCallback(
    (designId: string, quantity: number) => {
      setDraft((current) => ({
        ...current,
        designs: current.designs.map((design) =>
          design.id === designId ? { ...design, quantity } : design,
        ),
      }));
    },
    [],
  );

  /**
   * Add a design, and give it whatever is still unallocated.
   *
   * Handing the new card the remaining bags (rather than 0) means the common
   * "split this order one more way" gesture lands on a balanced allocation
   * immediately; when nothing is left over it starts at 1, which is the
   * smallest value the schema accepts, so the customer is nudged to rebalance
   * rather than blocked by a zero they did not type.
   *
   * `designCount` is kept in step, because the two must agree at submit time.
   */
  const handleAddDesign = useCallback(() => {
    setDraft((current) => {
      const allocated = current.designs.reduce(
        (sum, design) => sum + (Number.isFinite(design.quantity) ? design.quantity : 0),
        0,
      );
      const remaining = current.quantity - allocated;
      const designs = [
        ...current.designs,
        { id: makeDesignId(), quantity: remaining > 0 ? remaining : 1 },
      ];
      return { ...current, designs, designCount: designs.length };
    });
  }, [makeDesignId]);

  /**
   * Remove a design, release any artwork it was holding, and hand its bags back
   * to the remaining designs so the order stays balanced.
   *
   * The discards run here, NOT inside the setDraft updater: React may invoke an
   * updater more than once, and a side effect in there would fire as many times.
   */
  const handleRemoveDesign = useCallback(
    (designId: string) => {
      const removed = draft.designs.find((design) => design.id === designId);
      if (removed && inquiryId) {
        for (const side of ARTWORK_SIDES) {
          const file =
            side === "front" ? removed.frontArtwork : removed.backArtwork;
          if (file) {
            void discardMylarArtworkAction({
              inquiryId,
              designId,
              side,
              path: file.path,
            });
          }
        }
      }
      setDraft((current) => {
        const kept = current.designs.filter((design) => design.id !== designId);
        if (kept.length === 0) return current;
        // Redistribute rather than leave the order short: the customer removed
        // a design, they did not reduce their order.
        const shares = distributeQuantity(current.quantity, kept.length);
        const designs: MylarDesignDraft[] = kept.map((design, index) => ({
          ...design,
          quantity: shares[index],
        }));
        return { ...current, designs, designCount: designs.length };
      });
    },
    [draft.designs, inquiryId],
  );

  const handleComingLater = useCallback(
    (comingLater: boolean) => {
      if (!comingLater) {
        patch({ artworkComingLater: false });
        return;
      }
      // Ticking "send later" clears every slot on every design so the summary,
      // the stored row, and the notification email can't disagree about what's
      // attached. The draft is the only thing holding those object keys, so the
      // bytes are released here too rather than left in the bucket
      // unreferenced. The design ALLOCATIONS are untouched — deferring artwork
      // does not mean forgetting how the order splits.
      //
      // The discards run here, NOT inside the setDraft updater: React may
      // invoke an updater more than once, and a side effect in there would fire
      // as many times.
      if (inquiryId) {
        for (const design of draft.designs) {
          for (const side of ARTWORK_SIDES) {
            const file =
              side === "front" ? design.frontArtwork : design.backArtwork;
            if (file) {
              void discardMylarArtworkAction({
                inquiryId,
                designId: design.id,
                side,
                path: file.path,
              });
            }
          }
        }
      }
      setDraft((current) => ({
        ...current,
        artworkComingLater: true,
        designs: current.designs.map((design) => ({
          id: design.id,
          quantity: design.quantity,
        })),
      }));
    },
    [draft.designs, inquiryId, patch],
  );

  // --- Gate for Continue. Step 5 has no gate: its button submits and surfaces
  // every outstanding error at once, which beats a button that is disabled for
  // reasons the customer can't see.
  const canContinue = (() => {
    switch (WIZARD_STEPS[step].id) {
      case "bag-type":
        return Boolean(draft.bagType);
      case "quantity":
        return firstError(quantitySchema, draft.quantity) === null;
      case "designs":
        return (
          draft.designCount !== undefined &&
          firstError(designCountSchema, draft.designCount) === null
        );
      case "artwork":
        // The allocation must balance before the customer can move on. Artwork
        // itself is never gated — it is optional by design.
        return allocationError(draft.designs, draft.quantity) === null;
      default:
        return true;
    }
  })();

  async function handleSubmit() {
    if (submitting) return;
    setServerFieldErrors({});

    if (!draft.bagType) {
      goToStepId("bag-type");
      toast.error("Pick a bag type first.");
      return;
    }
    if (draft.designCount === undefined) {
      goToStepId("designs");
      toast.error("Tell us how many designs you're printing.");
      return;
    }
    // Surfaced before the schema parse so the customer gets the specific
    // "250 bags still need to be assigned" wording rather than the generic
    // allocation message the submission schema carries.
    const allocationProblem = allocationError(draft.designs, draft.quantity);
    if (allocationProblem) {
      setShowAllErrors(true);
      goToStepId("artwork");
      toast.error(allocationProblem);
      return;
    }

    // Web Crypto is only defined in a secure context; on plain http the server
    // mints the id instead (see the schema note). Generating it here when we
    // can is what makes a retry land on the same row rather than filing twice.
    const generatedId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : null;

    const payload = {
      inquiryId: inquiryId ?? generatedId,
      bagType: draft.bagType,
      quantity: draft.quantity,
      designCount: draft.designCount,
      artworkComingLater: draft.artworkComingLater,
      designs: draft.designs.map((design) => ({
        id: design.id,
        quantity: design.quantity,
        frontArtwork: design.frontArtwork ?? null,
        backArtwork: design.backArtwork ?? null,
      })),
      customerName: draft.customerName,
      customerEmail: draft.customerEmail,
      customerPhone: draft.customerPhone,
      notes: draft.notes,
      website: honeypot,
      startedAt: mountedAt.current ?? Date.now(),
    };

    // Mirror of the server's own parse — catches the obvious problems without a
    // round trip, and routes the customer to the step that owns the first one.
    const parsed = mylarInquirySubmissionSchema.safeParse(payload);
    if (!parsed.success) {
      setShowAllErrors(true);
      const issue = parsed.error.issues[0];
      const field = String(issue?.path[0] ?? "");
      const target = STEP_FOR_FIELD[field];
      if (target) goToStepId(target);
      toast.error(issue?.message ?? "Please check your details.");
      return;
    }

    // Reuse the id we just settled on, so a retry after a failure lands on the
    // same primary key rather than filing a duplicate.
    if (payload.inquiryId) setInquiryId(payload.inquiryId);
    setSubmitting(true);
    try {
      const response = await submitMylarInquiryAction(payload);
      if ("error" in response) {
        setShowAllErrors(true);
        setServerFieldErrors(response.fieldErrors ?? {});
        const field = Object.keys(response.fieldErrors ?? {})[0];
        const target = field ? STEP_FOR_FIELD[field] : undefined;
        if (target) goToStepId(target);
        toast.error(response.error);
        return;
      }
      setResult({ referenceNumber: response.referenceNumber, draft });
      clearStorage();
    } catch {
      toast.error(
        "We couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className={`${panelClass} p-6 sm:p-8`}>
        <InquirySuccess
          referenceNumber={result.referenceNumber}
          draft={result.draft}
        />
      </div>
    );
  }

  const isLastStep = step === STEP_COUNT - 1;
  const offset = reduceMotion ? 0 : 24;

  return (
    <div ref={containerRef} className={`${panelClass} scroll-mt-6 p-5 sm:p-8`}>
      <WizardProgress stepIndex={step} onBack={() => goTo(step - 1)} />

      <div className="mt-7">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={WIZARD_STEPS[step].id}
            ref={stepPanelRef}
            tabIndex={-1}
            initial={{ opacity: 0, x: direction * offset }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -offset }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
            className="focus:outline-none"
          >
            {WIZARD_STEPS[step].id === "bag-type" ? (
              <BagTypeStep
                value={draft.bagType}
                onChange={(bagType) => patch({ bagType })}
              />
            ) : null}

            {WIZARD_STEPS[step].id === "quantity" ? (
              <QuantityStep
                value={draft.quantity}
                onChange={(quantity) => patch({ quantity })}
              />
            ) : null}

            {WIZARD_STEPS[step].id === "designs" ? (
              <DesignCountStep
                value={draft.designCount}
                onChange={(designCount) => patch({ designCount })}
              />
            ) : null}

            {WIZARD_STEPS[step].id === "artwork" ? (
              <ArtworkStep
                designs={draft.designs}
                orderQuantity={draft.quantity}
                comingLater={draft.artworkComingLater}
                inquiryId={inquiryId}
                showAllErrors={showAllErrors}
                onArtworkChange={handleArtworkChange}
                onQuantityChange={handleDesignQuantityChange}
                onAddDesign={handleAddDesign}
                onRemoveDesign={handleRemoveDesign}
                onComingLaterChange={handleComingLater}
              />
            ) : null}

            {WIZARD_STEPS[step].id === "details" ? (
              <div className="flex flex-col gap-7">
                <CustomerDetailsStep
                  name={draft.customerName}
                  email={draft.customerEmail}
                  phone={draft.customerPhone}
                  notes={draft.notes}
                  honeypot={honeypot}
                  showAllErrors={showAllErrors}
                  serverFieldErrors={serverFieldErrors}
                  onChange={patch}
                  onHoneypotChange={setHoneypot}
                />
                <InquirySummary draft={draft} onEdit={goToStepId} />
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {isLastStep ? (
          <>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className={primaryButtonClass}
            >
              <PaperPlaneTiltIcon weight="bold" className="size-4" />
              {submitting ? "Sending…" : "Submit Printing Request"}
            </Button>
            <p className="text-muted-foreground text-center text-xs leading-relaxed">
              This is a printing quote request. Your order is not confirmed
              until TD Studios reviews your artwork and order details.
            </p>
          </>
        ) : (
          <Button
            type="button"
            onClick={() => goTo(step + 1)}
            disabled={!canContinue}
            className={primaryButtonClass}
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
