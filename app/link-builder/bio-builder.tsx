"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  CopyIcon,
  EyeIcon,
  EyeSlashIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";

import {
  addBioLinkAction,
  createBioPageAction,
  deleteBioLinkAction,
  moveBioLinkAction,
  toggleBioLinkVisibilityAction,
  toggleBioPublishAction,
  updateBioLinkAction,
  updateBioProfileAction,
  uploadBioAvatarAction,
} from "@/app/actions/bio";
import { initialActionState } from "@/app/actions/types";
import { BIO_THEMES, DEFAULT_ACCENT_COLOR } from "@/lib/bio";
import { SubmitButton } from "@/components/shared/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BioLink, BioPageWithLinks } from "@/lib/types/database";

const fieldClass =
  "h-11 rounded-xl border-white/15 bg-white/[0.05] px-3.5 dark:bg-white/[0.05]";
const cardClass =
  "flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md";
const ghostButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:border-white/25 hover:bg-white/[0.12] disabled:opacity-40";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

export function BioBuilder({
  page,
  avatarUrl,
  siteOrigin,
}: {
  page: BioPageWithLinks | null;
  avatarUrl: string | null;
  siteOrigin: string;
}) {
  if (!page) return <CreatePageForm />;

  return (
    <div className="flex flex-col gap-6">
      <PublishSection page={page} siteOrigin={siteOrigin} />
      <ProfileSection page={page} avatarUrl={avatarUrl} />
      <LinksSection links={page.bio_links} />
    </div>
  );
}

// Step 2 — claim a username and create the page.
function CreatePageForm() {
  const [state, formAction] = useActionState(
    createBioPageAction,
    initialActionState,
  );
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className={cardClass}>
      <div className="space-y-1.5">
        <Label htmlFor="username" className="text-white">
          Choose a username
        </Label>
        <Input
          id="username"
          name="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          placeholder="yourname"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          aria-invalid={Boolean(state.fieldErrors?.username)}
          className={fieldClass}
        />
        <FieldError message={state.fieldErrors?.username} />
        <p className="text-muted-foreground text-xs">
          Your page will live at{" "}
          <span className="text-white/80">
            tdstudiosny.com/u/{username || "username"}
          </span>
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="display_name" className="text-white">
          Display name <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="display_name"
          name="display_name"
          placeholder="Your name or brand"
          className={fieldClass}
        />
      </div>

      <SubmitButton
        pendingText="Creating…"
        className="h-11 w-full rounded-xl bg-white text-neutral-900 hover:bg-white/90"
      >
        Create my page
      </SubmitButton>
    </form>
  );
}

