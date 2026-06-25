# Claude Session Handoff — Mobile App (`mobile/`)

Running log of the native-roadmap work on the Expo companion app. Newest first.
The roadmap lives in `MEMORY.md` / the `mobile-app-status` memory; the immovable
rules are: **same Supabase backend, same RLS, anon key only, no service-role in
mobile, no schema changes, don't modify invoice/auth/PDF logic, keep web changes
additive.**

---

## #6 — Face ID / Touch ID Gate ✅ (current session)

**Goal:** optional biometric lock over an already-authenticated session.

**Architecture decisions**
- **Overlay, not a route.** `BiometricProvider`
  (`mobile/src/providers/biometric-provider.tsx`) wraps the navigator *inside*
  `AuthProvider` and renders a full-screen lock **overlay** when locked — so
  admin/portal routing and the `Stack.Protected` guards are completely
  untouched.
- **Gate only after auth; never block first login.** A `settledRef` makes the
  cold-start lock decision exactly once, only when a session already exists at
  first settle. A null→session transition (a fresh sign-in during the run) never
  locks. Re-lock happens on `AppState` `"background"` (the Face ID system sheet
  only goes `"inactive"`, so it doesn't fight the prompt).
- **Fail open, never trap.** If hardware is missing / not enrolled, it never
  locks and the Settings toggle is disabled with a reason. The lock screen also
  offers **Sign out instead** as an escape hatch.
- **Store the minimum.** Only a local-only `biometric_lock_enabled` boolean in
  `expo-secure-store`. **No passwords, no tokens.** The Supabase session keeps
  living in its own (expo-sqlite) storage; biometrics just gate access to it.
- Enabling runs a live prompt first (proves it works before persisting).

**How it works:** `hasHardwareAsync` + `isEnrolledAsync` decide availability and
`supportedAuthenticationTypesAsync` picks the label (Face ID / Touch ID).
`authenticateAsync` (device-passcode fallback allowed) prompts; errors map to
"Biometrics unavailable." vs "Authentication failed. Try again." Lock screen
auto-prompts on appear, with a manual **Unlock** retry.

**Files changed (#6)** — all mobile, no web:
- `mobile/src/providers/biometric-provider.tsx` *(new)* — provider + lock overlay.
- `mobile/src/components/biometric-setting.tsx` *(new)* — Settings toggle card.
- `mobile/app/_layout.tsx` — wrap navigator in `BiometricProvider`.
- `mobile/app/(admin)/settings.tsx`, `mobile/app/(portal)/portal-settings.tsx` — add toggle.
- `mobile/app.json` — `expo-local-authentication` plugin (Face ID usage string); `expo-secure-store` plugin (auto-added).
- `mobile/package.json` — added `expo-local-authentication`, `expo-secure-store`.

**Validation:** mobile `tsc` ✅ · `expo lint` ✅ · `expo-doctor` 18/18 ✅ · iOS
export ✅ (3.69 MB). No web changes.

**Needs real-device testing:** Face ID/Touch ID can't be exercised by the static
checks or fully in a Simulator. On hardware verify: enable prompt → persists;
cold start with session prompts; background→foreground re-locks; cancel shows the
error + retry works; "Sign out instead" escapes; toggling off stops locking;
device with no enrolled biometrics shows the disabled toggle and never locks.

---

## #5 — Camera / Document Uploads ✅

**Goal:** let portal users upload PDF/JPG/JPEG/PNG/HEIC (≤ 25 MB) from camera,
photo library, or Files, into their portal.

**Architecture decisions**
- **Reuse, don't rebuild.** Uploads go straight into the existing private
  `client-files` Storage bucket and insert `client_files` + `file_activity` rows
  — byte-for-byte the same flow as the web `app/actions/portal-client.ts`
  `uploadOwnFileAction`. No new upload service, **no new web endpoint, no schema
  change**.
- **RLS is the enforcement.** Writes use the signed-in user's own access token,
  so the existing storage + table policies (`client_files_portal_insert`,
  gated on `portal_client_id()` + `portal_can_upload()`, uploads-category only)
  do all the gating. No service-role, no RLS bypass.
- **Progress + cancel** needed a direct Storage REST `POST` via
  `expo-file-system` `createUploadTask` (supabase-js `.upload()` exposes neither
  in RN). Bearer = user token, `apikey` = anon key. The lightweight metadata
  inserts afterward go through supabase-js.
- **Object key** `{clientId}/uploads/{Date.now()}-{safeName}` + `x-upsert:false`
  + the `storage_path` unique constraint ⇒ unique names, no overwrites.

**Upload flow** (`mobile/src/components/upload-document.tsx`): trigger button →
modal: choose source (camera / library / files) → validate MIME + size →
preview (image thumb or file icon) + rename → upload with live progress bar +
Cancel → success confirmation (or error → Retry). Entry points: portal **Files →
Upload Document** and portal **Invoice → Upload Supporting Document**, both shown
only when `portalAccess.canUpload`.

**Files changed (#5)** — all mobile, no web:
- `mobile/src/lib/uploads.ts` *(new)* — pickers, validation, `startPortalUpload()` (progress/cancel handle).
- `mobile/src/components/upload-document.tsx` *(new)* — the upload UI/flow.
- `mobile/src/lib/supabase.ts` — export `SUPABASE_URL` / `SUPABASE_ANON_KEY` for the Storage REST call.
- `mobile/app/(portal)/portal-files.tsx` — Upload card (canUpload).
- `mobile/app/(portal)/portal-invoices/[id].tsx` — Upload Supporting Document card (canUpload).
- `mobile/app.json` — `expo-image-picker` plugin (iOS camera/photo permission strings).
- `mobile/package.json` — added `expo-image-picker`, `expo-document-picker` (and `expo-file-system` from #4).

**Security:** MIME + extension allowlist (`application/pdf`, `image/jpeg|png|heic|heif`),
25 MB cap, timestamped unique keys, no overwrite, owner_id set to the client's
admin (so admins still see uploads), private bucket, downloads still via
short-lived signed URLs. Offline/cancel handled with friendly messaging + retry.

**Validation:** mobile `tsc` ✅ · `expo lint` ✅ · `expo-doctor` 18/18 ✅ · iOS
export ✅ (3.66 MB). No web changes ⇒ no web checks needed.

**Remaining before #6 (Face ID / Touch ID):** none blocking. Nice-to-haves:
real device camera/library/Files capture pass in Expo Go; consider a NetInfo
pre-check for nicer offline UX (today offline surfaces as a failed upload +
retry); admin-side upload entry is intentionally out of scope (portal-only).

---

## #4 — Native PDF Viewer ✅

**Goal:** open the authoritative invoice PDF (the same pdf-lib output as the web
download / emailed attachment) inside the app, for admin and portal users.

**Architecture decisions**
- **Reuse the existing route** `GET /api/invoices/[id]/pdf` instead of
  re-rendering on device.
- **Token-auth bridge (the one required web change):** that route authed via
  cookies (`getUser()`), but mobile holds a Supabase **token** session. Made
  `lib/supabase/server.ts` `createClient()` forward an `Authorization: Bearer`
  header to PostgREST when present — a strict **no-op for browser/cookie**
  requests, still anon key + user JWT (RLS-scoped, no service-role). The route
  also validates the bearer (`auth.getUser(token)`). Works for admins and portal
  users via existing RLS.
- **Graceful fallback:** when `EXPO_PUBLIC_API_BASE_URL` is unset or offline, the
  viewer falls back to a local HTML recreation (`mobile/src/lib/invoice-html.ts`).

**Files changed (#4):**
- `lib/supabase/server.ts` *(web, additive)* — bearer-header forwarding.
- `app/api/invoices/[id]/pdf/route.ts` *(web, additive)* — accept bearer token.
- `mobile/src/components/invoice-pdf.tsx` — download real PDF → WebView preview + share file; HTML fallback.
- `mobile/src/lib/invoice-html.ts` — repurposed as the offline fallback (doc note).
- `mobile/src/lib/supabase.ts` — `apiBaseUrl` export.
- `mobile/.env.example` — `EXPO_PUBLIC_API_BASE_URL` (= `https://invoices.tdstudiosny.com`).

**Validation:** mobile `tsc`/lint/doctor/iOS export ✅; web `tsc` + eslint on the
two changed files ✅.
