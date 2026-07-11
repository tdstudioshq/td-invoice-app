"use client";

/* eslint-disable @next/next/no-img-element */
import {
  useCallback,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArchiveIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  FileIcon,
  FilePdfIcon,
  FileZipIcon,
  FolderIcon,
  FolderOpenIcon,
  ImageIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PenNibIcon,
  PulseIcon,
  SquaresFourIcon,
  StarIcon,
  UploadSimpleIcon,
  VectorTwoIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { toggleFavoriteAction } from "@/app/actions/favorites";
import { ClientUploadForm } from "@/components/portal/client-upload-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTIVITY_LABEL,
  FILE_KIND_LABEL,
  type FileKind,
  type FileVersionGroup,
  type SortKey,
  SORT_LABEL,
  fileKind,
  groupVersions,
  hasThumbnail,
  searchFiles,
  sortFiles,
} from "@/lib/dam";
import { CATEGORY_LABEL, formatBytes, previewKind } from "@/lib/portal";
import { formatDate } from "@/lib/format";
import type {
  ClientFile,
  ClientProject,
  FileActivity,
  FileCategory,
} from "@/lib/types/database";
import { cn } from "@/lib/utils";

type ViewId =
  | "all"
  | "recent"
  | "favorites"
  | "activity"
  | `category:${FileCategory}`
  | `project:${string}`;

const RECENT_LIMIT = 20;

const KIND_ICON: Record<FileKind, typeof FileIcon> = {
  image: ImageIcon,
  vector: VectorTwoIcon,
  pdf: FilePdfIcon,
  design: PenNibIcon,
  archive: FileZipIcon,
  other: FileIcon,
};

function downloadUrl(id: string) {
  return `/api/files/${id}`;
}
function thumbUrl(id: string) {
  return `/api/files/${id}?thumb=1`;
}

/**
 * The portal's Drive-style asset browser: sidebar views (all / recent /
 * favorites / categories / project folders / activity), search, grid–list
 * toggle, sort, thumbnail cards, a preview modal with metadata + version
 * history, per-user favorites, and download actions. Purely presentational
 * over RLS-scoped data the server component fetched — every byte still flows
 * through the signed-URL route.
 */