// Step 5 / 6 — publish toggle + public URL controls.
function PublishSection({
  page,
  siteOrigin,
}: {
  page: BioPageWithLinks;
  siteOrigin: string;
}) {
  const publicUrl = `${siteOrigin}/u/${page.username}`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex size-2.5 rounded-full ${
              page.is_published ? "bg-emerald-400" : "bg-white/30"
            }`}
          />
          <span className="text-sm font-semibold text-white">
            {page.is_published ? "Published" : "Draft"}
          </span>
        </div>
        <form action={toggleBioPublishAction}>
          <input type="hidden" name="id" value={page.id} />
          <input
            type="hidden"
            name="is_published"
            value={String(page.is_published)}
          />
          <input type="hidden" name="username" value={page.username} />
          <button
            type="submit"
            className="h-9 rounded-xl bg-white px-4 text-sm font-medium text-neutral-900 transition-colors hover:bg-white/90"
          >
            {page.is_published ? "Unpublish" : "Publish"}
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-white">Public link</Label>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-white/80">
            {publicUrl}
          </code>
          <button type="button" onClick={copyUrl} className={ghostButton}>
            <CopyIcon weight="bold" className="size-4" />
            Copy
          </button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className={ghostButton}
          >
            <ArrowSquareOutIcon weight="bold" className="size-4" />
            Visit
          </a>
        </div>
        {!page.is_published ? (
          <p className="text-muted-foreground text-xs">
            Your page is private until you publish it.
          </p>
        ) : null}
      </div>
    </section>
  );
}

// Step 3 — profile fields + avatar upload.
function ProfileSection({
  page,
  avatarUrl,
}: {
  page: BioPageWithLinks;
  avatarUrl: string | null;
}) {
  const [state, formAction] = useActionState(
    updateBioProfileAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) toast.success("Profile saved");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <section className={cardClass}>
      <h2 className="text-sm font-semibold text-white">Profile</h2>

      <AvatarUploader
        avatarUrl={avatarUrl}
        displayName={page.display_name}
        username={page.username}
      />

      <form action={formAction} className="flex flex-col gap-5">
        <div className="space-y-1.5">
          <Label htmlFor="p_username" className="text-white">
            Username
          </Label>
          <Input
            id="p_username"
            name="username"
            defaultValue={page.username}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            aria-invalid={Boolean(state.fieldErrors?.username)}
            className={fieldClass}
          />
          <FieldError message={state.fieldErrors?.username} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="display_name" className="text-white">
            Display name
          </Label>
          <Input
            id="display_name"
            name="display_name"
            defaultValue={page.display_name ?? ""}
            placeholder="Your name or brand"
            aria-invalid={Boolean(state.fieldErrors?.display_name)}
            className={fieldClass}
          />
          <FieldError message={state.fieldErrors?.display_name} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bio" className="text-white">
            Bio
          </Label>
          <Textarea
            id="bio"
            name="bio"
            rows={3}
            defaultValue={page.bio ?? ""}
            placeholder="A short line about you"
            aria-invalid={Boolean(state.fieldErrors?.bio)}
            className="rounded-xl border-white/15 bg-white/[0.05] px-3.5 dark:bg-white/[0.05]"
          />
          <FieldError message={state.fieldErrors?.bio} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="theme" className="text-white">
              Theme
            </Label>
            <select
              id="theme"
              name="theme"
              defaultValue={page.theme}
              className={`${fieldClass} w-full capitalize`}
            >
              {BIO_THEMES.map((t) => (
                <option key={t} value={t} className="bg-neutral-900">
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accent_color" className="text-white">
              Accent color
            </Label>
            <input
              id="accent_color"
              name="accent_color"
              type="color"
              defaultValue={page.accent_color || DEFAULT_ACCENT_COLOR}
              className="h-11 w-full cursor-pointer rounded-xl border border-white/15 bg-white/[0.05] px-1.5"
            />
          </div>
        </div>

        <SubmitButton
          pendingText="Saving…"
          className="h-11 rounded-xl bg-white text-neutral-900 hover:bg-white/90 sm:self-end sm:px-6"
        >
          Save profile
        </SubmitButton>
      </form>
    </section>
  );
}

function initials(name: string | null, username: string): string {
  const source = (name ?? username).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function AvatarUploader({
  avatarUrl,
  displayName,
  username,
}: {
  avatarUrl: string | null;
  displayName: string | null;
  username: string;
}) {
  const [state, formAction] = useActionState(
    uploadBioAvatarAction,
    initialActionState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) toast.success("Avatar updated");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex items-center gap-4 border-b border-white/10 pb-5"
    >
      <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.06] text-lg font-semibold text-white">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          initials(displayName, username)
        )}
      </span>
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="avatar"
          className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm font-medium text-white transition-all hover:border-white/25 hover:bg-white/[0.12]"
        >
          <UploadSimpleIcon weight="bold" className="size-4" />
          Upload avatar
        </Label>
        <input
          id="avatar"
          name="avatar"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={() => formRef.current?.requestSubmit()}
        />
        <p className="text-muted-foreground text-xs">PNG, JPG, or WebP · 2 MB max</p>
        <FieldError message={state.fieldErrors?.avatar} />
      </div>
    </form>
  );
}

// Step 4 — manage links.
function LinksSection({ links }: { links: BioLink[] }) {
  return (
    <section className={cardClass}>
      <h2 className="text-sm font-semibold text-white">Links</h2>

      {links.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No links yet. Add your first one below.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {links.map((link, i) => (
            <LinkRow
              key={link.id}
              link={link}
              isFirst={i === 0}
              isLast={i === links.length - 1}
            />
          ))}
        </ul>
      )}

      <AddLinkForm />
    </section>
  );
}

function LinkRow({
  link,
  isFirst,
  isLast,
}: {
  link: BioLink;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(
    updateBioLinkAction.bind(null, link.id),
    initialActionState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Link updated");
      // Collapse the editor once the link is saved.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(false);
    }
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      {editing ? (
        <form action={formAction} className="flex flex-col gap-3">
          <div className="space-y-1.5">
            <Input
              name="title"
              defaultValue={link.title}
              placeholder="Title"
              required
              aria-invalid={Boolean(state.fieldErrors?.title)}
              className={fieldClass}
            />
            <FieldError message={state.fieldErrors?.title} />
          </div>
          <div className="space-y-1.5">
            <Input
              name="url"
              defaultValue={link.url}
              placeholder="https://example.com"
              required
              aria-invalid={Boolean(state.fieldErrors?.url)}
              className={fieldClass}
            />
            <FieldError message={state.fieldErrors?.url} />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={ghostButton}
            >
              Cancel
            </button>
            <SubmitButton
              pendingText="Saving…"
              className="h-9 rounded-xl bg-white px-4 text-neutral-900 hover:bg-white/90"
            >
              Save
            </SubmitButton>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1.5">
            <form action={moveBioLinkAction}>
              <input type="hidden" name="id" value={link.id} />
              <input type="hidden" name="direction" value="up" />
              <button
                type="submit"
                disabled={isFirst}
                aria-label="Move up"
                className={ghostButton + " size-7 !px-0"}
              >
                <ArrowUpIcon weight="bold" className="size-3.5" />
              </button>
            </form>
            <form action={moveBioLinkAction}>
              <input type="hidden" name="id" value={link.id} />
              <input type="hidden" name="direction" value="down" />
              <button
                type="submit"
                disabled={isLast}
                aria-label="Move down"
                className={ghostButton + " size-7 !px-0"}
              >
                <ArrowDownIcon weight="bold" className="size-3.5" />
              </button>
            </form>
          </div>

          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-w-0 flex-1 text-left"
          >
            <p
              className={`truncate text-sm font-medium ${
                link.is_visible ? "text-white" : "text-white/40 line-through"
              }`}
            >
              {link.title}
            </p>
            <p className="text-muted-foreground truncate text-xs">{link.url}</p>
          </button>

          <form action={toggleBioLinkVisibilityAction}>
            <input type="hidden" name="id" value={link.id} />
            <input
              type="hidden"
              name="is_visible"
              value={String(link.is_visible)}
            />
            <button
              type="submit"
              aria-label={link.is_visible ? "Hide link" : "Show link"}
              className={ghostButton + " size-9 !px-0"}
            >
              {link.is_visible ? (
                <EyeIcon weight="bold" className="size-4" />
              ) : (
                <EyeSlashIcon weight="bold" className="size-4" />
              )}
            </button>
          </form>

          <form action={deleteBioLinkAction}>
            <input type="hidden" name="id" value={link.id} />
            <button
              type="submit"
              aria-label="Delete link"
              className={ghostButton + " size-9 !px-0 hover:text-red-300"}
            >
              <TrashIcon weight="bold" className="size-4" />
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

function AddLinkForm() {
  const [state, formAction] = useActionState(
    addBioLinkAction,
    initialActionState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success("Link added");
      formRef.current?.reset();
    }
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 border-t border-white/10 pt-5"
    >
      <div className="space-y-1.5">
        <Label htmlFor="new_title" className="text-white">
          Add a link
        </Label>
        <Input
          id="new_title"
          name="title"
          placeholder="Title"
          required
          aria-invalid={Boolean(state.fieldErrors?.title)}
          className={fieldClass}
        />
        <FieldError message={state.fieldErrors?.title} />
      </div>
      <div className="space-y-1.5">
        <Input
          name="url"
          placeholder="https://example.com"
          required
          aria-invalid={Boolean(state.fieldErrors?.url)}
          className={fieldClass}
        />
        <FieldError message={state.fieldErrors?.url} />
      </div>
      <SubmitButton
        pendingText="Adding…"
        className="h-11 rounded-xl border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12] sm:self-start sm:px-6"
      >
        <PlusIcon weight="bold" className="size-4" />
        Add link
      </SubmitButton>
    </form>
  );
}
