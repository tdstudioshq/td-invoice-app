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
  designCountSchema,
  firstError,
  mylarInquirySubmissionSchema,
  quantitySchema,
} from "@/lib/mylar-printing/schema";
import {
  EMPTY_DRAFT,
  STEP_COUNT,
  WIZARD_STEPS,
  stepIndexOf,
  type MylarArtworkFile,
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
  frontArtwork: "artwork",
  backArtwork: "artwork",
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

  const handleArtworkChange = useCallback(
    (
      side: "front" | "back",
      nextInquiryId: string | null,
      file: MylarArtworkFile | undefined,
    ) => {
      if (nextInquiryId) setInquiryId(nextInquiryId);
      setDraft((current) => {
        // An upload that resolves after "send artwork later" was ticked is
        // dropped: attaching it would contradict the checkbox and fail the
        // schema at submit time.
        if (file && current.artworkComingLater) return current;
        return side === "front"
          ? { ...current, frontArtwork: file }
          : { ...current, backArtwork: file };
      });
    },
    [],
  );

  const handleComingLater = useCallback(
    (comingLater: boolean) => {
      if (!comingLater) {
        patch({ artworkComingLater: false });
        return;
      }
      // Ticking "send later" clears both slots so the summary, the stored row,
      // and the notification email can't disagree about what's attached. The
      // draft is the only thing holding those object keys, so the bytes are
      // released here too rather than left in the bucket unreferenced.
      //
      // The discards run here, NOT inside the setDraft updater: React may
      // invoke an updater more than once, and a side effect in there would fire
      // as many times.
      if (inquiryId) {
        const slots = [
          ["front", draft.frontArtwork],
          ["back", draft.backArtwork],
        ] as const;
        for (const [side, file] of slots) {
          if (file) {
            void discardMylarArtworkAction({ inquiryId, side, path: file.path });
          }
        }
      }
      patch({
        artworkComingLater: true,
        frontArtwork: undefined,
        backArtwork: undefined,
      });
    },
    [draft.backArtwork, draft.frontArtwork, inquiryId, patch],
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
      frontArtwork: draft.frontArtwork ?? null,
      backArtwork: draft.backArtwork ?? null,
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
                frontArtwork={draft.frontArtwork}
                backArtwork={draft.backArtwork}
                comingLater={draft.artworkComingLater}
                inquiryId={inquiryId}
                onArtworkChange={handleArtworkChange}
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
