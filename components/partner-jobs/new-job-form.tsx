"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PaperclipIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  deletePartnerJobAction,
  discardPartnerJobFilesAction,
  submitPartnerJobAction,
  updatePartnerJobAction,
} from "@/app/actions/partner-jobs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { reportError, summarizePaths } from "@/lib/observability/report-error";
import type { DesignJobFile, DesignJobItem } from "@/lib/types/database";
import { previewKind } from "@/lib/portal";
import {
  itemNotesSchema,
  jobNameSchema,
  notesSchema,
  quantitySchema,
} from "@/lib/partner-jobs/schema";
import {
  MAX_ITEM_NOTES_LENGTH,
  MAX_JOB_FILES,
  MAX_JOB_ITEMS,
  MAX_JOB_NAME_LENGTH,
  MAX_JOB_NOTES_LENGTH,
  PARTNER_PRODUCT_FINISHES,
  PARTNER_PRODUCT_FINISH_LABEL,
  PARTNER_PRODUCT_TYPES,
  PARTNER_PRODUCT_TYPE_LABEL,
  type PartnerProductFinish,
  type PartnerProductType,
} from "@/lib/partner-jobs/types";
import {
  uploadJobFiles,
  type UploadedJobFile,
} from "@/lib/partner-jobs/upload-client";
import {
  PARTNER_ACCEPT_ATTRIBUTE,
  PARTNER_TYPES_LABEL,
  formatPartnerBytes,
  isPreviewableImage,
  partnerExtensionOf,
  validatePartnerUploadFile,
} from "@/lib/partner-jobs/uploads";

/**
 * The job form — used to file a new job and to edit an existing one.
 *
 * One component for both because the two differ in three places only: where the
 * initial values come from, which action saves them, and whether already-stored
 * files are on screen. Splitting them would have meant maintaining the same
 * multi-item editor and upload pipeline twice.
 *
 * ARTWORK AND NOTES HANG OFF A PRODUCT, NOT OFF THE JOB.
 * A rep files one job for an 8th bag, a pound bag and a 100ml jar, and the
 * artwork and the instructions differ per product. A single pile of files at the
 * bottom made the studio guess which file was for which — the guessing this
 * portal exists to stop. So each product card owns its own notes box and its own
 * attach control, and every uploaded object carries the product's id.
 *
 * Product ids are minted HERE, in the browser, because a file is attached to a
 * product before either row exists — the same reason a mylar design's id is
 * minted client-side. In edit mode the id IS the stored row's id, which is what
 * lets the server reconcile the item set rather than replace it (replacing would
 * cascade every per-product file away on a rename).
 *
 * NOT a `useActionState` form, for one reason that shapes everything else: file
 * bytes cannot go through a Server Action (Next caps those bodies at ~4 MB), so
 * submitting is a sequence — validate, upload each file straight to Storage with
 * progress, then file the job — and a plain `<form action>` cannot express that.
 * Same call shape as the mylar wizard, which has the same constraint.
 *
 * Ordering matters and is deliberate: the form is validated in full BEFORE the
 * first byte is uploaded. A rep who left the job name blank should learn that
 * instantly, not after pushing 80 MB of artwork.
 *
 * Everything checked here is checked again on the server, and again by the
 * table's constraints. This layer exists for speed of feedback, not for safety.
 */

interface FileRow {
  key: string;
  file: File;
  /** 0-100 while uploading; null before the upload starts. */
  progress: number | null;
  /**
   * Object URL for a raster image, so the rep can SEE what they attached before
   * sending it. Created in the picker (never during render) and revoked the
   * moment the row goes away, since an un-revoked object URL pins the whole file
   * in memory for the life of the tab.
   */
  previewUrl: string | null;
}

