"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaretLeftIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";

import {
  assetUrl,
  designLabel,
  type WhiteAshDesign,
  type WhiteAshRound,
} from "@/lib/white-ash-gallery-types";
import { cn } from "@/lib/utils";

/** A design plus the round it came from, flattened for the lightbox. */
type Entry = { design: WhiteAshDesign; roundLabel: string };

export function WhiteAshGallery({
  rounds,
  assetBase,
}: {
  rounds: WhiteAshRound[];
  assetBase: string;
}) {
  const [query, setQuery] = useState("");
  const [activeRound, setActiveRound] = useState<string>("all");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const total = useMemo(
    () => rounds.reduce((n, r) => n + r.count, 0),
    [rounds],
  );

  // One flat, ordered list drives both the grid and lightbox navigation, so
  // arrow keys always follow what is actually on screen.
  const visible = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Entry[] = [];
    for (const round of rounds) {
      if (activeRound !== "all" && round.key !== activeRound) continue;
      for (const design of round.designs) {
        if (q && !designLabel(design).toLowerCase().includes(q)) continue;
        out.push({ design, roundLabel: round.label });
      }
    }
    return out;
  }, [rounds, query, activeRound]);

  // Regroup the filtered list back into sections, preserving order.
  const sections = useMemo(() => {
    const out: { label: string; entries: { entry: Entry; index: number }[] }[] =
      [];
    visible.forEach((entry, index) => {
      const last = out[out.length - 1];
      if (last && last.label === entry.roundLabel) {
        last.entries.push({ entry, index });
      } else {
        out.push({ label: entry.roundLabel, entries: [{ entry, index }] });
      }
    });
    return out;
  }, [visible]);

  // Clamped during render rather than corrected in an effect: if the filters
  // shrink the list while the lightbox is open, the index is still valid on the
  // very first render, with no intermediate out-of-range state.
  const safeIndex =
    openIndex === null || visible.length === 0
      ? null
      : Math.min(openIndex, visible.length - 1);

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (delta: number) =>
      setOpenIndex((i) => {
        if (i === null) return i;
        const from = Math.min(i, visible.length - 1);
        const next = from + delta;
        return next < 0 || next >= visible.length ? from : next;
      }),
    [visible.length],
  );

  useEffect(() => {
    if (safeIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [safeIndex, close, step]);

  const open = safeIndex !== null ? visible[safeIndex] : null;

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="relative w-full sm:max-w-sm">
          <MagnifyingGlassIcon
            weight="bold"
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-white/40"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search designs…"
            aria-label="Search designs by name"
            className="min-h-12 w-full rounded-full border border-white/15 bg-black/35 pr-4 pl-11 text-base text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] backdrop-blur-md transition-colors outline-none placeholder:text-white/40 focus:border-white/35 md:text-sm"
          />
        </div>

        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <RoundChip
            label="All Rounds"
            count={total}
            active={activeRound === "all"}
            onClick={() => setActiveRound("all")}
          />
          {rounds.map((r) => (
            <RoundChip
              key={r.key}
              label={r.label}
              count={r.count}
              active={activeRound === r.key}
              onClick={() => setActiveRound(r.key)}
            />
          ))}
        </div>

        <p className="text-xs text-white/45 tabular-nums">
          {visible.length === total
            ? `${total} designs across ${rounds.length} rounds`
            : `Showing ${visible.length} of ${total} designs`}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-base text-white/70">No designs match that search.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveRound("all");
            }}
            className="inline-flex min-h-11 items-center rounded-full border border-white/15 bg-black/35 px-5 text-sm text-white backdrop-blur-md transition-colors hover:border-white/30"
          >
            Reset filters
          </button>
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.label} className="flex flex-col gap-4">
            <div className="flex items-baseline gap-3 border-b border-white/10 pb-3">
              <h2 className="text-sm font-semibold tracking-[0.14em] text-white uppercase">
                {section.label}
              </h2>
              <span className="text-xs text-white/45 tabular-nums">
                {section.entries.length}{" "}
                {section.entries.length === 1 ? "design" : "designs"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {section.entries.map(({ entry, index }) => (
                <DesignCard
                  key={`${entry.design.folder}/${entry.design.name}`}
                  design={entry.design}
                  assetBase={assetBase}
                  onOpen={() => setOpenIndex(index)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {open ? (
        <Lightbox
          entry={open}
          assetBase={assetBase}
          position={(safeIndex ?? 0) + 1}
          total={visible.length}
          hasPrev={(safeIndex ?? 0) > 0}
          hasNext={(safeIndex ?? 0) < visible.length - 1}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

function RoundChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap backdrop-blur-md transition-colors",
        active
          ? "border-white/40 bg-white/15 text-white"
          : "border-white/12 bg-black/35 text-white/65 hover:border-white/25 hover:text-white",
      )}
    >
      {label}
      <span className="text-xs text-white/40 tabular-nums">{count}</span>
    </button>
  );
}

function DesignCard({
  design,
  assetBase,
  onOpen,
}: {
  design: WhiteAshDesign;
  assetBase: string;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = designLabel(design);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col gap-2 text-left focus-visible:outline-none"
      aria-label={`Open preview: ${label}`}
    >
      <div
        className={cn(
          // 5:6 matches the artwork exactly, so nothing shifts as images load.
          "relative aspect-[5/6] overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] transition-all duration-200",
          "group-hover:-translate-y-0.5 group-hover:border-white/25 group-hover:shadow-[0_16px_40px_rgba(0,0,0,0.45)]",
          "group-focus-visible:ring-2 group-focus-visible:ring-white/60",
        )}
      >
        {!loaded && !failed ? (
          <div className="absolute inset-0 animate-pulse bg-white/[0.06]" />
        ) : null}

        {failed ? (
          <div className="absolute inset-0 grid place-items-center px-3 text-center text-xs text-white/40">
            Preview unavailable
          </div>
        ) : (
          /* Plain <img>: these are already WebP at the exact display size, so
             next/image would spend billable transformations to no benefit. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl(assetBase, design.thumbnail)}
            alt={label}
            loading="lazy"
            decoding="async"
            width={design.width ?? 400}
            height={design.height ?? 480}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn(
              "size-full object-contain transition-opacity duration-300",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        )}
      </div>

      <p className="line-clamp-2 text-[11px] leading-snug break-words text-white/50 transition-colors group-hover:text-white/80 md:text-xs">
        {label}
      </p>
    </button>
  );
}

function LightboxImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative grid min-h-24 place-items-center">
      {!loaded ? (
        <div className="absolute size-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cn(
          "max-h-[calc(100svh-11rem)] w-auto max-w-[min(92vw,1200px)] rounded-lg object-contain shadow-[0_24px_70px_rgba(0,0,0,0.7)] transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

function Lightbox({
  entry,
  assetBase,
  position,
  total,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
}: {
  entry: Entry;
  assetBase: string;
  position: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { design, roundLabel } = entry;
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const label = designLabel(design);

  // The full 1200px preview is only requested here, never in the grid.
  const src = assetUrl(assetBase, design.preview);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const meta = [
    roundLabel,
    `${position} of ${total}`,
    design.widthIn && design.heightIn
      ? `${design.widthIn} × ${design.heightIn} in`
      : null,
  ].filter(Boolean);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label} preview`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => {
        touchX.current = e.changedTouches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 55) (dx < 0 ? onNext : onPrev)();
        touchX.current = null;
      }}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/92 p-4 backdrop-blur-xl sm:p-8"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute top-4 right-4 grid size-11 place-items-center rounded-full border border-white/15 bg-black/50 text-white/70 backdrop-blur-md transition-colors hover:border-white/30 hover:text-white sm:top-6 sm:right-6"
      >
        <XIcon weight="bold" className="size-5" />
      </button>

      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev}
        aria-label="Previous design"
        className="absolute left-2 grid size-11 place-items-center rounded-full border border-white/15 bg-black/50 text-white/70 backdrop-blur-md transition-colors hover:border-white/30 hover:text-white disabled:pointer-events-none disabled:opacity-25 sm:left-6"
      >
        <CaretLeftIcon weight="bold" className="size-5" />
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Next design"
        className="absolute right-2 grid size-11 place-items-center rounded-full border border-white/15 bg-black/50 text-white/70 backdrop-blur-md transition-colors hover:border-white/30 hover:text-white disabled:pointer-events-none disabled:opacity-25 sm:right-6"
      >
        <CaretRightIcon weight="bold" className="size-5" />
      </button>

      <figure
        className="m-0 flex max-h-full flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Keyed by src: stepping to another design remounts this, so the
            spinner state resets without an effect writing state. */}
        <LightboxImage key={src} src={src} alt={label} />

        <figcaption className="flex flex-col items-center gap-1 text-center">
          <span className="text-xs break-words text-white/70 sm:text-sm">
            {label}
          </span>
          <span className="text-[11px] text-white/40 tabular-nums">
            {meta.join("  ·  ")}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
