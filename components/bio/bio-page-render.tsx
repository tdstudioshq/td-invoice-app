import type { CSSProperties, ReactNode } from "react";

import {
  bioFontFamily,
  resolveBioStyle,
  type BioButtonShape,
  type BioButtonStyle,
  type BioSpacing,
  type BioStyleInput,
  type ResolvedBioStyle,
} from "@/lib/bio";

// Presentational, hook-free, and framework-neutral: rendered by the SERVER
// public page (app/u/[username]) AND the CLIENT live preview (link-builder).
// Sharing one component is what keeps "what you see while editing" identical to
// "what visitors get" — and the preview path never reads the database.

export interface BioRenderProfile extends BioStyleInput {
  username: string;
  display_name: string | null;
  bio: string | null;
}

export interface BioRenderLink {
  id: string;
  title: string;
  url: string;
}

// Per-spacing vertical rhythm (px). Drives gaps + button padding.
const SPACING: Record<BioSpacing, { gap: number; head: number; padY: number }> =
  {
    compact: { gap: 8, head: 10, padY: 11 },
    normal: { gap: 12, head: 14, padY: 15 },
    relaxed: { gap: 18, head: 18, padY: 19 },
  };

const SHAPE_RADIUS: Record<BioButtonShape, number> = {
  rounded: 16,
  pill: 999,
  square: 8,
};

// Relative luminance → pick black/white text for a solid accent fill.
function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0a0a0a" : "#ffffff";
}

export function bioPageBackground(s: ResolvedBioStyle): CSSProperties {
  switch (s.theme) {
    case "minimal":
      return { background: "#0a0a0a" };
    case "dark":
      return { background: "#000000" };
    case "gradient":
      return {
        background: `radial-gradient(120% 110% at 50% 0%, ${s.accent}40 0%, transparent 55%), radial-gradient(110% 110% at 50% 100%, ${s.accent2}33 0%, transparent 60%), #07070a`,
      };
    case "glass":
    default:
      return {
        background: `radial-gradient(90% 70% at 50% -10%, ${s.accent}26 0%, transparent 60%), #07070a`,
      };
  }
}

function buttonStyleCss(
  style: BioButtonStyle,
  s: ResolvedBioStyle,
): CSSProperties {
  const base: CSSProperties = {
    borderRadius: SHAPE_RADIUS[s.buttonShape],
    borderWidth: 1,
    borderStyle: "solid",
  };
  switch (style) {
    case "solid":
      return {
        ...base,
        background: s.accent,
        color: readableText(s.accent),
        borderColor: "transparent",
        boxShadow: `0 6px 20px ${s.accent}33`,
      };
    case "outline":
      return {
        ...base,
        background: "transparent",
        color: "#ffffff",
        borderColor: s.accent,
      };
    case "soft":
      return {
        ...base,
        background: `${s.accent}26`,
        color: "#ffffff",
        borderColor: `${s.accent}59`,
      };
    case "glass":
    default:
      return {
        ...base,
        background: "rgba(255,255,255,0.06)",
        color: "#ffffff",
        borderColor: `${s.accent}55`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.12)",
      };
  }
}

function initials(name: string | null, username: string): string {
  const source = (name ?? username).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function BioPageRender({
  page,
  links,
  avatarUrl,
  footer,
  interactive = true,
}: {
  page: BioRenderProfile;
  links: BioRenderLink[];
  avatarUrl: string | null;
  // Optional bottom slot — the public page passes its "Built with TD Studios"
  // link; the live preview leaves it out.
  footer?: ReactNode;
  // Public page navigates on click; the preview renders inert buttons.
  interactive?: boolean;
}) {
  const s = resolveBioStyle(page);
  const space = SPACING[s.spacing];
  const btn = buttonStyleCss(s.buttonStyle, s);
  const fontFamily = bioFontFamily(s.font);

  return (
    <div
      className="flex min-h-full w-full flex-1 flex-col items-center px-5 py-12"
      style={{ ...bioPageBackground(s), fontFamily }}
    >
      <div className="flex w-full max-w-md flex-1 flex-col items-center">
        <header
          className="flex flex-col items-center text-center"
          style={{ gap: space.head }}
        >
          <span
            className="flex size-24 items-center justify-center overflow-hidden rounded-full border text-2xl font-semibold text-white"
            style={{
              borderColor: `${s.accent}66`,
              boxShadow: `0 0 40px ${s.accent}33`,
              background: "rgba(255,255,255,0.06)",
            }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={page.display_name ?? page.username}
                className="size-full object-cover"
              />
            ) : (
              initials(page.display_name, page.username)
            )}
          </span>

          <h1 className="text-2xl font-bold tracking-tight text-white">
            {page.display_name || `@${page.username}`}
          </h1>
          <p className="text-sm font-medium" style={{ color: s.accent }}>
            @{page.username}
          </p>
          {page.bio ? (
            <p className="max-w-sm text-sm text-white/70">{page.bio}</p>
          ) : null}
        </header>

        <nav
          className="flex w-full flex-col"
          style={{ gap: space.gap, marginTop: space.head + space.gap }}
        >
          {links.length === 0 ? (
            <p className="text-center text-sm text-white/40">No links yet.</p>
          ) : interactive ? (
            links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex w-full items-center justify-center px-5 text-center text-sm font-medium transition-transform hover:-translate-y-0.5"
                style={{ ...btn, paddingTop: space.padY, paddingBottom: space.padY }}
              >
                {link.title}
              </a>
            ))
          ) : (
            links.map((link) => (
              <div
                key={link.id}
                className="flex w-full items-center justify-center px-5 text-center text-sm font-medium"
                style={{ ...btn, paddingTop: space.padY, paddingBottom: space.padY }}
              >
                {link.title || "Untitled link"}
              </div>
            ))
          )}
        </nav>

        {footer ? <footer className="mt-auto pt-10">{footer}</footer> : null}
      </div>
    </div>
  );
}
