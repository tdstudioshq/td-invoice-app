"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  CloudCheckIcon,
  CopyIcon,
  EyeIcon,
  EyeSlashIcon,
  PaletteIcon,
  PlusIcon,
  SlidersIcon,
  SpinnerGapIcon,
  SquaresFourIcon,
  TrashIcon,
  UploadSimpleIcon,
  UserIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import {
  createBioPageAction,
  saveBioPageAction,
  toggleBioPublishAction,
  uploadBioAvatarAction,
  type SaveBioPageInput,
} from "@/app/actions/bio";
import { initialActionState } from "@/app/actions/types";
import { BioPageRender } from "@/components/bio/bio-page-render";
import {
  BIO_BUTTON_SHAPES,
  BIO_BUTTON_STYLES,
  BIO_FONTS,
  BIO_SPACING,
  BIO_THEMES,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_ACCENT_COLOR_2,
  coerceButtonShape,
  coerceButtonStyle,
  coerceFont,
  coerceSpacing,
  coerceTheme,
  type BioButtonShape,
  type BioButtonStyle,
  type BioFont,
  type BioSpacing,
  type BioTheme,
} from "@/lib/bio";
import { SubmitButton } from "@/components/shared/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BioPageWithLinks } from "@/lib/types/database";

const fieldClass =
  "h-11 rounded-xl border-white/15 bg-white/[0.05] px-3.5 dark:bg-white/[0.05]";
const cardClass =
  "flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md";
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
    <BioEditor page={page} initialAvatarUrl={avatarUrl} siteOrigin={siteOrigin} />
  );
}

// ---------------------------------------------------------------------------
// Create flow (unchanged) — claim a username, then the visual editor takes over.
// ---------------------------------------------------------------------------
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
    <form action={formAction} className={`mx-auto w-full max-w-md ${cardClass}`}>
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

// ---------------------------------------------------------------------------
// The real-time visual editor. Local state is the single source of truth; the
// preview renders straight from it (no DB round-trip), and a debounced autosave
// persists the whole snapshot through saveBioPageAction.
// ---------------------------------------------------------------------------

type EditorLink = {
  clientId: string;
  id: string | null;
  title: string;
  url: string;
  is_visible: boolean;
};

type EditorModel = {
  username: string;
  display_name: string;
  bio: string;
  theme: BioTheme;
  accent_color: string;
  accent_color_2: string;
  font_family: BioFont;
  button_style: BioButtonStyle;
  button_shape: BioButtonShape;
  spacing: BioSpacing;
  links: EditorLink[];
};

type SaveStatus = "saved" | "pending" | "saving" | "error";
type Section = "profile" | "theme" | "buttons" | "links";

const AUTOSAVE_MS = 800;

