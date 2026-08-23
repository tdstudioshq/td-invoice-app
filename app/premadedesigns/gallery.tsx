"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  CaretLeftIcon,
  CaretRightIcon,
  FolderIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";

import { getPremadeDesignUrlsAction } from "@/app/premadedesigns/actions";
import {
  buildPremadeCollections,
  PREMADE_COLLECTIONS_PAGE_SIZE,
  PREMADE_DESIGNS_PAGE_SIZE,
  type PremadeCollection,
  type PremadeDesign,
  type SignedPremadeDesignUrls,
} from "@/lib/premade-designs-types";
import { cn } from "@/lib/utils";

type CachedUrl = { url: string; expiresAt: number };

/**
 * Ownership mark laid over every image that comes out of the Storage bucket —
 * design cards, collection covers, and the lightbox. Pre-resized to 800px wide
 * because these render `unoptimized` (the Vercel image optimizer is out of the
 * delivery path here), so the asset ships at its display size or better.
 */
const WATERMARK_SRC = "/premade-watermark.png";
const WATERMARK_WIDTH = 800;
const WATERMARK_HEIGHT = 756;

function DesignWatermark({
  widthClass = "w-[72%]",
  className,
}: {
  widthClass?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center",
        className,
      )}
    >
      <Image
        src={WATERMARK_SRC}
        alt=""
        width={WATERMARK_WIDTH}
        height={WATERMARK_HEIGHT}
        unoptimized
        draggable={false}
        className={cn(
          "h-auto max-w-none opacity-[0.85] drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)] select-none",
          widthClass,
        )}
      />
    </span>
  );
}

/**
 * The gallery has two views over the same manifest:
 *
 *   `null`     — the collections index: one box per folder, with a cover image.
 *   `"folder"` — that collection's designs, paginated, with the lightbox.
 *
 * Only one of the two is on screen, so only its images are ever signed.
 */
