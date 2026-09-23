# Codebase Cleanup Audit

Branch `refactor/codebase-cleanup`, audited against `main` @ `a6ddc9e`.
Date: 2026-09-23. Phase 1 (audit) — no production code modified.

**Baseline:** 549 tracked files · 30,816 KB tracked content · 73 production routes
(61 pages + 12 route handlers) · 39 migrations · 41 dependencies.

Tooling: `knip@5` via `npx`, configured in `knip.json` (added this phase — it is
tooling config, not production code).

> **Reading the risk column.** *Low* = traced to zero live references and
> reversible from git. *Medium* = unreferenced but load-bearing in a way static
> analysis cannot see (docs contract, ops tooling, external URL). *High* = touches
> data, access control, or a serving path.

---

## 0. Knip calibration — why the raw output is not the finding

Run naively, knip is badly wrong on this repo, in both directions. Recording this
because the numbers are otherwise untrustworthy:

| Raw claim | Reality |
| --- | --- |
| 43 unused files, all of `mobile/` | False. `mobile/` is a self-contained Expo workspace with **file-based Expo Router** entries; knip sees no importer. Excluded via `ignore`. |
| `clsx`, `date-fns`, `pdf-lib`, `resend`, `sonner`, `tailwind-merge` unused (`--production --strict`) | False. A custom `next.entry` override suppressed the Next plugin's own entry detection, so nothing traversed from `app/`. Removed the override. |
| `tailwindcss`, `tw-animate-css` unused | False. Both are `@import`ed from `app/globals.css` (CSS-only usage is invisible to knip). |
| `shadcn` unused | False as stated — it is the component-generator CLI, a documented convention. But see §3: it is in the wrong dependency block. |
| `scripts/premade-sync/core.ts` unused (`--production`) | False. Imported by `scripts/sync-premade-designs.ts`; scripts are not production entry points. |

After calibration **both** `knip` and `knip --production --strict` agree on the
same 3 unused dependencies. That agreement is the only dependency result I trust.

---

## 1. Unused files