function tmpId(): string {
  return `tmp_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function modelFromPage(page: BioPageWithLinks): EditorModel {
  return {
    username: page.username,
    display_name: page.display_name ?? "",
    bio: page.bio ?? "",
    theme: coerceTheme(page.theme),
    accent_color: page.accent_color || DEFAULT_ACCENT_COLOR,
    accent_color_2: page.accent_color_2 || DEFAULT_ACCENT_COLOR_2,
    font_family: coerceFont(page.font_family),
    button_style: coerceButtonStyle(page.button_style),
    button_shape: coerceButtonShape(page.button_shape),
    spacing: coerceSpacing(page.spacing),
    links: page.bio_links.map((l) => ({
      clientId: l.id,
      id: l.id,
      title: l.title,
      url: l.url,
      is_visible: l.is_visible,
    })),
  };
}

// Content-only signature: drives "is there anything to save?" and excludes the
// clientId→dbId reconciliation so adopting new ids doesn't trigger a re-save.
function signatureOf(m: EditorModel): string {
  return JSON.stringify({
    u: m.username,
    d: m.display_name,
    b: m.bio,
    t: m.theme,
    a: m.accent_color,
    a2: m.accent_color_2,
    f: m.font_family,
    bs: m.button_style,
    bp: m.button_shape,
    sp: m.spacing,
    l: m.links.map((l) => [l.title, l.url, l.is_visible]),
  });
}

function toInput(m: EditorModel): SaveBioPageInput {
  return {
    username: m.username,
    display_name: m.display_name,
    bio: m.bio,
    theme: m.theme,
    accent_color: m.accent_color,
    accent_color_2: m.accent_color_2,
    font_family: m.font_family,
    button_style: m.button_style,
    button_shape: m.button_shape,
    spacing: m.spacing,
    links: m.links.map((l) => ({
      clientId: l.clientId,
      id: l.id,
      title: l.title,
      url: l.url,
      is_visible: l.is_visible,
    })),
  };
}

function BioEditor({
  page,
  initialAvatarUrl,
  siteOrigin,
}: {
  page: BioPageWithLinks;
  initialAvatarUrl: string | null;
  siteOrigin: string;
}) {
  const [model, setModel] = useState<EditorModel>(() => modelFromPage(page));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [published, setPublished] = useState(page.is_published);
  const [section, setSection] = useState<Section>("profile");
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [linkErrors, setLinkErrors] = useState<
    Record<string, { title?: string; url?: string }>
  >({});

  const signature = signatureOf(model);

  // Refs let the debounced save always read the latest values without becoming
  // a dependency. The model ref is synced in an effect (never during render).
  const modelRef = useRef(model);
  const savedSigRef = useRef(signature);
  const savingRef = useRef(false);
  // Bumped after a save completes when newer edits arrived mid-flight, so a
  // follow-up save runs without runSave having to call itself.
  const [retrySignal, setRetrySignal] = useState(0);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const runSave = useCallback(async () => {
    if (savingRef.current) return; // a save is already in flight
    const snapshot = signatureOf(modelRef.current);
    if (snapshot === savedSigRef.current) {
      setStatus("saved");
      return;
    }
    savingRef.current = true;
    setStatus("saving");

    const result = await saveBioPageAction(toInput(modelRef.current));
    savingRef.current = false;

    if (result.error) {
      setStatus("error");
      toast.error(result.error);
      return; // editing again will re-trigger; "Save now" is also offered
    }
    if (result.fieldErrors) {
      setStatus("error");
      setFieldErrors(result.fieldErrors);
      return;
    }

    setFieldErrors({});
    setLinkErrors(result.linkErrors ?? {});
    // Adopt server-assigned ids so the next save updates instead of re-inserts.
    if (result.idMap) {
      const map = result.idMap;
      setModel((prev) => ({
        ...prev,
        links: prev.links.map((l) =>
          map[l.clientId] ? { ...l, id: map[l.clientId] } : l,
        ),
      }));
    }
    savedSigRef.current = snapshot;

    // Edits landed while this save was in flight → queue one more pass.
    if (signatureOf(modelRef.current) !== snapshot) {
      setStatus("pending");
      setRetrySignal((x) => x + 1);
    } else {
      setStatus("saved");
    }
  }, []);

  // Debounced autosave: fires AUTOSAVE_MS after the content signature changes.
  useEffect(() => {
    if (signature === savedSigRef.current) return;
    setStatus("pending");
    const t = setTimeout(() => void runSave(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [signature, runSave]);

  // Follow-up pass for edits that arrived during the previous save.
  useEffect(() => {
    if (retrySignal === 0) return;
    void runSave();
  }, [retrySignal, runSave]);

  // ---- model mutators (instant local updates) ----
  function patch<K extends keyof EditorModel>(key: K, value: EditorModel[K]) {
    setModel((m) => ({ ...m, [key]: value }));
  }
  function addLink() {
    setModel((m) => ({
      ...m,
      links: [
        ...m.links,
        { clientId: tmpId(), id: null, title: "", url: "", is_visible: true },
      ],
    }));
    setSection("links");
  }
  function updateLink(clientId: string, p: Partial<EditorLink>) {
    setModel((m) => ({
      ...m,
      links: m.links.map((l) => (l.clientId === clientId ? { ...l, ...p } : l)),
    }));
  }
  function removeLink(clientId: string) {
    setModel((m) => ({
      ...m,
      links: m.links.filter((l) => l.clientId !== clientId),
    }));
    setLinkErrors((e) => {
      if (!(clientId in e)) return e;
      const rest = { ...e };
      delete rest[clientId];
      return rest;
    });
  }
  function moveLink(clientId: string, dir: "up" | "down") {
    setModel((m) => {
      const i = m.links.findIndex((l) => l.clientId === clientId);
      const j = dir === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= m.links.length) return m;
      const links = [...m.links];
      [links[i], links[j]] = [links[j], links[i]];
      return { ...m, links };
    });
  }

  async function onAvatarFile(file: File) {
    const objectUrl = URL.createObjectURL(file);
    setAvatarUrl(objectUrl); // instant preview, no round-trip
    const fd = new FormData();
    fd.set("avatar", file);
    const res = await uploadBioAvatarAction(initialActionState, fd);
    if (res.error || res.fieldErrors?.avatar) {
      toast.error(res.error ?? res.fieldErrors?.avatar ?? "Upload failed");
    } else if (res.avatarUrl) {
      setAvatarUrl(res.avatarUrl);
      URL.revokeObjectURL(objectUrl);
      toast.success("Avatar updated");
    }
  }

  async function togglePublish() {
    const next = !published;
    setPublished(next);
    const fd = new FormData();
    fd.set("id", page.id);
    fd.set("is_published", String(published));
    fd.set("username", modelRef.current.username);
    await toggleBioPublishAction(fd);
    toast.success(next ? "Page published" : "Page unpublished");
  }

  const publicUrl = `${siteOrigin}/u/${model.username || page.username}`;
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  // Preview data, straight from local state.
  const previewLinks = useMemo(
    () =>
      model.links
        .filter((l) => l.is_visible)
        .map((l) => ({ id: l.clientId, title: l.title, url: l.url })),
    [model.links],
  );

  return (
    <div className="grid w-full gap-5 lg:grid-cols-[210px_minmax(0,1fr)_360px]">
      {/* LEFT — settings sidebar */}
      <aside className="flex flex-col gap-4">
        <SaveIndicator status={status} onSaveNow={() => void runSave()} />

        <nav className={`${cardClass} gap-1.5 p-3`}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                section === s.id
                  ? "bg-white/[0.12] text-white"
                  : "text-white/60 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <s.icon weight="bold" className="size-4 shrink-0" />
              {s.label}
            </button>
          ))}
        </nav>

        <PublishCard
          published={published}
          onToggle={togglePublish}
          publicUrl={publicUrl}
          onCopy={copyUrl}
        />
      </aside>

      {/* CENTER — editing controls */}
      <section className="min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {section === "profile" && (
              <ProfileControls
                model={model}
                patch={patch}
                avatarUrl={avatarUrl}
                onAvatarFile={onAvatarFile}
                usernameError={fieldErrors.username}
              />
            )}
            {section === "theme" && <ThemeControls model={model} patch={patch} />}
            {section === "buttons" && (
              <ButtonControls model={model} patch={patch} />
            )}
            {section === "links" && (
              <LinksControls
                links={model.links}
                errors={linkErrors}
                onAdd={addLink}
                onUpdate={updateLink}
                onRemove={removeLink}
                onMove={moveLink}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* RIGHT — live mobile preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <PhonePreview>
          <BioPageRender
            page={{
              username: model.username || "username",
              display_name: model.display_name || null,
              bio: model.bio || null,
              theme: model.theme,
              accent_color: model.accent_color,
              accent_color_2: model.accent_color_2,
              font_family: model.font_family,
              button_style: model.button_style,
              button_shape: model.button_shape,
              spacing: model.spacing,
            }}
            links={previewLinks}
            avatarUrl={avatarUrl}
            interactive={false}
          />
        </PhonePreview>
      </div>
    </div>
  );
}

const SECTIONS: { id: Section; label: string; icon: typeof UserIcon }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "theme", label: "Theme", icon: PaletteIcon },
  { id: "buttons", label: "Buttons", icon: SquaresFourIcon },
  { id: "links", label: "Links", icon: SlidersIcon },
];

// ---- save status ----
function SaveIndicator({
  status,
  onSaveNow,
}: {
  status: SaveStatus;
  onSaveNow: () => void;
}) {
  const config = {
    saved: { icon: CloudCheckIcon, text: "All changes saved", spin: false },
    pending: { icon: SpinnerGapIcon, text: "Editing…", spin: false },
    saving: { icon: SpinnerGapIcon, text: "Saving…", spin: true },
    error: { icon: WarningCircleIcon, text: "Couldn't save", spin: false },
  }[status];
  const Icon = config.icon;

  return (
    <div className={`${cardClass} flex-row items-center justify-between gap-2 p-3`}>
      <motion.span
        key={status}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`flex items-center gap-2 text-xs font-medium ${
          status === "error" ? "text-red-300" : "text-white/70"
        }`}
      >
        <Icon
          weight="bold"
          className={`size-4 ${config.spin ? "animate-spin" : ""}`}
        />
        {config.text}
      </motion.span>
      {status === "pending" || status === "error" ? (
        <button
          type="button"
          onClick={onSaveNow}
          className="rounded-lg px-2 py-1 text-xs font-medium text-white/80 hover:bg-white/[0.08] hover:text-white"
        >
          Save now
        </button>
      ) : null}
    </div>
  );
}

function PublishCard({
  published,
  onToggle,
  publicUrl,
  onCopy,
}: {
  published: boolean;
  onToggle: () => void;
  publicUrl: string;
  onCopy: () => void;
}) {
  return (
    <div className={`${cardClass} gap-4 p-4`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <span
            className={`inline-flex size-2.5 rounded-full ${
              published ? "bg-emerald-400" : "bg-white/30"
            }`}
          />
          {published ? "Published" : "Draft"}
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="h-8 rounded-xl bg-white px-3 text-xs font-medium text-neutral-900 transition-colors hover:bg-white/90"
        >
          {published ? "Unpublish" : "Publish"}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <code className="truncate rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-2 text-xs text-white/70">
          {publicUrl}
        </code>
        <div className="flex gap-2">
          <button type="button" onClick={onCopy} className={`${ghostButton} flex-1 !py-1.5 text-xs`}>
            <CopyIcon weight="bold" className="size-3.5" />
            Copy
          </button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className={`${ghostButton} flex-1 !py-1.5 text-xs`}
          >
            <ArrowSquareOutIcon weight="bold" className="size-3.5" />
            Visit
          </a>
        </div>
      </div>
    </div>
  );
}

// ---- segmented control ----
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const layoutId = useId();
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`relative rounded-lg px-2 py-2 text-xs font-medium capitalize transition-colors ${
            value === o.value ? "text-neutral-900" : "text-white/60 hover:text-white"
          }`}
        >
          {value === o.value ? (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-lg bg-white"
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
            />
          ) : null}
          <span className="relative z-10">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-white">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-white/15 bg-white/[0.05] px-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className={`${fieldClass} font-mono uppercase`}
        />
      </div>
    </div>
  );
}

type PatchFn = <K extends keyof EditorModel>(k: K, v: EditorModel[K]) => void;

function ProfileControls({
  model,
  patch,
  avatarUrl,
  onAvatarFile,
  usernameError,
}: {
  model: EditorModel;
  patch: PatchFn;
  avatarUrl: string | null;
  onAvatarFile: (f: File) => void;
  usernameError?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className={cardClass}>
      <h2 className="text-sm font-semibold text-white">Profile</h2>

      <div className="flex items-center gap-4 border-b border-white/10 pb-5">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.06] text-lg font-semibold text-white">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            (model.display_name || model.username || "?").slice(0, 2).toUpperCase()
          )}
        </span>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm font-medium text-white transition-all hover:border-white/25 hover:bg-white/[0.12]"
          >
            <UploadSimpleIcon weight="bold" className="size-4" />
            Upload avatar
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAvatarFile(f);
              e.target.value = "";
            }}
          />
          <p className="text-muted-foreground text-xs">PNG, JPG, or WebP · 2 MB max</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="username" className="text-white">
          Username
        </Label>
        <Input
          id="username"
          value={model.username}
          onChange={(e) => patch("username", e.target.value.toLowerCase())}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={Boolean(usernameError)}
          className={fieldClass}
        />
        <FieldError message={usernameError} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="display_name" className="text-white">
          Display name
        </Label>
        <Input
          id="display_name"
          value={model.display_name}
          onChange={(e) => patch("display_name", e.target.value)}
          placeholder="Your name or brand"
          className={fieldClass}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bio" className="text-white">
          Bio
        </Label>
        <Textarea
          id="bio"
          value={model.bio}
          onChange={(e) => patch("bio", e.target.value)}
          rows={3}
          maxLength={280}
          placeholder="A short line about you"
          className="rounded-xl border-white/15 bg-white/[0.05] px-3.5 dark:bg-white/[0.05]"
        />
        <p className="text-muted-foreground text-right text-xs">
          {model.bio.length}/280
        </p>
      </div>
    </div>
  );
}

function ThemeControls({ model, patch }: { model: EditorModel; patch: PatchFn }) {
  return (
    <div className={cardClass}>
      <h2 className="text-sm font-semibold text-white">Theme &amp; color</h2>

      <div className="space-y-1.5">
        <Label className="text-white">Background</Label>
        <Segmented
          value={model.theme}
          options={BIO_THEMES.map((t) => ({ value: t, label: t }))}
          onChange={(v) => patch("theme", v)}
        />
      </div>

      <ColorField
        label="Accent color"
        value={model.accent_color}
        onChange={(v) => patch("accent_color", v)}
      />
      <ColorField
        label="Gradient / secondary color"
        value={model.accent_color_2}
        onChange={(v) => patch("accent_color_2", v)}
      />

      <div className="space-y-1.5">
        <Label className="text-white">Typography</Label>
        <Segmented
          value={model.font_family}
          options={BIO_FONTS.map((f) => ({ value: f, label: f }))}
          onChange={(v) => patch("font_family", v)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-white">Spacing</Label>
        <Segmented
          value={model.spacing}
          options={BIO_SPACING.map((s) => ({ value: s, label: s }))}
          onChange={(v) => patch("spacing", v)}
        />
      </div>
    </div>
  );
}

function ButtonControls({
  model,
  patch,
}: {
  model: EditorModel;
  patch: PatchFn;
}) {
  return (
    <div className={cardClass}>
      <h2 className="text-sm font-semibold text-white">Button style</h2>

      <div className="space-y-1.5">
        <Label className="text-white">Fill</Label>
        <Segmented
          value={model.button_style}
          options={BIO_BUTTON_STYLES.map((s) => ({ value: s, label: s }))}
          onChange={(v) => patch("button_style", v)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-white">Corners</Label>
        <Segmented
          value={model.button_shape}
          options={BIO_BUTTON_SHAPES.map((s) => ({ value: s, label: s }))}
          onChange={(v) => patch("button_shape", v)}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Changes apply instantly to the preview on the right.
      </p>
    </div>
  );
}

function LinksControls({
  links,
  errors,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
}: {
  links: EditorLink[];
  errors: Record<string, { title?: string; url?: string }>;
  onAdd: () => void;
  onUpdate: (clientId: string, p: Partial<EditorLink>) => void;
  onRemove: (clientId: string) => void;
  onMove: (clientId: string, dir: "up" | "down") => void;
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Links</h2>
        <button type="button" onClick={onAdd} className={`${ghostButton} !py-1.5`}>
          <PlusIcon weight="bold" className="size-4" />
          Add link
        </button>
      </div>

      {links.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No links yet. Add your first one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {links.map((link, i) => (
              <motion.li
                key={link.clientId}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => onMove(link.clientId, "up")}
                      disabled={i === 0}
                      aria-label="Move up"
                      className={`${ghostButton} size-6 !px-0`}
                    >
                      <ArrowUpIcon weight="bold" className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMove(link.clientId, "down")}
                      disabled={i === links.length - 1}
                      aria-label="Move down"
                      className={`${ghostButton} size-6 !px-0`}
                    >
                      <ArrowDownIcon weight="bold" className="size-3" />
                    </button>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Input
                      value={link.title}
                      onChange={(e) =>
                        onUpdate(link.clientId, { title: e.target.value })
                      }
                      placeholder="Title"
                      aria-invalid={Boolean(errors[link.clientId]?.title)}
                      className="h-9 rounded-lg border-white/15 bg-white/[0.05] px-3 text-sm"
                    />
                    <Input
                      value={link.url}
                      onChange={(e) =>
                        onUpdate(link.clientId, { url: e.target.value })
                      }
                      placeholder="https://example.com"
                      aria-invalid={Boolean(errors[link.clientId]?.url)}
                      className="h-9 rounded-lg border-white/15 bg-white/[0.05] px-3 text-sm"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate(link.clientId, { is_visible: !link.is_visible })
                      }
                      aria-label={link.is_visible ? "Hide link" : "Show link"}
                      className={`${ghostButton} size-8 !px-0`}
                    >
                      {link.is_visible ? (
                        <EyeIcon weight="bold" className="size-4" />
                      ) : (
                        <EyeSlashIcon weight="bold" className="size-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(link.clientId)}
                      aria-label="Delete link"
                      className={`${ghostButton} size-8 !px-0 hover:text-red-300`}
                    >
                      <TrashIcon weight="bold" className="size-4" />
                    </button>
                  </div>
                </div>
                {errors[link.clientId]?.title ? (
                  <FieldError message={errors[link.clientId].title} />
                ) : null}
                {errors[link.clientId]?.url ? (
                  <FieldError message={errors[link.clientId].url} />
                ) : null}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

// ---- phone preview frame ----
function PhonePreview({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mx-auto w-full max-w-[320px]"
    >
      <div className="relative rounded-[2.5rem] border border-white/15 bg-black p-2.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.15)]">
        {/* notch */}
        <div className="absolute left-1/2 top-2.5 z-10 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-black" />
        <div className="h-[560px] overflow-y-auto rounded-[2rem] bg-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
      </div>
      <p className="text-muted-foreground mt-3 flex items-center justify-center gap-1.5 text-center text-xs">
        <CheckCircleIcon weight="fill" className="size-3.5 text-emerald-400/80" />
        Live preview
      </p>
    </motion.div>
  );
}