interface ItemRow {
  /**
   * Doubles as the React key and as the `design_job_items` primary key the
   * server is asked to write. A fresh uuid for a new product; the stored row's
   * id when editing, so its artwork stays attached.
   */
  id: string;
  productType: PartnerProductType | "";
  finish: PartnerProductFinish | "";
  quantity: string;
  notes: string;
  /** Files picked for THIS product and not yet uploaded. */
  files: FileRow[];
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyItem(): ItemRow {
  return {
    id: newKey(),
    productType: "",
    finish: "",
    quantity: "",
    notes: "",
    files: [],
  };
}

export interface EditableJob {
  id: string;
  jobName: string;
  notes: string | null;
  items: DesignJobItem[];
  files: DesignJobFile[];
}

/**
 * A stored file's row, with its remove/undo toggle. Same markup wherever a saved
 * file appears — under a product, or in the legacy job-wide section.
 *
 * Top-level rather than nested in the form: a component declared inside another
 * component is a new type on every render, so React would unmount and remount
 * every file row on each keystroke — discarding the thumbnail it had already
 * fetched through the authorized redirect.
 */
function StoredFileRow({
  file,
  removed,
  busy,
  onToggle,
}: {
  file: DesignJobFile;
  removed: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const isImage = previewKind(file.mime_type) === "image";
  return (
    <li
      data-removed={removed}
      className="border-glass-border flex items-center gap-3 rounded-[8px] border px-3 py-2.5 data-[removed=true]:opacity-45"
    >
      <span className="border-glass-border bg-glass-highlight/10 flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border">
        {isImage ? (
          <img
            src={`/api/partner-job-files/${file.id}?inline=1`}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <span className="text-metal-platinum text-[11px] tracking-[0.1em] md:text-[10px]">
            {partnerExtensionOf(file.original_filename).toUpperCase() || "FILE"}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          data-removed={removed}
          className="truncate text-sm data-[removed=true]:line-through"
        >
          {file.original_filename}
        </p>
        <p className="text-muted-foreground text-sm tabular-nums md:text-xs">
          {removed
            ? "Will be deleted when you save"
            : formatPartnerBytes(file.file_size)}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-sm transition-colors disabled:opacity-50 md:min-h-9 md:text-xs"
      >
        {removed ? (
          "Undo"
        ) : (
          <>
            <TrashIcon className="size-4" />
            Remove
          </>
        )}
      </button>
    </li>
  );
}

export function NewJobForm({
  basePath,
  job,
}: {
  basePath: string;
  /** Present in edit mode; absent when filing a new job. */
  job?: EditableJob;
}) {
  const editing = Boolean(job);
  const router = useRouter();
  const fileInputs = useRef(new Map<string, HTMLInputElement | null>());

  const [jobName, setJobName] = useState(job?.jobName ?? "");
  const [notes, setNotes] = useState(job?.notes ?? "");
  // One row to start with: the common case is a single product, and an empty
  // list would make the rep's first action "add" before they can type anything.
  const [items, setItems] = useState<ItemRow[]>(() =>
    job && job.items.length > 0
      ? job.items.map((item) => ({
          id: item.id,
          productType: item.product_type,
          finish: item.finish,
          quantity: String(item.quantity),
          notes: item.notes ?? "",
          files: [],
        }))
      : [emptyItem()],
  );
  /** Stored files marked for removal — applied on save, not immediately, so a
   *  mistaken click is undone by simply not saving. */
  const [removedFileIds, setRemovedFileIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");

  // Survives a failed submit so a retry never re-uploads what already landed.
  const uploadedRef = useRef<UploadedJobFile[]>([]);
  /** Every object URL handed to a preview, so unmount can release them all. */
  const objectUrls = useRef<Set<string>>(new Set());
  const jobIdRef = useRef<string | null>(null);

  const busy = phase !== "idle";

  /**
   * Files already stored against this job, split by which product owns them.
   *
   * A null `item_id` is not a gap to fill in: it is every file filed before
   * per-product artwork existed, and it means "the job as a whole". Those keep
   * their own section rather than being guessed onto a product.
   */
  const storedByItem = useMemo(() => {
    const map = new Map<string, DesignJobFile[]>();
    for (const file of job?.files ?? []) {
      if (!file.item_id) continue;
      const list = map.get(file.item_id);
      if (list) list.push(file);
      else map.set(file.item_id, [file]);
    }
    return map;
  }, [job]);

  const jobLevelFiles = useMemo(
    () => (job?.files ?? []).filter((file) => !file.item_id),
    [job],
  );

  /** Pending files across every product, in the order they will be uploaded. */
  const pendingFiles = useMemo(
    () => items.flatMap((item) => item.files.map((row) => ({ itemId: item.id, row }))),
    [items],
  );

  const totalBytes = useMemo(
    () => pendingFiles.reduce((sum, entry) => sum + entry.row.file.size, 0),
    [pendingFiles],
  );

  /** Stored files that will survive the save, plus everything newly picked. */
  const fileCount = useMemo(() => {
    const stored = (job?.files ?? []).filter(
      (file) => !removedFileIds.includes(file.id),
    ).length;
    return stored + pendingFiles.length;
  }, [job, removedFileIds, pendingFiles]);

  const updateItem = useCallback((id: string, patch: Partial<ItemRow>) => {
    setItems((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }, []);

  const addItem = useCallback(() => {
    setItems((rows) =>
      rows.length >= MAX_JOB_ITEMS ? rows : [...rows, emptyItem()],
    );
  }, []);

  /**
   * Forget any partially-uploaded state.
   *
   * `uploadedRef` is only ever non-empty between a failed submit and the retry
   * that follows it, and the retry finds its pending files by index
   * (`pending.slice(uploaded.length)`) — which is only correct while the
   * uploaded files are still a PREFIX of the flattened list. Editing that list
   * — picking, removing, or dropping a whole product — breaks the assumption,
   * so any such edit resets the pair and the next submit uploads everything
   * again. The stranded objects are handed to the discard action on the way
   * out; if that fails they are logged, never surfaced — the rep's draft is
   * already correct either way.
   */
  const resetUploads = useCallback(() => {
    const jobId = jobIdRef.current;
    const stranded = uploadedRef.current;
    uploadedRef.current = [];
    jobIdRef.current = null;
    if (jobId && stranded.length > 0) {
      void discardPartnerJobFilesAction({
        jobId,
        paths: stranded.map((file) => file.path),
      }).then((result) => {
        if (!result.ok) {
          // `stranded` holds each file's Storage key, which embeds the rep's
          // company id and the original artwork filename. The count and the
          // file kinds are what a person debugging this actually needs.
          reportError(
            "partner job file cleanup",
            new Error("stranded job files could not be discarded"),
            summarizePaths(stranded.map((file) => file.path)),
          );
        }
      });
    }
  }, []);

  const removeItem = useCallback(
    (id: string) => {
      // Never leave zero rows — a job with no product is not a job, and an empty
      // list gives the rep nothing to type into.
      setItems((rows) => {
        if (rows.length <= 1) return rows;
        const going = rows.find((row) => row.id === id);
        for (const file of going?.files ?? []) {
          if (file.previewUrl) {
            URL.revokeObjectURL(file.previewUrl);
            objectUrls.current.delete(file.previewUrl);
          }
        }
        return rows.filter((row) => row.id !== id);
      });
      // Its pending files went with it, so the flattened upload list changed.
      resetUploads();
      // Any of its STORED files are about to be cascaded away by the server; the
      // removal list is about explicit per-file removals only, so drop them from
      // it rather than asking for the same delete twice.
      const storedIds = new Set((storedByItem.get(id) ?? []).map((f) => f.id));
      if (storedIds.size > 0) {
        setRemovedFileIds((ids) => ids.filter((fileId) => !storedIds.has(fileId)));
      }
    },
    [resetUploads, storedByItem],
  );

  const onPickFiles = useCallback(
    (itemId: string, picked: FileList | null) => {
      if (!picked || picked.length === 0) return;
      const accepted: FileRow[] = [];
      const rejected: string[] = [];

      for (const file of Array.from(picked)) {
        const invalid = validatePartnerUploadFile(
          file.name,
          file.size,
          file.type || null,
        );
        if (invalid) {
          rejected.push(`${file.name}: ${invalid}`);
          continue;
        }
        let previewUrl: string | null = null;
        if (isPreviewableImage(file.name)) {
          previewUrl = URL.createObjectURL(file);
          objectUrls.current.add(previewUrl);
        }
        accepted.push({ key: newKey(), file, progress: null, previewUrl });
      }

      // The cap is job-wide, so the room left depends on every other product
      // too — computed inside the updater against current state rather than
      // from a value captured when the picker opened.
      setItems((rows) => {
        const used =
          rows.reduce((sum, row) => sum + row.files.length, 0) +
          (job?.files ?? []).filter((f) => !removedFileIds.includes(f.id)).length;
        const room = MAX_JOB_FILES - used;
        if (accepted.length > room) {
          rejected.push(`Only ${MAX_JOB_FILES} files can be attached to a job.`);
        }
        const taking = accepted.slice(0, Math.max(room, 0));
        // Anything that did not fit never reaches the DOM, so release its
        // preview here or it pins the file for the life of the tab.
        for (const spare of accepted.slice(taking.length)) {
          if (spare.previewUrl) {
            URL.revokeObjectURL(spare.previewUrl);
            objectUrls.current.delete(spare.previewUrl);
          }
        }
        if (taking.length === 0) return rows;
        return rows.map((row) =>
          row.id === itemId ? { ...row, files: [...row.files, ...taking] } : row,
        );
      });
      for (const message of rejected) toast.error(message);

      // Let the same file be picked again after a removal.
      const input = fileInputs.current.get(itemId);
      if (input) input.value = "";
      if (accepted.length > 0) resetUploads();
    },
    [job, removedFileIds, resetUploads],
  );

  const toggleRemoved = useCallback((fileId: string) => {
    setRemovedFileIds((ids) =>
      ids.includes(fileId) ? ids.filter((id) => id !== fileId) : [...ids, fileId],
    );
  }, []);

  const removeFile = useCallback(
    (itemId: string, key: string) => {
      setItems((rows) =>
        rows.map((row) => {
          if (row.id !== itemId) return row;
          const going = row.files.find((file) => file.key === key);
          if (going?.previewUrl) {
            URL.revokeObjectURL(going.previewUrl);
            objectUrls.current.delete(going.previewUrl);
          }
          return { ...row, files: row.files.filter((file) => file.key !== key) };
        }),
      );
      resetUploads();
    },
    [resetUploads],
  );

  // Release every outstanding object URL when the form unmounts — navigating
  // away mid-draft would otherwise strand them for the life of the tab. The set
  // is only ever written from event handlers, and copied into a local at setup
  // so the cleanup closes over the same object it was given.
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  /** Validate the whole form. Returns the parsed items, or null with errors set. */
  function validate() {
    const next: Record<string, string> = {};

    const name = jobNameSchema.safeParse(jobName);
    if (!name.success) next.jobName = name.error.issues[0].message;

    // Only reachable on a job that already had job-wide notes; new jobs put
    // their notes on the products.
    const parsedNotes = notesSchema.safeParse(notes);
    if (!parsedNotes.success) next.notes = parsedNotes.error.issues[0].message;

    const parsedItems: {
      id: string;
      productType: PartnerProductType;
      finish: PartnerProductFinish;
      quantity: number;
      notes: string;
    }[] = [];

    items.forEach((row, index) => {
      const itemNotes = itemNotesSchema.safeParse(row.notes);
      if (!itemNotes.success) {
        next[`item-notes-${index}`] = itemNotes.error.issues[0].message;
      }
      if (!row.productType) {
        next[`item-${index}`] = "Choose a product.";
        return;
      }
      if (!row.finish) {
        next[`item-${index}`] = "Choose a finish.";
        return;
      }
      const quantity = quantitySchema.safeParse(Number(row.quantity));
      if (!quantity.success) {
        next[`item-${index}`] = quantity.error.issues[0].message;
        return;
      }
      if (!itemNotes.success) return;
      parsedItems.push({
        id: row.id,
        productType: row.productType,
        finish: row.finish,
        quantity: quantity.data,
        notes: itemNotes.data,
      });
    });

    setErrors(next);
    if (Object.keys(next).length > 0) return null;
    return parsedItems;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const parsedItems = validate();
    if (!parsedItems) {
      toast.error("Check the highlighted fields and try again.");
      return;
    }

    // Only the files that have not already been sent (a retry after a failed
    // save re-uses what landed the first time). `pendingFiles` is the flattened
    // list in product order, and the uploaded ones are always a prefix of it.
    const alreadySent = uploadedRef.current.length;
    const outstanding = pendingFiles.slice(alreadySent);

    let uploaded = uploadedRef.current;
    // An edit uploads into the job's EXISTING prefix, so the id is known up
    // front rather than minted by the first ticket.
    let jobId = editing ? job!.id : jobIdRef.current;

    if (outstanding.length > 0) {
      setPhase("uploading");
      const result = await uploadJobFiles({
        jobId,
        files: outstanding.map((entry) => entry.row.file),
        alreadyUploaded: uploaded,
        onProgress: (index, percent) => {
          const target = outstanding[index];
          if (!target) return;
          setItems((rows) =>
            rows.map((row) =>
              row.id === target.itemId
                ? {
                    ...row,
                    files: row.files.map((file) =>
                      file.key === target.row.key ? { ...file, progress: percent } : file,
                    ),
                  }
                : row,
            ),
          );
        },
      });

      // Whatever DID upload is kept either way, so a retry doesn't resend it and
      // a discard can still find it.
      uploadedRef.current = result.files;
      jobIdRef.current = result.jobId;
      uploaded = result.files;
      jobId = result.jobId;

      if (!result.ok) {
        setPhase("idle");
        toast.error(result.error);
        return;
      }
    }

    // Re-attach each uploaded object to the product it was picked for. The
    // uploader returns keys in the order it was given them, which is
    // `pendingFiles` order — so the two line up by index.
    const filesWithOwner = uploaded.map((file, index) => ({
      ...file,
      itemId: pendingFiles[index]?.itemId ?? null,
    }));

    setPhase("saving");
    const result = editing
      ? await updatePartnerJobAction({
          jobId: job!.id,
          jobName: jobName.trim(),
          notes: notes.trim(),
          items: parsedItems,
          addFiles: filesWithOwner,
          removeFileIds: removedFileIds,
        })
      : await submitPartnerJobAction({
          jobId,
          jobName: jobName.trim(),
          notes: notes.trim(),
          items: parsedItems,
          files: filesWithOwner,
        });

    if ("error" in result) {
      setPhase("idle");
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      // The job was not filed, so the objects belong to nothing. Drop them
      // rather than leaving bytes in a private bucket nothing references — best
      // effort, and never something the rep has to care about. Resetting here
      // also means the retry re-uploads from a known-clean state instead of
      // trying to reconcile a half-finished one.
      // Only a NEW job's uploads are orphans worth reclaiming. On an edit the
      // job already exists, so the discard action refuses by design — the files
      // stay uploaded and a retry simply re-attaches them.
      if (!editing) {
        resetUploads();
        setItems((rows) =>
          rows.map((row) => ({
            ...row,
            files: row.files.map((file) => ({ ...file, progress: null })),
          })),
        );
      }
      return;
    }

    toast.success(
      editing ? `Job ${result.jobNumber} updated` : `Job ${result.jobNumber} submitted`,
    );
    router.push(`${basePath}/jobs/${result.jobId}`);
    router.refresh();
  }

  async function onDelete() {
    if (!job || busy || deleting) return;
    setDeleting(true);
    const result = await deletePartnerJobAction({ jobId: job.id });
    if ("error" in result) {
      setDeleting(false);
      toast.error(result.error);
      return;
    }
    toast.success("Job deleted");
    router.push(`${basePath}/jobs`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Job details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="job-name">Job name</Label>
            <Input
              id="job-name"
              value={jobName}
              onChange={(event) => setJobName(event.target.value)}
              maxLength={MAX_JOB_NAME_LENGTH}
              placeholder="Mike's Exotics Summer Run"
              autoComplete="off"
              required
              disabled={busy}
              aria-invalid={Boolean(errors.jobName)}
              className="h-11"
            />
            {errors.jobName ? (
              <p className="text-destructive text-sm md:text-xs">{errors.jobName}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <p className="text-muted-foreground text-sm leading-relaxed md:text-xs">
            Attach the artwork and notes for each product to that product, so we
            never have to guess which file belongs where.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((row, index) => {
            // Files marked for removal stay on screen, struck through, so the
            // toggle below can undo them.
            const stored = storedByItem.get(row.id) ?? [];
            return (
              <div
                key={row.id}
                className="border-glass-border space-y-4 rounded-[8px] border p-3 sm:p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-muted-foreground text-[13px] tracking-wide uppercase md:text-xs">
                    Item {index + 1}
                  </p>
                  {items.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeItem(row.id)}
                      disabled={busy}
                      className="text-muted-foreground hover:text-destructive inline-flex min-h-11 items-center gap-1.5 text-sm transition-colors disabled:opacity-50 md:min-h-9 md:text-xs"
                    >
                      <TrashIcon className="size-4" />
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`product-${row.id}`}>Product type</Label>
                    <Select
                      value={row.productType}
                      onValueChange={(value) =>
                        updateItem(row.id, {
                          productType: value as PartnerProductType,
                        })
                      }
                      disabled={busy}
                    >
                      <SelectTrigger id={`product-${row.id}`} className="h-11 w-full">
                        <SelectValue placeholder="Choose a product" />
                      </SelectTrigger>
                      <SelectContent>
                        {PARTNER_PRODUCT_TYPES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {PARTNER_PRODUCT_TYPE_LABEL[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`finish-${row.id}`}>Finish</Label>
                    <Select
                      value={row.finish}
                      onValueChange={(value) =>
                        updateItem(row.id, {
                          finish: value as PartnerProductFinish,
                        })
                      }
                      disabled={busy}
                    >
                      <SelectTrigger id={`finish-${row.id}`} className="h-11 w-full">
                        <SelectValue placeholder="Choose a finish" />
                      </SelectTrigger>
                      <SelectContent>
                        {PARTNER_PRODUCT_FINISHES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {PARTNER_PRODUCT_FINISH_LABEL[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 sm:w-32">
                    <Label htmlFor={`qty-${row.id}`}>Quantity</Label>
                    <Input
                      id={`qty-${row.id}`}
                      value={row.quantity}
                      onChange={(event) =>
                        updateItem(row.id, {
                          quantity: event.target.value.replace(/[^\d]/g, ""),
                        })
                      }
                      inputMode="numeric"
                      placeholder="1000"
                      autoComplete="off"
                      disabled={busy}
                      className="h-11 tabular-nums"
                    />
                  </div>
                </div>

                {errors[`item-${index}`] ? (
                  <p className="text-destructive text-sm md:text-xs">
                    {errors[`item-${index}`]}
                  </p>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor={`item-notes-${row.id}`}>Notes for this product</Label>
                  <Textarea
                    id={`item-notes-${row.id}`}
                    value={row.notes}
                    onChange={(event) => updateItem(row.id, { notes: event.target.value })}
                    maxLength={MAX_ITEM_NOTES_LENGTH}
                    rows={3}
                    placeholder="Colours, finish details, anything specific to this product."
                    disabled={busy}
                    aria-invalid={Boolean(errors[`item-notes-${index}`])}
                  />
                  {errors[`item-notes-${index}`] ? (
                    <p className="text-destructive text-sm md:text-xs">
                      {errors[`item-notes-${index}`]}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor={`files-${row.id}`}>Artwork for this product</Label>

                  {stored.length > 0 ? (
                    <ul className="space-y-2">
                      {stored.map((file) => (
                        <StoredFileRow
                          key={file.id}
                          file={file}
                          removed={removedFileIds.includes(file.id)}
                          busy={busy}
                          onToggle={() => toggleRemoved(file.id)}
                        />
                      ))}
                    </ul>
                  ) : null}

                  <input
                    ref={(node) => {
                      fileInputs.current.set(row.id, node);
                    }}
                    type="file"
                    multiple
                    accept={PARTNER_ACCEPT_ATTRIBUTE}
                    onChange={(event) => onPickFiles(row.id, event.target.files)}
                    disabled={busy}
                    className="sr-only"
                    id={`files-${row.id}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputs.current.get(row.id)?.click()}
                    disabled={busy || fileCount >= MAX_JOB_FILES}
                    className="w-full sm:w-auto"
                  >
                    <PaperclipIcon className="size-4" />
                    Attach files
                  </Button>

                  {row.files.length > 0 ? (
                    <ul className="space-y-2">
                      {row.files.map((file) => (
                        <li
                          key={file.key}
                          className="border-glass-border flex items-center gap-3 rounded-[8px] border px-3 py-2.5"
                        >
                          <span className="border-glass-border bg-glass-highlight/10 flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border">
                            {file.previewUrl ? (
                              <img
                                src={file.previewUrl}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              <span className="text-metal-platinum text-[11px] tracking-[0.1em] md:text-[10px]">
                                {partnerExtensionOf(file.file.name).toUpperCase() || "FILE"}
                              </span>
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{file.file.name}</p>
                            <p className="text-muted-foreground text-sm tabular-nums md:text-xs">
                              {formatPartnerBytes(file.file.size)}
                              {file.progress !== null ? ` · ${file.progress}%` : ""}
                            </p>
                            {file.progress !== null ? (
                              <div className="bg-glass-highlight/20 mt-1.5 h-1 w-full overflow-hidden rounded-full">
                                <div
                                  className="bg-metal-platinum h-full transition-[width] duration-200"
                                  style={{ width: `${file.progress}%` }}
                                />
                              </div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(row.id, file.key)}
                            disabled={busy}
                            aria-label={`Remove ${file.file.name}`}
                            className="text-muted-foreground hover:text-destructive inline-flex size-9 shrink-0 items-center justify-center transition-colors disabled:opacity-50"
                          >
                            <XIcon className="size-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            );
          })}

          {errors.items ? (
            <p className="text-destructive text-sm md:text-xs">{errors.items}</p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={addItem}
              disabled={busy || items.length >= MAX_JOB_ITEMS}
              className="w-full sm:w-auto"
            >
              <PlusIcon className="size-4" weight="bold" />
              Add item
            </Button>
            <p className="text-muted-foreground text-sm leading-relaxed md:text-xs">
              {PARTNER_TYPES_LABEL} · {fileCount}/{MAX_JOB_FILES} files
              {totalBytes > 0 ? ` · ${formatPartnerBytes(totalBytes)} to upload` : ""}
            </p>
          </div>
        </CardContent>
      </Card>

      {/*
        Both sections below exist ONLY for jobs filed before artwork and notes
        moved onto the products. They are shown when there is something there to
        preserve, and never on a new job — which is the whole point of the
        change: no catch-all box at the bottom for a rep to default into.
      */}
      {editing && jobLevelFiles.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Job files</CardTitle>
            <p className="text-muted-foreground text-sm leading-relaxed md:text-xs">
              Attached before this job listed artwork per product. Remove them
              here, or add them again under the product they belong to.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {jobLevelFiles.map((file) => (
                <StoredFileRow
                  key={file.id}
                  file={file}
                  removed={removedFileIds.includes(file.id)}
                  busy={busy}
                  onToggle={() => toggleRemoved(file.id)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {editing && (job!.notes ?? "").trim() !== "" ? (
        <Card>
          <CardHeader>
            <CardTitle>Job notes</CardTitle>
            <p className="text-muted-foreground text-sm leading-relaxed md:text-xs">
              Notes for the job as a whole. New notes belong on the product they
              describe.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label htmlFor="job-notes" className="sr-only">
              Job notes
            </Label>
            <Textarea
              id="job-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={MAX_JOB_NOTES_LENGTH}
              rows={4}
              disabled={busy}
              aria-invalid={Boolean(errors.notes)}
            />
            {errors.notes ? (
              <p className="text-destructive text-sm md:text-xs">{errors.notes}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {editing ? (
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            disabled={busy || deleting}
            className="text-destructive hover:text-destructive h-11 w-full sm:w-auto"
          >
            {deleting ? <SpinnerIcon className="size-4 animate-spin" /> : <TrashIcon className="size-4" />}
            {deleting ? "Deleting…" : "Delete job"}
          </Button>
        ) : (
          <span />
        )}

        <Button
          type="submit"
          disabled={busy || deleting}
          className="h-11 w-full sm:w-auto"
        >
          {busy ? <SpinnerIcon className="size-4 animate-spin" /> : null}
          {phase === "uploading"
            ? "Uploading files…"
            : phase === "saving"
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Submit job"}
        </Button>
      </div>
    </form>
  );
}
