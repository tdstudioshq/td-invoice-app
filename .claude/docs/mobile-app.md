# Mobile companion app (`mobile/`)

_Feature deep-dive extracted from `CLAUDE.md`. That file holds the repo-wide conventions, commands and verification gate; this one holds only the Expo companion app._

`mobile/` is a **separate, self-contained Expo workspace** — not part of the Next.js build. It is deliberately excluded from the root toolchain (`tsconfig.json` `exclude`, `eslint.config.mjs` ignores, its own `node_modules`), so run all mobile commands from inside `mobile/` with its own deps:

```bash
cd mobile
npm install
cp .env.example .env   # EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY / EXPO_PUBLIC_API_BASE_URL
npx expo start         # then scan QR with Expo Go (iOS), or `npm run ios` for the Simulator
npm run typecheck      # tsc --noEmit
npm run lint           # expo lint
```

- **Stack:** Expo SDK 54 (pinned for Expo Go physical-device testing), React Native 0.81, React 19, **Expo Router** (file-based routes under `mobile/app/`, `typedRoutes` on). Mirrors the web app's two role-based route groups: `(admin)/` and `(portal)/`.
- **Same backend, same RLS, anon key only:** connects to the **same Supabase project** with only the anon key + existing RLS. **No service-role client, no schema changes, no Stripe/Resend.** Never put a service-role key in the mobile app. Every read and write is RLS-scoped to the signed-in user's own access token — the app can only do what that user could do on the web.
- **It is no longer strictly read-only.** Admin/portal browsing is still read-only, but two portal features write or call out:
  - **Native PDF viewer (#4):** `InvoicePdfButton` downloads the authoritative pdf-lib PDF from the web app's existing `/api/invoices/[id]/pdf` route (via `expo-file-system` `downloadAsync`), previews it natively in a WebView, and shares the real file. Auth is the user's Supabase access token sent as `Authorization: Bearer` — the **only** web change this required was making `lib/supabase/server.ts` `createClient()` forward that header to PostgREST when present (a no-op for cookie/browser requests; still RLS-scoped, no service-role). Falls back to a locally rendered HTML invoice (`mobile/src/lib/invoice-html.ts`) when offline or when `EXPO_PUBLIC_API_BASE_URL` is unset. Requires `EXPO_PUBLIC_API_BASE_URL` (the deployed web app URL).
  - **Camera / document uploads (#5):** portal users with `can_upload` upload PDF/JPG/PNG/HEIC (≤ 25 MB) from camera, library, or Files into the existing private `client-files` bucket. **No new upload infrastructure and no schema change** — `mobile/src/lib/uploads.ts` writes straight to Storage + inserts `client_files`/`file_activity` rows exactly like the web `uploadOwnFileAction`, gated entirely by the existing storage + table RLS (`portal_client_id()` + `portal_can_upload()`, uploads-category only). The Storage write uses `expo-file-system` `createUploadTask` against the Storage REST endpoint (bearer = user token, apikey = anon key) to get **upload progress + cancellation**; metadata inserts go through supabase-js. Entry points: portal **Files → Upload** and portal **Invoice → Upload Supporting Document** (`mobile/src/components/upload-document.tsx`).
- **Biometric app lock (#6):** an optional Face ID / Touch ID gate via `expo-local-authentication`, implemented as `BiometricProvider` (`mobile/src/providers/biometric-provider.tsx`) wrapping the navigator *inside* `AuthProvider` in `app/_layout.tsx`. It renders a full-screen lock **overlay** on top of the router, so admin/portal routing is untouched. It only ever gates an **already-authenticated** session — it never blocks first login, and locks on cold start with a persisted session and on return from background (`AppState` "background"). Graceful fallback: if biometrics aren't available/enrolled it fails open and the Settings toggle is disabled with an explanation. The **only** persisted state is a local-only `biometric_lock_enabled` boolean in `expo-secure-store` — **no passwords or tokens are stored.** Toggle lives in both settings screens (`BiometricSettingCard`).
- **Two things share, not duplicate, the web app:** the database types are re-exported from the web app via a relative bridge (`mobile/src/types/database.ts` → `../../../lib/types/database`), so the web schema mirror is the single source of truth. Mobile reads live in `mobile/src/lib/data.ts` (its own copy, parallel to the web `lib/queries/*`).
- **Session persistence** uses `expo-sqlite/localStorage/install` (imported first in `mobile/src/lib/supabase.ts`) as the storage backend, with `processLock` and AppState-driven `startAutoRefresh`/`stopAutoRefresh`. `isSupabaseConfigured` gates the same graceful-degradation pattern as the web app.
- No EAS build / store submission is configured yet (see `mobile/README.md`).