| File | Evidence | Risk | Action |
| --- | --- | --- | --- |
| `public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg` | `create-next-app` starter assets; zero references anywhere | Low | **Delete** (~20 KB) |
| `public/premade-watermark.png` | Orphaned by `7d2a2b3` "drop the watermark overlay and pricing from /premadedesigns" (#6) | Low | **Delete** (168 KB) |
| `components/ui/dropdown-menu.tsx` | Zero importers | Medium | **Retain** — one of four shadcn primitives hand-swapped to Phosphor icons (CLAUDE.md §Icons). Deleting discards that hand edit; regenerating via CLI would silently restore lucide icons. Cost to keep: 4 KB. |

## 2. Unused exports

84 unused exports / 25 unused exported types. The great majority are **deliberate
API surface** — `lib/*/types.ts` and `lib/*/schema.ts` modules that export a full
vocabulary, and shadcn primitives that re-export their whole Radix surface
(`DialogPortal`, `SelectSeparator`, `TableCaption`, …). Removing those is churn
that makes the next `shadcn` CLI regeneration conflict. **Retained wholesale.**

Two are worth acting on:

| Export | Finding | Risk | Action |
| --- | --- | --- | --- |
| `requireUser()` — `lib/auth.ts:56` | **Never called.** Only other mention is a comment in `proxy.ts:21`. CLAUDE.md states enforcement is "RLS plus `requireUser()`/`requireAdmin()`/`requirePortalUser()`" — so the documented auth contract names a helper nothing uses. | Medium | **Retain the function, fix the docs.** It is the generic any-session guard; its absence from call sites is a documentation error, not dead code to delete. |
| `MAX_DESIGN_COUNT` / `MAX_DESIGNS_PER_ORDER` — `lib/mylar-printing/types.ts` | Duplicate export: two names, one value | Low | **Collapse to one name** |

## 3. Unused / misplaced dependencies

| Package | Evidence | Risk | Action |
| --- | --- | --- | --- |
| `react-hook-form` | Zero imports. CLAUDE.md: "in `package.json` but currently unused — don't reach for them." Two source comments explain the deliberate non-use. | Low | **Delete** |
| `@hookform/resolvers` | Same | Low | **Delete** |
| `react-social-icons` | Zero imports. CLAUDE.md: "**`react-social-icons` is an orphan**" since the home-card social row was removed. | Low | **Delete** |
| `server-only` | **Imported by 15 files but absent from `package.json`.** Resolves only as a transitive dep of `next`. | Medium | **Add explicitly.** This is an addition, not a deletion: if Next ever stops hoisting it, 15 server modules fail to resolve at once. |
| `shadcn` | A build-time CLI sitting in `dependencies`, so it installs into the production runtime | Low | **Move to `devDependencies`** |

## 4. Duplicate implementations

### 4a. Gallery access gates — 6 copies of 2 implementations

Every gate hardcodes **the same code, `"0420"`**, and they come in two shapes that
differ only in identifiers:

| Route | Lines | Shape | Cookie | Protection |
| --- | --- | --- | --- | --- |
| `/taste-budz` | 38 | plain cookie | `tb_access=granted` | index only |
| `/designs` | 38 | plain cookie | `designs_access=granted` | index only |
| `/mafiaterpz` | 39 | plain cookie | `mafiaterpz_access=granted` | index only |
| `/martyig` | 39 | plain cookie | `martyig_access=granted` | index only |
| `/premadedesigns` | 131 | **HMAC-signed** | `premade_designs_access` | index + private bucket/signed URLs |
| `/newpremades` | 131 | **HMAC-signed** | `new_premades_access` | index + gated route handler |

`diff` across the four 38-line files shows **only** cookie name, path, and
function names differ. Same for the two 131-line files.

Two distinct issues:

1. **Duplication** — 4 identical + 2 identical implementations. Risk: Low.
   **Action: extract a shared `lib/gallery-access.ts` factory** parameterized by
   `{ cookieName, path, signed }`, preserving each route's existing cookie name
   and path so live unlocks survive.
2. **The unsigned four are trivially bypassable.** The cookie value is the literal
   string `granted`; `httpOnly` stops JS reading it but nothing stops a client
   *sending* it (`curl -H 'Cookie: tb_access=granted'`). The signed pair is not
   bypassable this way. Risk: Medium. **Action: fold all six onto the signed
   implementation** — same call shape, strictly stronger, no UX change.

### 4b. `/gso` vs `/designs` — the access-control item, restated

Both call `getGsoImages()` → `listPublicBucketImages("GSO")`. Same bucket, same
images; `/designs` is gated, `/gso` is not. The page bodies differ only in header
mark, title, and empty-state copy.

**The brief's framing needs one correction, and it changes the fix.**
`listPublicBucketImages()` builds URLs with `getPublicUrl()` — the `GSO` bucket is
a **public Storage bucket**. So the keypad on `/designs` never protected the
artwork; it hides the *listing* while every image URL stays permanently public,
unauthenticated and CDN-cached. Gating `/gso` alone would therefore be security
theater: it would close the second index and leave the assets exactly as reachable.

Contrast the routes that do protect artwork: `/premadedesigns` uses a **private**
bucket + `createSignedUrls()`, and `/newpremades` serves bytes through a gated
route handler that re-checks `hasNewPremadesAccess()`.

Coherent options — this is a **product decision, not a refactor**, so Phase 2 does
not pick one:

- **(A) Artwork is semi-private** → make `GSO` a private bucket, switch to signed
  URLs, and gate `/gso`. Risk: High (touches Storage config + serving path).
- **(B) Artwork is public** → drop the keypad from `/designs` and redirect it to
  `/gso`. Removes a duplicate route and stops implying protection that does not
  exist. Risk: Low.

Doing nothing is the only option I'd argue against: today the same images are
public at one URL and gated at another, which teaches that the gate means
something.

### 4c. Other duplication

| Finding | Risk | Action |
| --- | --- | --- |
| `setPartnerJobStatusAction` + `setPartnerJobDoneAction` (`app/actions/partner-jobs.ts`) — two status writers | Medium | Investigate; likely one delegates to the other |
| `lib/data.ts` gallery helpers (`getTasteBudzImages`/`getGsoImages`/`getMafiaTerpzImages`) — three one-line wrappers around `listPublicBucketImages` | Low | Retain (they are the named seam); move with §7 split |

## 5. Superseded routes

| Route | Status | Inbound links | Risk | Action |
| --- | --- | --- | --- | --- |
| `/how-to-order` | Formspree form, superseded by `/mylar-printing` | **0** (one comment in `lib/design-request-upload.ts`) | Low | **308 → `/mylar-printing`** |
| `/mylar-bag-printing` | Formspree form, superseded by the persisting wizard | **0** (two comments only) | Low | **308 → `/mylar-printing`** |
| `/mylar` | Static single-file shop, `public/mylar/index.html`, cart is client-only with no backend; home-card button removed "while the shop is in progress" | 0 | Medium | **Retain** — in-progress work, not dead code |
| `/designs` | Duplicate of `/gso` (see §4b) | 3 | Low–High | **Blocked on the §4b decision** |
| `/qr-generator/designs` | Already a permanent redirect in `next.config.ts` | n/a | — | Correct as-is |

Redirects rather than deletion because both are public URLs that may have been
shared externally; a 308 keeps them working and removes the duplicate form.
`BIO_LINKS` now contains exactly one entry (`/mylar-printing`), so neither is
reachable from the homepage.

## 6. Obsolete scripts

| Script | Finding | Risk | Action |
| --- | --- | --- | --- |
| `scripts/create-marty-client.ts` (333 lines) | One-off provisioning for a single named client. Idempotent, documented in CLAUDE.md + README, wired to `npm run client:create-marty`. Its capability is superseded by the admin portal-invite UI (`createPortalUserAction`). | Medium | **Retain.** Working, documented, idempotent ops tooling; 12 KB. "Superseded by the UI" is not evidence it will never be re-run, and the brief's rule is not to delete merely-unused things. Listed as a retained candidate. |
| `scripts/sync-workspace-admins.ts` | Actively referenced by the ownership model; `npm run admin:sync` | — | Retain |
| `scripts/sync-premade-designs.ts` (1,361 lines) | Live tooling, but the single largest script in the repo | Low | Retain; **split candidate** (§7) |

## 7. Oversized files worth splitting

| File | Lines | Seam | Risk |
| --- | --- | --- | --- |
| `lib/types/database.ts` | 1,426 | Hand-maintained schema mirror — **do not split**, it mirrors one artifact | — |
| `scripts/sync-premade-designs.ts` | 1,361 | Pure helpers already extracted to `premade-sync/core.ts`; CLI/IO layer could follow | Low |
| `app/globals.css` | 1,244 | `@layer utilities` spans lines 175–1178. 43 `.home-*` + 23 `.tk-*` rules are homepage-only | Low |
| `components/partner-jobs/new-job-form.tsx` | 1,102 | **One ~866-line component.** `StoredFileRow` already split out; item-row editor, upload section and draft state are extractable | Medium |
| `components/portal/file-browser.tsx` | 847 | Tree + toolbar + preview | Medium |
| `app/actions/partner-jobs.ts` | 795 | 7 actions: upload tickets / job CRUD / status | Low |
| `components/mylar-printing/mylar-printing-wizard.tsx` | 755 | Step components + draft/sessionStorage mirror | Medium |
| `app/home-card.tsx` | 742 | Ticket UI + `useScrollParallax` + inline `<style>` (deliberately inline — see CLAUDE.md) | Medium |
| `lib/data.ts` | 731 | **7 unrelated domains** in one module: clients, tasks, QR, invoices, settings, portals, projects, dashboard, galleries, pending signups | Low |

`lib/data.ts` is the clearest win: `lib/partner-jobs/queries.ts`,
`lib/mylar-printing/queries.ts` and `lib/design-requests/queries.ts` already
establish the per-domain pattern. `lib/data.ts` is the legacy holdout.

## 8. Duplicate / oversized static assets

| Finding | Size | Risk | Action |
| --- | --- | --- | --- |
| `app/twitter-image.png` **byte-identical** to `app/opengraph-image.png` | 816 KB each | Medium | Both paths are required by Next's metadata file convention. **Recompress both** (816 KB is ~8× a reasonable social card). Deleting `twitter-image.png` also works — X falls back to `og:image` — but drops the `twitter:image` tag. |
| `public/logo.png` **byte-identical** to `app/icon.png` | 2 copies | Low | Retain — `app/icon.png` is the favicon convention, `public/logo.png` is referenced by 5 components |
| `assets/newpremades/9c02…` **byte-identical** to `4a70…` (both variants) | ~0.5 MB | Low | **Two manifest entries are the same artwork.** Dedupe the manifest |
| `public/zazalogo.png` | 1,192 KB | Low | Recompress |
| `public/taste-budz-logo.png` | 888 KB | Low | Recompress |
| `assets/newpremades/` | **18 MB — 58% of tracked content** | High | See §9 |

## 9. One source of truth for premade designs

Two parallel catalogs exist:

| | `/premadedesigns` | `/newpremades` |
| --- | --- | --- |
| Storage | private Supabase bucket | **86 WebP files committed to git** (43 designs × preview+thumb) |
| Manifest | `list_premade_design_catalog()` (DB) | `app/newpremades/manifest.json` |
| Serving | signed URLs | gated route handler reading with `fs` |
| Sync | `bun run premade:sync` (SHA-256 dedup) | manual commit |
| Size | 0 in repo | **18 MB in repo** |

Consolidating `/newpremades` into the Supabase catalog would remove **58% of the
repository's tracked bytes** and leave one ingestion path.

**Not executed in Phase 2.** Risk: High. It requires uploading 43 designs to
Supabase with credentials I do not have, a manifest migration, an
`outputFileTracingIncludes` change, and per-image verification that artwork
survived. Deleting 18 MB of committed artwork before confirming the upload is
exactly the irreversible-feeling step worth doing deliberately. Recommended as
the next dedicated piece of work.

## 10. Documentation

| Finding | Risk | Action |
| --- | --- | --- |
| `CLAUDE_SESSION_HANDOFF.md` (151 lines) — its "Current web state" section documents a **Social Hub at `/social`** that was removed entirely (`0011_drop_social_hub.sql`; `app/social/` does not exist). CLAUDE.md spends a paragraph warning readers not to trust it. | Low | **Delete.** Its content is a session log preserved in git history; its only present function is to mislead, which CLAUDE.md then has to correct. |
| **CLAUDE.md contradicts itself on the test runner.** Lines 41/57/65 document `npm run test` → `bun test`. Line 117 — in the Deployment workflow section added in `a6ddc9e` — says "There is no test runner in this repo." | Low | **Fix line 117** and add `npm run test` to the stated gate. (Introduced by me last session, from pre-merge text.) |
| README ↔ CLAUDE.md duplication | — | **Not a real finding.** Exactly one shared heading ("Roles"). The brief anticipated overlap; measured, they are complementary. Reported as checked-and-clear. |

## 11. Package manager / lockfile consistency

Two lockfiles, both `package-lock.json` (root + `mobile/`) — correct and expected
for two independent workspaces. No competing `bun.lockb`/`yarn.lock`/`pnpm-lock.yaml`.

The real inconsistency is **runtime**, not lockfile: installs are npm, but
`npm run test` and all three `premade:sync` scripts shell out to **`bun`**, and
`scripts/premade-sync/` contains `bun-test.d.ts` typings. A contributor with only
npm cannot run the test suite.

| Risk | Action |
| --- | --- |
| Medium | **Retain bun, declare it.** Bun runs the TS scripts with no build step and provides the test runner; replacing it is a rewrite, not a cleanup. Add `engines`/`packageManager` and a README line so the requirement is explicit rather than discovered on failure. |

---

## Phase 2 execution list — high confidence only

1. Delete 5 starter SVGs + `public/premade-watermark.png`
2. Delete `react-hook-form`, `@hookform/resolvers`, `react-social-icons`; add `server-only`; move `shadcn` to devDependencies
3. Extract shared gallery access module; fold all six gates onto the signed implementation
4. 308 `/how-to-order` and `/mylar-bag-printing` → `/mylar-printing`
5. Split `lib/data.ts` into per-domain query modules
6. Collapse the `MAX_DESIGN_COUNT` duplicate export
7. Delete `CLAUDE_SESSION_HANDOFF.md`; fix the CLAUDE.md test-runner contradiction
8. Dedupe the identical `newpremades` manifest pair
9. Route-level smoke checks for every removed/redirected route

## Intentionally retained

- `components/ui/dropdown-menu.tsx` — hand-swapped icons
- `requireUser()` — documented auth contract; docs fixed instead
- `scripts/create-marty-client.ts` — working documented ops tooling
- `/mylar` — in-progress shop
- 84 unused exports in `lib/*/types.ts` + shadcn primitives — deliberate API surface
- `mobile/**` — separate workspace, invisible to static analysis
- `assets/newpremades` 18 MB consolidation — §9, needs credentials + verification
- `/gso` vs `/designs` resolution — §4b, product decision

---

# Phase 2 — Final report

Branch `refactor/codebase-cleanup`, 9 commits, **not merged and not deployed**.

## Metrics

| | Before | After | Δ |
| --- | --- | --- | --- |
| Tracked files | 549 | 547 | −2 |
| Tracked content | 30,816 KB | 30,148 KB | **−668 KB** |
| Production routes | 73 | 71 | −2 |
| Dependencies | 32 | 29 | −3 |
| devDependencies | 9 | 10 | +1 (`shadcn` moved) |
| knip unused deps | 3 | **0** | −3 |
| knip duplicate exports | 1 | **0** | −1 |
| Gallery gate implementations | 6 | **1** (2 factories) | −5 |

Net diff vs `main`: 80 files changed, 1,919 insertions, 2,251 deletions.

The file count barely moves because 12 new modules were added while 15 were
deleted — the split traded one 731-line catch-all for nine focused ones.

## Deleted files (15)

`CLAUDE_SESSION_HANDOFF.md` · `lib/data.ts` ·
`app/how-to-order/{page,order-form}.tsx` ·
`app/mylar-bag-printing/{page,mylar-order-form,bag-types}.tsx|ts` ·
`public/{next,vercel,file,globe,window}.svg` · `public/premade-watermark.png` ·
`assets/newpremades/9c021318be11b914-{preview,thumb}.webp`

## Deleted dependencies (3)

`react-hook-form` · `@hookform/resolvers` · `react-social-icons`

Also: `server-only` **added** (imported by 15 files, previously undeclared);
`shadcn` moved from `dependencies` to `devDependencies`.

## Deleted / redirected routes (2)

| Route | Now |
| --- | --- |
| `/how-to-order` | 308 → `/mylar-printing` |
| `/mylar-bag-printing` | 308 → `/mylar-printing` |

Both verified by smoke check, including the `Location` header.

## Validation — all passing from a clean tree (`rm -rf .next`)

| Command | Result |
| --- | --- |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run test` | 3 pass, 0 fail |
| `npm run smoke:routes` | **24/24 passed** |

Run after every batch, not only at the end.

## Retained cleanup candidates

| Candidate | Why it stayed |
| --- | --- |
| `assets/newpremades` (18 MB, 58% of the repo) | Highest-value item left. Consolidating into the Supabase premade catalog needs credentials, a manifest migration and per-image verification — deleting committed artwork before confirming upload is the wrong order. |
| `/gso` vs `/designs` | Product decision, deferred by you. The GSO bucket is **public**, so `/designs`' keypad only hides the listing; gating `/gso` alone would be theater. |
| The 4 unsigned gallery gates | Bypassable by sending the cookie directly. Upgrading to the signed variant invalidates live unlocks — a deliberate change, not a refactor side effect. |
| `components/ui/dropdown-menu.tsx` | Unused, but hand-swapped to Phosphor icons; regenerating would silently restore lucide. |
| `requireUser()` | Never called, but it is the documented generic auth guard. Docs corrected instead. |
| `scripts/create-marty-client.ts` | Working, documented, idempotent ops tooling. "Superseded by the UI" ≠ never needed again. |
| 82 unused exports / 26 unused types | Deliberate API surface in `lib/*/types.ts` and shadcn primitives. |
| `/mylar` static shop | In-progress, not dead. |
| Oversized components (`new-job-form` 1102, `file-browser` 847, wizard 755, `home-card` 742) | Real split candidates, but each is a behavioral component with no test coverage. Splitting them blind is how a working form breaks. |
| `app/twitter-image.png` = `opengraph-image.png` (816 KB each) | Both paths required by Next's metadata convention; recompression is the fix, and it is an asset task rather than a code one. |
| `bun` as test/script runtime | Legitimate; needs declaring, not replacing. |
