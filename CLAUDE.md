# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Critical: Next.js version

This project uses **Next.js 16.2.9** with **React 19**. The pinned guidance in `AGENTS.md` is not optional: APIs and conventions differ from older Next.js. Before writing or changing any Next.js code, read the relevant guide under `node_modules/next/dist/docs/` (`01-app`, `02-pages`, `03-architecture`).

## Commands

```bash
npm run dev      # start dev server (http://localhost:3000)
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint (flat config: eslint.config.mjs)
```

There is no test setup yet.

## Architecture

App Router project. `app/` holds routes; `app/layout.tsx` is the root layout (loads Geist + JetBrains Mono fonts, applies `font-mono` globally via CSS variables).

- **Import alias:** `@/*` maps to the repo root (e.g. `@/lib/utils`, `@/components/ui/button`).
- **Styling:** Tailwind CSS **v4** — there is no `tailwind.config.*`. Configuration and theme tokens live in `app/globals.css` via CSS (`@theme`/CSS variables); PostCSS is wired in `postcss.config.mjs` with `@tailwindcss/postcss`.
- **UI components:** shadcn/ui (`components.json`), style `radix-lyra`, base color `neutral`, RSC enabled. Generated primitives live in `components/ui/`. Icon library is **Phosphor** (`@phosphor-icons/react`) — prefer it over lucide. Add components with the `shadcn` CLI rather than hand-writing primitives.
- **`cn()` helper:** `lib/utils.ts` merges classes with `clsx` + `tailwind-merge`; use it for conditional classNames.

## Not yet wired (dependencies present, no code yet)

These are installed but unused — follow their current docs when integrating:
- **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`) — intended data/auth backend.
- **Forms/validation** — `react-hook-form` + `zod` + `@hookform/resolvers`.
- **Dates** — `date-fns`.
