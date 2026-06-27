import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { getPublicBioPage } from "@/lib/data";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { BioTheme } from "@/lib/types/database";

// Public, no-auth bio page. Reads only PUBLISHED pages + VISIBLE links through
// the SECURITY DEFINER helpers (see getPublicBioPage). Allow-listed in proxy.ts.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const data = await getPublicBioPage(username);
  if (!data) return { title: "Page not found" };
  const name = data.page.display_name || `@${data.page.username}`;
  return {
    title: `${name} · TD Studios`,
    description: data.page.bio ?? `${name} on TD Studios`,
  };
}

// Per-theme page background. Dark-first; the accent color tints where it helps.
function themeBackground(theme: BioTheme, accent: string): React.CSSProperties {
  switch (theme) {
    case "minimal":
      return { background: "#0a0a0a" };
    case "dark":
      return { background: "#000000" };
    case "gradient":
      return {
        background: `radial-gradient(120% 120% at 50% 0%, ${accent}33 0%, #0a0a0a 55%, #050505 100%)`,
      };
    case "glass":
    default:
      return {
        background: `radial-gradient(90% 70% at 50% -10%, ${accent}26 0%, transparent 60%), #07070a`,
      };
  }
}

function initials(name: string | null, username: string): string {
  const source = (name ?? username).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default async function PublicBioPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  if (!isSupabaseConfigured()) notFound();

  const data = await getPublicBioPage(username);
  if (!data) notFound();

  const { page, links, avatarUrl } = data;
  const accent = page.accent_color;

  // Best-effort view logging — never blocks the render.
  try {
    const headerList = await headers();
    const supabase = await createClient();
    await supabase.rpc("log_bio_page_view", {
      p_page_id: page.id,
      p_referrer: headerList.get("referer"),
      p_user_agent: headerList.get("user-agent"),
    });
  } catch {
    /* analytics are best-effort */
  }

  const isGlass = page.theme === "glass";

  return (
    <main
      className="relative flex min-h-svh flex-col items-center px-4 py-14"
      style={themeBackground(page.theme, accent)}
    >
      <div className="flex w-full max-w-md flex-1 flex-col items-center gap-7">
        <header className="flex flex-col items-center gap-3 text-center">
          <span
            className="flex size-24 items-center justify-center overflow-hidden rounded-full border text-2xl font-semibold text-white"
            style={{
              borderColor: `${accent}66`,
              boxShadow: `0 0 40px ${accent}33`,
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
          <p className="text-sm font-medium" style={{ color: accent }}>
            @{page.username}
          </p>
          {page.bio ? (
            <p className="max-w-sm text-sm text-white/70">{page.bio}</p>
          ) : null}
        </header>

        <nav className="flex w-full flex-col gap-3">
          {links.length === 0 ? (
            <p className="text-center text-sm text-white/40">No links yet.</p>
          ) : (
            links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className={`group flex w-full items-center justify-center rounded-2xl border px-5 py-4 text-center text-sm font-medium text-white transition-all hover:-translate-y-0.5 ${
                  isGlass ? "backdrop-blur-md" : ""
                }`}
                style={{
                  borderColor: `${accent}55`,
                  background: isGlass
                    ? "rgba(255,255,255,0.06)"
                    : `${accent}1f`,
                  boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.12)",
                }}
              >
                {link.title}
              </a>
            ))
          )}
        </nav>

        <footer className="mt-auto pt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-white/40 transition-colors hover:text-white/70"
          >
            <Image
              src="/logo.png"
              alt=""
              width={16}
              height={16}
              className="size-4 rounded-full"
            />
            Built with TD Studios
          </Link>
        </footer>
      </div>
    </main>
  );
}