export function DesignsGallery({
  designs,
  initialSigned,
}: {
  designs: PremadeDesign[];
  initialSigned: SignedPremadeDesignUrls;
}) {
  const galleryTop = useRef<HTMLDivElement>(null);

  const collections = useMemo(
    () => buildPremadeCollections(designs),
    [designs],
  );
  // A bucket with a single folder (or none at all) has nothing to choose
  // between, so skip the index entirely and open the designs directly.
  const singleCollection = collections.length <= 1;
  const onlyFolder = collections[0]?.value ?? "";

  const [activeFolder, setActiveFolder] = useState<string | null>(
    singleCollection ? onlyFolder : null,
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [urlCache, setUrlCache] = useState<Record<string, CachedUrl>>(() =>
    Object.fromEntries(
      Object.entries(initialSigned.urls).map(([path, url]) => [
        path,
        { url, expiresAt: initialSigned.expiresAt },
      ]),
    ),
  );

  const activeCollection =
    activeFolder === null
      ? null
      : (collections.find((entry) => entry.value === activeFolder) ?? null);
  const showingIndex = activeFolder === null;

  const normalizedQuery = query.trim().toLowerCase();

  const filteredCollections = useMemo(() => {
    if (!normalizedQuery) return collections;
    return collections.filter((entry) =>
      entry.label.toLowerCase().includes(normalizedQuery),
    );
  }, [collections, normalizedQuery]);

  const filteredDesigns = useMemo(() => {
    if (showingIndex) return [];
    return designs.filter((design) => {
      if (design.folder !== activeFolder) return false;
      if (!normalizedQuery) return true;
      return (
        design.title.toLowerCase().includes(normalizedQuery) ||
        design.name.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [activeFolder, designs, normalizedQuery, showingIndex]);

  const pageSize = showingIndex
    ? PREMADE_COLLECTIONS_PAGE_SIZE
    : PREMADE_DESIGNS_PAGE_SIZE;
  const totalItems = showingIndex
    ? filteredCollections.length
    : filteredDesigns.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageCollections = useMemo(
    () =>
      showingIndex
        ? filteredCollections.slice(
            (safePage - 1) * PREMADE_COLLECTIONS_PAGE_SIZE,
            safePage * PREMADE_COLLECTIONS_PAGE_SIZE,
          )
        : [],
    [filteredCollections, safePage, showingIndex],
  );
  const pageDesigns = useMemo(
    () =>
      showingIndex
        ? []
        : filteredDesigns.slice(
            (safePage - 1) * PREMADE_DESIGNS_PAGE_SIZE,
            safePage * PREMADE_DESIGNS_PAGE_SIZE,
          ),
    [filteredDesigns, safePage, showingIndex],
  );

  // Whatever the current view puts on screen — cover images or designs — is
  // exactly what needs a signed URL.
  const visiblePaths = useMemo(
    () =>
      showingIndex
        ? pageCollections.map((entry) => entry.cover.path)
        : pageDesigns.map((design) => design.path),
    [pageCollections, pageDesigns, showingIndex],
  );

  useEffect(() => {
    const refreshBefore = Date.now() + 60_000;
    const missingPaths = visiblePaths.filter((path) => {
      const cached = urlCache[path];
      return !cached || cached.expiresAt <= refreshBefore;
    });
    if (missingPaths.length === 0) return;

    let cancelled = false;
    startTransition(async () => {
      // The action caps how many paths one call may sign; a view never exceeds
      // it today, but chunking keeps that a performance detail, not a bug.
      for (let i = 0; i < missingPaths.length; i += PREMADE_DESIGNS_PAGE_SIZE) {
        const chunk = missingPaths.slice(i, i + PREMADE_DESIGNS_PAGE_SIZE);
        const result = await getPremadeDesignUrlsAction(chunk);
        if (cancelled) return;
        if (result.error) {
          setLoadError(result.error);
          return;
        }
        setLoadError(null);
        setUrlCache((current) => {
          const next = { ...current };
          for (const [path, url] of Object.entries(result.urls)) {
            next[path] = { url, expiresAt: result.expiresAt };
          }
          return next;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [urlCache, visiblePaths]);

  const scrollToTop = useCallback(() => {
    requestAnimationFrame(() =>
      galleryTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, []);

  const openCollection = (value: string) => {
    setActiveFolder(value);
    setQuery("");
    setPage(1);
    setLightboxIndex(null);
    scrollToTop();
  };

  const backToCollections = () => {
    setActiveFolder(null);
    setQuery("");
    setPage(1);
    setLightboxIndex(null);
    scrollToTop();
  };

  const updateQuery = (next: string) => {
    setQuery(next);
    setPage(1);
    setLightboxIndex(null);
  };

  const changePage = (nextPage: number) => {
    setPage(Math.max(1, Math.min(totalPages, nextPage)));
    setLightboxIndex(null);
    scrollToTop();
  };

  const firstVisible = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastVisible = Math.min(safePage * pageSize, totalItems);
  const noun = showingIndex ? "collections" : "designs";

  return (
    <section ref={galleryTop} className="scroll-mt-4 space-y-5">
      <div className="sticky top-3 z-20 rounded-2xl border border-white/15 bg-black/45 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_16px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-4">
        {activeCollection && !singleCollection ? (
          <button
            type="button"
            onClick={backToCollections}
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <ArrowLeftIcon weight="bold" className="size-3.5" />
            All collections
          </button>
        ) : null}

        {activeCollection ? (
          <h2 className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-lg font-semibold text-white">
              {activeCollection.label}
            </span>
            <span className="text-xs text-white/50">
              {activeCollection.count.toLocaleString()} designs
            </span>
          </h2>
        ) : null}

        <label className="relative block">
          <span className="sr-only">
            {showingIndex ? "Search collections" : "Search designs"}
          </span>
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/50" />
          <input
            type="search"
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder={
              showingIndex
                ? "Search collections…"
                : `Search in ${activeCollection?.label ?? "this collection"}…`
            }
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.07] pr-10 pl-10 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-white/30 focus:bg-white/[0.1] focus:ring-2 focus:ring-white/10"
          />
          {query ? (
            <button
              type="button"
              onClick={() => updateQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </label>

        <div className="mt-3 flex items-center justify-between gap-3 px-1 text-xs text-white/55">
          <span aria-live="polite">
            Showing {firstVisible.toLocaleString()}–{lastVisible.toLocaleString()} of{" "}
            {totalItems.toLocaleString()} {noun}
          </span>
          <span>
            {pending ? "Loading images…" : `Page ${safePage} of ${totalPages}`}
          </span>
        </div>
      </div>

      {loadError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-400/20 bg-red-950/35 px-4 py-3 text-center text-sm text-red-200"
        >
          {loadError} Refresh the page to unlock again.
        </p>
      ) : null}

      {totalItems === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-black/30 px-6 py-20 text-center backdrop-blur-md">
          <ImageIcon weight="duotone" className="size-10 text-white/50" />
          <p className="text-sm font-medium text-white/80">
            No {noun} match that search.
          </p>
          <button
            type="button"
            onClick={() => updateQuery("")}
            className="text-sm text-white/60 underline-offset-4 transition hover:text-white hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : showingIndex ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {pageCollections.map((collection, index) => (
            <CollectionCard
              key={collection.value || "__root__"}
              collection={collection}
              src={urlCache[collection.cover.path]?.url}
              eager={index < 4}
              onOpen={() => openCollection(collection.value)}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {pageDesigns.map((design, index) => (
            <DesignCard
              key={design.id}
              design={design}
              src={urlCache[design.path]?.url}
              eager={index < 5}
              onOpen={() => setLightboxIndex(index)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label={showingIndex ? "Collection pages" : "Gallery pages"}
          className="flex items-center justify-center gap-3 pt-3"
        >
          <PageButton
            onClick={() => changePage(safePage - 1)}
            disabled={safePage === 1}
            aria-label="Previous page"
          >
            <CaretLeftIcon weight="bold" className="size-4" />
            Previous
          </PageButton>
          <span className="min-w-24 text-center text-xs tabular-nums text-white/60">
            {safePage} / {totalPages}
          </span>
          <PageButton
            onClick={() => changePage(safePage + 1)}
            disabled={safePage === totalPages}
            aria-label="Next page"
          >
            Next
            <CaretRightIcon weight="bold" className="size-4" />
          </PageButton>
        </nav>
      ) : null}

      <DesignLightbox
        designs={pageDesigns}
        urls={urlCache}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </section>
  );
}

function CollectionCard({
  collection,
  src,
  eager,
  onOpen,
}: {
  collection: PremadeCollection;
  src?: string;
  eager: boolean;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${collection.label}, ${collection.count} designs`}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-black/35 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition duration-300 hover:-translate-y-1 hover:border-white/25 hover:shadow-[0_18px_45px_-16px_rgba(0,0,0,0.8)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-white/[0.035]">
        {!loaded ? (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.1] via-white/[0.035] to-transparent" />
        ) : null}
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            draggable={false}
            onLoad={() => setLoaded(true)}
            onContextMenu={(event) => event.preventDefault()}
            className={cn(
              "absolute inset-0 size-full object-contain transition-[opacity,transform] duration-500 group-hover:scale-[1.025]",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        ) : null}
        <DesignWatermark widthClass="w-[68%]" />
        <span
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
          onContextMenu={(event) => event.preventDefault()}
          aria-hidden
        />
        <span className="absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[0.65rem] font-medium text-white/85 backdrop-blur-md">
          <FolderIcon weight="fill" className="size-3" />
          {collection.count.toLocaleString()}
        </span>
      </div>
      <div className="border-t border-white/10 px-3 py-3">
        <p className="truncate text-sm font-medium text-white/90">
          {collection.label}
        </p>
        <p className="truncate text-[0.68rem] tracking-wide text-white/45 uppercase">
          {collection.count.toLocaleString()} designs
        </p>
      </div>
    </button>
  );
}

function DesignCard({
  design,
  src,
  eager,
  onOpen,
}: {
  design: PremadeDesign;
  src?: string;
  eager: boolean;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!src}
      aria-label={`Open ${design.title}`}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-black/35 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition duration-300 hover:-translate-y-1 hover:border-white/25 hover:shadow-[0_18px_45px_-16px_rgba(0,0,0,0.8)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-white/[0.035]">
        {!loaded ? (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.1] via-white/[0.035] to-transparent" />
        ) : null}
        {src ? (
          <Image
            src={src}
            alt={design.title}
            fill
            unoptimized
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            draggable={false}
            onLoad={() => setLoaded(true)}
            onContextMenu={(event) => event.preventDefault()}
            className={cn(
              "absolute inset-0 size-full object-contain transition-[opacity,transform] duration-500 group-hover:scale-[1.025]",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        ) : null}
        <DesignWatermark />
        <span
          className="absolute inset-0"
          onContextMenu={(event) => event.preventDefault()}
          aria-hidden
        />
      </div>
      <div className="space-y-1 border-t border-white/10 px-3 py-3">
        <p className="truncate text-sm font-medium text-white/90">
          {design.title}
        </p>
        <p className="truncate text-[0.68rem] tracking-wide text-white/45 uppercase">
          {design.folderLabel}
        </p>
      </div>
    </button>
  );
}

function DesignLightbox({
  designs,
  urls,
  index,
  onClose,
  onIndexChange,
}: {
  designs: PremadeDesign[];
  urls: Record<string, CachedUrl>;
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const open = index !== null;
  const current = open ? designs[index] : null;
  const touchStartX = useRef<number | null>(null);

  const goPrevious = useCallback(() => {
    if (index === null || designs.length === 0) return;
    onIndexChange((index - 1 + designs.length) % designs.length);
  }, [designs.length, index, onIndexChange]);
  const goNext = useCallback(() => {
    if (index === null || designs.length === 0) return;
    onIndexChange((index + 1) % designs.length);
  }, [designs.length, index, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") goPrevious();
      else if (event.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [goNext, goPrevious, onClose, open]);

  return (
    <AnimatePresence>
      {open && current && urls[current.path]?.url ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`${current.title}, image ${index + 1} of ${designs.length}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          onContextMenu={(event) => event.preventDefault()}
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            if (touchStartX.current === null) return;
            const delta =
              (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
            if (delta > 48) goPrevious();
            else if (delta < -48) goNext();
            touchStartX.current = null;
          }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 backdrop-blur-xl sm:p-8"
        >
          <div className="absolute top-4 left-1/2 max-w-[65vw] -translate-x-1/2 text-center">
            <p className="truncate text-sm font-medium text-white">
              {current.title}
            </p>
            <p className="text-xs text-white/55">
              {index + 1} / {designs.length} · {current.folderLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 inline-flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md transition hover:bg-white/15"
          >
            <XIcon weight="bold" className="size-5" />
          </button>

          {designs.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goPrevious();
                }}
                aria-label="Previous image"
                className="absolute top-1/2 left-3 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md transition hover:bg-white/15 sm:left-6"
              >
                <CaretLeftIcon weight="bold" className="size-5" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goNext();
                }}
                aria-label="Next image"
                className="absolute top-1/2 right-3 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md transition hover:bg-white/15 sm:right-6"
              >
                <CaretRightIcon weight="bold" className="size-5" />
              </button>
            </>
          ) : null}

          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(event) => event.stopPropagation()}
            className="relative flex max-h-[84vh] max-w-[92vw] items-center justify-center sm:max-w-[86vw]"
          >
            <Image
              src={urls[current.path].url}
              alt={current.title}
              width={1440}
              height={1800}
              unoptimized
              sizes="(max-width: 640px) 92vw, 86vw"
              draggable={false}
              className="h-auto max-h-[84vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl select-none"
            />
            <DesignWatermark widthClass="w-[55%]" className="rounded-2xl" />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function PageButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black/35 px-4 text-xs font-medium text-white backdrop-blur-md transition hover:border-white/30 hover:bg-white/10 disabled:pointer-events-none disabled:opacity-35",
        className,
      )}
      {...props}
    />
  );
}
