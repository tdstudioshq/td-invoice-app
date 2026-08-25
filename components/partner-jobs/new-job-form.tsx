"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
  discardPartnerJobFilesAction,
  submitPartnerJobAction,
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
import {
  jobNameSchema,
  notesSchema,
  quantitySchema,
} from "@/lib/partner-jobs/schema";
import {
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
  validatePartnerUploadFile,
} from "@/lib/partner-jobs/uploads";

/**
 * The New Job form.
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

interface ItemRow {
  key: string;
  productType: PartnerProductType | "";
  finish: PartnerProductFinish | "";
  quantity: string;
}

interface FileRow {
  key: string;
  file: File;
  /** 0-100 while uploading; null before the upload starts. */
  progress: number | null;
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyItem(): ItemRow {
  return { key: newKey(), productType: "", finish: "", quantity: "" };
}

export function NewJobForm({ basePath }: { basePath: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jobName, setJobName] = useState("");
  const [notes, setNotes] = useState("");
  // One row to start with: the common case is a single product, and an empty
  // list would make the rep's first action "add" before they can type anything.
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");

  // Survives a failed submit so a retry never re-uploads what already landed.
  const uploadedRef = useRef<UploadedJobFile[]>([]);
  const jobIdRef = useRef<string | null>(null);

  const busy = phase !== "idle";

  const updateItem = useCallback(
    (key: string, patch: Partial<ItemRow>) => {
      setItems((rows) =>
        rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
      );
    },
    [],
  );

  const addItem = useCallback(() => {
    setItems((rows) =>
      rows.length >= MAX_JOB_ITEMS ? rows : [...rows, emptyItem()],
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    // Never leave zero rows — a job with no product is not a job, and an empty
    // list gives the rep nothing to type into.
    setItems((rows) =>
      rows.length <= 1 ? rows : rows.filter((row) => row.key !== key),
    );
  }, []);

  /**
   * Forget any partially-uploaded state.
   *
   * `uploadedRef` is only ever non-empty between a failed submit and the retry
   * that follows it, and the retry finds its pending files by index
   * (`files.slice(uploaded.length)`) — which is only correct while the uploaded
   * files are still a PREFIX of the list. Editing the list breaks that, so any
   * edit resets the pair and the next submit uploads everything again. The
   * stranded objects are handed to the discard action on the way out; if that
   * fails they are logged, never surfaced — the rep's draft is already correct
   * either way.
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
          console.error("could not discard stranded job files", stranded);
        }
      });
    }
  }, []);

  const onPickFiles = useCallback(
    (picked: FileList | null) => {
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
        accepted.push({ key: newKey(), file, progress: null });
      }

      setFiles((rows) => {
        const room = MAX_JOB_FILES - rows.length;
        if (accepted.length > room) {
          rejected.push(`Only ${MAX_JOB_FILES} files can be attached to a job.`);
        }
        return [...rows, ...accepted.slice(0, Math.max(room, 0))];
      });
      for (const message of rejected) toast.error(message);

      // Let the same file be picked again after a removal.
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (accepted.length > 0) resetUploads();
    },
    [resetUploads],
  );

  const removeFile = useCallback(
    (key: string) => {
      setFiles((rows) => rows.filter((row) => row.key !== key));
      resetUploads();
    },
    [resetUploads],
  );

  const totalBytes = useMemo(
    () => files.reduce((sum, row) => sum + row.file.size, 0),
    [files],
  );

  /** Validate the whole form. Returns the parsed items, or null with errors set. */
  function validate() {
    const next: Record<string, string> = {};

    const name = jobNameSchema.safeParse(jobName);
    if (!name.success) next.jobName = name.error.issues[0].message;

    const parsedNotes = notesSchema.safeParse(notes);
    if (!parsedNotes.success) next.notes = parsedNotes.error.issues[0].message;

    const parsedItems: {
      productType: PartnerProductType;
      finish: PartnerProductFinish;
      quantity: number;
    }[] = [];

    items.forEach((row, index) => {
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
      parsedItems.push({
        productType: row.productType,
        finish: row.finish,
        quantity: quantity.data,
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
    // save re-uses what landed the first time).
    const pending = files
      .slice(uploadedRef.current.length)
      .map((row) => row.file);

    let uploaded = uploadedRef.current;
    let jobId = jobIdRef.current;

    if (pending.length > 0) {
      setPhase("uploading");
      const offset = uploadedRef.current.length;
      const result = await uploadJobFiles({
        jobId,
        files: pending,
        alreadyUploaded: uploaded,
        onProgress: (index, percent) => {
          setFiles((rows) =>
            rows.map((row, i) =>
              i === offset + index ? { ...row, progress: percent } : row,
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

    setPhase("saving");
    const result = await submitPartnerJobAction({
      jobId,
      jobName: jobName.trim(),
      notes: notes.trim(),
      items: parsedItems,
      files: uploaded,
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
      resetUploads();
      setFiles((rows) => rows.map((row) => ({ ...row, progress: null })));
      return;
    }

    toast.success(`Job ${result.jobNumber} submitted`);
    router.push(`${basePath}/jobs/${result.jobId}`);
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
              <p className="text-destructive text-xs">{errors.jobName}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((row, index) => (
            <div
              key={row.key}
              className="border-glass-border space-y-3 rounded-[8px] border p-3 sm:p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-muted-foreground text-xs tracking-wide uppercase">
                  Item {index + 1}
                </p>
                {items.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeItem(row.key)}
                    disabled={busy}
                    className="text-muted-foreground hover:text-destructive inline-flex min-h-9 items-center gap-1.5 text-xs transition-colors disabled:opacity-50"
                  >
                    <TrashIcon className="size-4" />
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor={`product-${row.key}`}>Product type</Label>
                  <Select
                    value={row.productType}
                    onValueChange={(value) =>
                      updateItem(row.key, {
                        productType: value as PartnerProductType,
                      })
                    }
                    disabled={busy}
                  >
                    <SelectTrigger id={`product-${row.key}`} className="h-11 w-full">
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
                  <Label htmlFor={`finish-${row.key}`}>Finish</Label>
                  <Select
                    value={row.finish}
                    onValueChange={(value) =>
                      updateItem(row.key, {
                        finish: value as PartnerProductFinish,
                      })
                    }
                    disabled={busy}
                  >
                    <SelectTrigger id={`finish-${row.key}`} className="h-11 w-full">
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
                  <Label htmlFor={`qty-${row.key}`}>Quantity</Label>
                  <Input
                    id={`qty-${row.key}`}
                    value={row.quantity}
                    onChange={(event) =>
                      updateItem(row.key, {
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
                <p className="text-destructive text-xs">
                  {errors[`item-${index}`]}
                </p>
              ) : null}
            </div>
          ))}

          {errors.items ? (
            <p className="text-destructive text-xs">{errors.items}</p>
          ) : null}

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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={PARTNER_ACCEPT_ATTRIBUTE}
            onChange={(event) => onPickFiles(event.target.files)}
            disabled={busy}
            className="sr-only"
            id="job-files"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy || files.length >= MAX_JOB_FILES}
            className="w-full sm:w-auto"
          >
            <PaperclipIcon className="size-4" />
            Attach files
          </Button>
          <p className="text-muted-foreground text-xs">
            {PARTNER_TYPES_LABEL} · up to {MAX_JOB_FILES} files
            {files.length > 0 ? ` · ${formatPartnerBytes(totalBytes)} total` : ""}
          </p>

          {files.length > 0 ? (
            <ul className="space-y-2">
              {files.map((row) => (
                <li
                  key={row.key}
                  className="border-glass-border flex items-center gap-3 rounded-[8px] border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{row.file.name}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatPartnerBytes(row.file.size)}
                      {row.progress !== null ? ` · ${row.progress}%` : ""}
                    </p>
                    {row.progress !== null ? (
                      <div className="bg-glass-highlight/20 mt-1.5 h-1 w-full overflow-hidden rounded-full">
                        <div
                          className="bg-metal-platinum h-full transition-[width] duration-200"
                          style={{ width: `${row.progress}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(row.key)}
                    disabled={busy}
                    aria-label={`Remove ${row.file.name}`}
                    className="text-muted-foreground hover:text-destructive inline-flex size-9 shrink-0 items-center justify-center transition-colors disabled:opacity-50"
                  >
                    <XIcon className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="job-notes" className="sr-only">
            Notes
          </Label>
          <Textarea
            id="job-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={MAX_JOB_NOTES_LENGTH}
            rows={4}
            placeholder="Anything we should know — colours, deadlines, reference links."
            disabled={busy}
            aria-invalid={Boolean(errors.notes)}
          />
          {errors.notes ? (
            <p className="text-destructive text-xs">{errors.notes}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          disabled={busy}
          className="h-11 w-full sm:w-auto"
        >
          {busy ? <SpinnerIcon className="size-4 animate-spin" /> : null}
          {phase === "uploading"
            ? "Uploading files…"
            : phase === "saving"
              ? "Submitting…"
              : "Submit job"}
        </Button>
      </div>
    </form>
  );
}