export function FileBrowser({
  files,
  projects,
  favoriteIds,
  activity,
  canUpload,
}: {
  files: ClientFile[];
  projects: Pick<ClientProject, "id" | "name" | "status">[];
  favoriteIds: string[];
  activity: FileActivity[];
  canUpload: boolean;
}) {
  const [view, setView] = useState<ViewId>("all");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<SortKey>("newest");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Optimistic favorites so the star flips instantly.
  const [favorites, applyFavorite] = useOptimistic(
    new Set(favoriteIds),
    (set, { id, on }: { id: string; on: boolean }) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    },
  );
  const [, startTransition] = useTransition();

  const toggleFavorite = useCallback(
    (id: string) => {
      startTransition(async () => {
        applyFavorite({ id, on: !favorites.has(id) });
        const result = await toggleFavoriteAction(id);
        if (result.error) toast.error(result.error);
      });
    },
    [favorites, applyFavorite],
  );

  // View → base file set (before search/sort).
  const viewFiles = useMemo(() => {
    switch (view) {
      case "all":
      case "activity":
        return files;
      case "recent":
        return sortFiles(files, "newest").slice(0, RECENT_LIMIT);
      case "favorites":
        return files.filter((f) => favorites.has(f.id));
      default:
        if (view.startsWith("category:"))
          return files.filter((f) => f.category === view.slice(9));
        return files.filter((f) => f.project_id === view.slice(8));
    }
  }, [files, view, favorites]);

  const visible = useMemo(() => {
    const searched = query.trim() ? searchFiles(viewFiles, query) : viewFiles;
    return groupVersions(sortFiles(searched, sort));
  }, [viewFiles, query, sort]);

  const previewGroup =
    visible.find((g) => g.latest.id === previewId) ??
    (previewId
      ? ({
          latest: files.find((f) => f.id === previewId),
          older: [],
        } as FileVersionGroup)
      : null);
  const previewIndex = visible.findIndex((g) => g.latest.id === previewId);

  const counts = useMemo(() => {
    const byCategory = new Map<string, number>();
    const byProject = new Map<string, number>();
    for (const f of files) {
      byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
      if (f.project_id)
        byProject.set(f.project_id, (byProject.get(f.project_id) ?? 0) + 1);
    }
    return { byCategory, byProject };
  }, [files]);

  const navItem = (
    id: ViewId,
    label: string,
    Icon: typeof FileIcon,
    count?: number,
  ) => (
    <button
      key={id}
      type="button"
      onClick={() => setView(id)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        view === id
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <Icon
        weight={view === id ? "fill" : "regular"}
        className="size-4.5 shrink-0"
      />
      <span className="truncate">{label}</span>
      {count !== undefined && count > 0 ? (
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {count}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      {/* ------------------------------------------------ sidebar */}
      <aside className="shrink-0 lg:w-56">
        {/* Mobile: horizontal chips; desktop: vertical rail. */}
        <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0 [&>button]:w-auto [&>button]:shrink-0 lg:[&>button]:w-full">
          {navItem("all", "All files", FolderOpenIcon, files.length)}
          {navItem("recent", "Recent", ClockCounterClockwiseIcon)}
          {navItem(
            "favorites",
            "Favorites",
            StarIcon,
            files.filter((f) => favorites.has(f.id)).length,
          )}
          {navItem("activity", "Activity", PulseIcon)}
          <div className="border-border my-2 hidden border-t lg:block" />
          {(["final_files", "uploads", "invoices"] as FileCategory[]).map(
            (category) =>
              navItem(
                `category:${category}`,
                CATEGORY_LABEL[category],
                category === "invoices" ? FilePdfIcon : ArchiveIcon,
                counts.byCategory.get(category) ?? 0,
              ),
          )}
          {projects.length > 0 ? (
            <>
              <div className="border-border my-2 hidden border-t lg:block" />
              <p className="text-muted-foreground hidden px-3 pb-1 text-[10px] font-medium tracking-[0.14em] uppercase lg:block">
                Projects
              </p>
              {projects.map((project) =>
                navItem(
                  `project:${project.id}`,
                  project.name,
                  FolderIcon,
                  counts.byProject.get(project.id) ?? 0,
                ),
              )}
            </>
          ) : null}
        </div>
      </aside>

      {/* ------------------------------------------------ main pane */}
      <div className="min-w-0 flex-1">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <MagnifyingGlassIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files…"
              className="h-9 pl-9"
              aria-label="Search files"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-9 w-[150px]" aria-label="Sort files">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABEL[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="border-border flex overflow-hidden rounded-lg border">
            {(
              [
                ["grid", SquaresFourIcon, "Grid view"],
                ["list", ListIcon, "List view"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLayout(id)}
                aria-label={label}
                aria-pressed={layout === id}
                className={cn(
                  "flex size-9 items-center justify-center transition-colors",
                  layout === id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4.5" />
              </button>
            ))}
          </div>
          {canUpload ? (
            <Button
              size="sm"
              className="h-9"
              onClick={() => setUploadOpen(true)}
            >
              <UploadSimpleIcon className="size-4" />
              Upload
            </Button>
          ) : null}
        </div>

        {/* Content */}
        {view === "activity" ? (
          <ActivityTimeline activity={activity} files={files} />
        ) : visible.length === 0 ? (
          <div className="border-border flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
            <FolderOpenIcon className="text-muted-foreground size-8" />
            <p className="text-sm font-medium">
              {query ? "No files match your search." : "Nothing here yet."}
            </p>
            <p className="text-muted-foreground text-xs">
              {query
                ? "Try a different name or file type."
                : "Files TD Studios shares with you will appear here."}
            </p>
          </div>
        ) : layout === "grid" ? (
          <motion.ul layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {visible.map((group) => (
                <motion.li
                  key={group.latest.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                >
                  <FileCard
                    group={group}
                    favorited={favorites.has(group.latest.id)}
                    onToggleFavorite={toggleFavorite}
                    onOpen={() => setPreviewId(group.latest.id)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        ) : (
          <ul className="divide-border divide-y">
            {visible.map((group) => (
              <FileRow
                key={group.latest.id}
                group={group}
                favorited={favorites.has(group.latest.id)}
                onToggleFavorite={toggleFavorite}
                onOpen={() => setPreviewId(group.latest.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------ preview modal */}
      <FilePreviewModal
        group={previewGroup?.latest ? previewGroup : null}
        projects={projects}
        favorited={previewId ? favorites.has(previewId) : false}
        onToggleFavorite={toggleFavorite}
        onClose={() => setPreviewId(null)}
        onStep={
          previewIndex === -1
            ? undefined
            : (dir) => {
                const next = visible[previewIndex + dir];
                if (next) setPreviewId(next.latest.id);
              }
        }
        hasPrev={previewIndex > 0}
        hasNext={previewIndex !== -1 && previewIndex < visible.length - 1}
      />

      {/* ------------------------------------------------ upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share a file</DialogTitle>
          </DialogHeader>
          <ClientUploadForm />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================== cards */

function Thumbnail({
  file,
  className,
}: {
  file: ClientFile;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const kind = fileKind(file);
  const Icon = KIND_ICON[kind];
  if (!hasThumbnail(file) || failed) {
    return (
      <div
        className={cn(
          "bg-muted/50 flex items-center justify-center",
          className,
        )}
      >
        <Icon weight="duotone" className="text-muted-foreground size-10" />
      </div>
    );
  }
  return (
    <img
      src={thumbUrl(file.id)}
      alt={file.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
}

function FavoriteStar({
  favorited,
  onToggle,
  className,
}: {
  favorited: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorited}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex size-8 items-center justify-center rounded-full transition-colors",
        favorited
          ? "text-yellow-400"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <StarIcon weight={favorited ? "fill" : "regular"} className="size-4.5" />
    </button>
  );
}

function FileCard({
  group,
  favorited,
  onToggleFavorite,
  onOpen,
}: {
  group: FileVersionGroup;
  favorited: boolean;
  onToggleFavorite: (id: string) => void;
  onOpen: () => void;
}) {
  const file = group.latest;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group border-border bg-card hover:border-muted-foreground/40 relative flex cursor-pointer flex-col overflow-hidden rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <Thumbnail
          file={file}
          className="size-full transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {group.older.length > 0 ? (
          <Badge
            variant="secondary"
            className="absolute bottom-2 left-2 text-[10px]"
          >
            {group.older.length + 1} versions
          </Badge>
        ) : null}
        <FavoriteStar
          favorited={favorited}
          onToggle={() => onToggleFavorite(file.id)}
          className={cn(
            "bg-background/70 absolute top-1.5 right-1.5 backdrop-blur-sm",
            !favorited && "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
          )}
        />
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="text-muted-foreground text-xs">
            {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
          </p>
        </div>
        <a
          href={downloadUrl(file.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Download ${file.name}`}
          className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <DownloadSimpleIcon className="size-4.5" />
        </a>
      </div>
    </div>
  );
}

function FileRow({
  group,
  favorited,
  onToggleFavorite,
  onOpen,
}: {
  group: FileVersionGroup;
  favorited: boolean;
  onToggleFavorite: (id: string) => void;
  onOpen: () => void;
}) {
  const file = group.latest;
  const Icon = KIND_ICON[fileKind(file)];
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="hover:bg-accent/40 flex cursor-pointer items-center gap-3 px-2 py-2.5 transition-colors"
    >
      <Icon weight="duotone" className="text-muted-foreground size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="text-muted-foreground text-xs">
          {FILE_KIND_LABEL[fileKind(file)]}
          {group.older.length > 0
            ? ` · ${group.older.length + 1} versions`
            : ""}
        </p>
      </div>
      <span className="text-muted-foreground hidden w-20 text-right text-xs tabular-nums sm:block">
        {formatBytes(file.size_bytes)}
      </span>
      <span className="text-muted-foreground hidden w-28 text-right text-xs sm:block">
        {formatDate(file.created_at)}
      </span>
      <FavoriteStar
        favorited={favorited}
        onToggle={() => onToggleFavorite(file.id)}
      />
      <a
        href={downloadUrl(file.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Download ${file.name}`}
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <DownloadSimpleIcon className="size-4.5" />
      </a>
    </li>
  );
}

/* ============================================================== preview */

function FilePreviewModal({
  group,
  projects,
  favorited,
  onToggleFavorite,
  onClose,
  onStep,
  hasPrev,
  hasNext,
}: {
  group: FileVersionGroup | null;
  projects: Pick<ClientProject, "id" | "name" | "status">[];
  favorited: boolean;
  onToggleFavorite: (id: string) => void;
  onClose: () => void;
  onStep?: (dir: 1 | -1) => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const file = group?.latest ?? null;
  const kind = file ? previewKind(file.mime_type) : null;
  const project = file?.project_id
    ? projects.find((p) => p.id === file.project_id)
    : null;

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[92svh] gap-0 overflow-hidden p-0 sm:max-w-4xl"
        onKeyDown={(e) => {
          if (!onStep) return;
          if (e.key === "ArrowRight" && hasNext) onStep(1);
          if (e.key === "ArrowLeft" && hasPrev) onStep(-1);
        }}
      >
        {file ? (
          <div className="flex max-h-[92svh] flex-col md:flex-row">
            {/* Preview surface */}
            <div className="bg-muted/30 relative flex min-h-56 flex-1 items-center justify-center overflow-hidden md:min-h-[480px]">
              {kind === "image" ? (
                <img
                  src={`/api/files/${file.id}?inline=1`}
                  alt={file.name}
                  className="max-h-[60svh] max-w-full object-contain md:max-h-[88svh]"
                />
              ) : kind === "pdf" ? (
                <iframe
                  src={`/api/files/${file.id}?inline=1`}
                  title={file.name}
                  className="size-full min-h-[420px]"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                  {(() => {
                    const Icon = KIND_ICON[fileKind(file)];
                    return (
                      <Icon
                        weight="duotone"
                        className="text-muted-foreground size-14"
                      />
                    );
                  })()}
                  <p className="text-muted-foreground max-w-52 text-xs">
                    No inline preview for {FILE_KIND_LABEL[fileKind(file)]}{" "}
                    files — download to open in your design tools.
                  </p>
                </div>
              )}
              {onStep && hasPrev ? (
                <button
                  type="button"
                  onClick={() => onStep(-1)}
                  aria-label="Previous file"
                  className="bg-background/70 hover:bg-background absolute top-1/2 left-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur transition-colors"
                >
                  <CaretLeftIcon className="size-4.5" />
                </button>
              ) : null}
              {onStep && hasNext ? (
                <button
                  type="button"
                  onClick={() => onStep(1)}
                  aria-label="Next file"
                  className="bg-background/70 hover:bg-background absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full backdrop-blur transition-colors"
                >
                  <CaretRightIcon className="size-4.5" />
                </button>
              ) : null}
            </div>

            {/* Metadata panel */}
            <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-t p-5 md:w-72 md:border-t-0 md:border-l">
              <DialogHeader className="space-y-1 pr-8 text-left">
                <DialogTitle className="text-sm break-words">
                  {file.name}
                </DialogTitle>
              </DialogHeader>

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Type</dt>
                <dd>{FILE_KIND_LABEL[fileKind(file)]}</dd>
                <dt className="text-muted-foreground">Size</dt>
                <dd>{formatBytes(file.size_bytes)}</dd>
                <dt className="text-muted-foreground">Added</dt>
                <dd>{formatDate(file.created_at)}</dd>
                <dt className="text-muted-foreground">Category</dt>
                <dd>{CATEGORY_LABEL[file.category]}</dd>
                {project ? (
                  <>
                    <dt className="text-muted-foreground">Project</dt>
                    <dd>{project.name}</dd>
                  </>
                ) : null}
              </dl>

              <div className="flex gap-2">
                <Button asChild size="sm" className="flex-1">
                  <a href={downloadUrl(file.id)}>
                    <DownloadSimpleIcon className="size-4" />
                    Download
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onToggleFavorite(file.id)}
                  aria-pressed={favorited}
                >
                  <StarIcon
                    weight={favorited ? "fill" : "regular"}
                    className={cn("size-4", favorited && "text-yellow-400")}
                  />
                </Button>
              </div>

              {group && group.older.length > 0 ? (
                <div>
                  <p className="text-muted-foreground mb-2 text-[10px] font-medium tracking-[0.14em] uppercase">
                    Version history
                  </p>
                  <ul className="space-y-1.5">
                    {group.older.map((version, i) => (
                      <li
                        key={version.id}
                        className="border-border flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs" title={version.name}>
                            {version.name}
                          </p>
                          <p className="text-muted-foreground text-[10px]">
                            v{group.older.length - i} ·{" "}
                            {formatDate(version.created_at)}
                          </p>
                        </div>
                        <a
                          href={downloadUrl(version.id)}
                          aria-label={`Download ${version.name}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <DownloadSimpleIcon className="size-4" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================== activity */

function ActivityTimeline({
  activity,
  files,
}: {
  activity: FileActivity[];
  files: ClientFile[];
}) {
  if (activity.length === 0) {
    return (
      <div className="border-border flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
        <PulseIcon className="text-muted-foreground size-8" />
        <p className="text-sm font-medium">No activity yet.</p>
      </div>
    );
  }
  const nameFor = (entry: FileActivity) => {
    const detail = entry.detail as { name?: string } | null;
    return (
      files.find((f) => f.id === entry.file_id)?.name ??
      detail?.name ??
      "a file"
    );
  };
  return (
    <ol className="relative space-y-4 pl-5 before:absolute before:top-1 before:bottom-1 before:left-1.5 before:w-px before:bg-border">
      {activity.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            aria-hidden
            className="bg-primary absolute top-1.5 -left-5 size-2 -translate-x-[3.5px] rounded-full"
          />
          <p className="text-sm">
            <span className="font-medium">
              {ACTIVITY_LABEL[entry.action] ?? entry.action}
            </span>{" "}
            <span className="break-words">{nameFor(entry)}</span>
          </p>
          <p className="text-muted-foreground text-xs">
            {formatDate(entry.created_at)}
          </p>
        </li>
      ))}
    </ol>
  );
}
