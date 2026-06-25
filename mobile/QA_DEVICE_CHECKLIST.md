# TD Studios Mobile — Real-Device QA Checklist

Manual QA for the Expo app (`mobile/`) on a **physical iPhone** via Expo Go.
Covers #4 PDF viewer, #5 camera/document uploads, #6 Face ID / Touch ID, plus
auth, realtime, downloads, and failure cases.

> The static checks (`tsc`, `expo lint`, `expo-doctor`, iOS export) all pass.
> This document is for the things only a real device + real data can prove:
> camera, Face ID/Touch ID, biometrics enrollment, share sheet, signed-URL opens.

---

## 0. Prerequisites

- [ ] iPhone with **Expo Go** installed (App Store) — must support **Expo SDK 54**.
- [ ] Face ID **or** Touch ID enrolled on the iPhone (for #6).
- [ ] iPhone and Mac on the **same Wi-Fi** (or use `--tunnel`, see commands).
- [ ] Supabase project reachable; **Realtime enabled** on the tables you'll test
      (e.g. `client_files`, `invoices`).
- [ ] An **admin** test account (a Supabase user with **no** `client_users` row).
- [ ] A **portal** test account (a user **with** an active `client_users` row).
      Have **two** portal users ready if possible: one with `can_upload = true`,
      one with `can_upload = false`.
- [ ] At least one **non-draft** invoice for the portal user's client (drafts are
      hidden from portal users by RLS).

### Expo Go caveats (read once)
- All native modules used here (image-picker, document-picker, file-system,
  local-authentication, secure-store) **are bundled in Expo Go** — no custom dev
  client needed.
- **Custom permission strings** (Face ID / camera prompts in `app.json`) only
  appear in a real prebuild/EAS build. In Expo Go the OS shows **Expo Go's own**
  generic permission text. The *functionality* is unaffected — only the wording
  differs.
- Test on a **physical device**: the Simulator has no camera, and Face ID there
  is simulated (Features ▸ Face ID).

---

## 1. Terminal commands (run from repo root)

```bash
# 1. Enter the mobile workspace (its own node_modules / toolchain)
cd mobile

# 2. Install dependencies (first time, or after a pull)
npm install

# 3. Create your local env file, then edit it (see section 2)
cp .env.example .env

# 4. Start the dev server, then scan the QR with the iPhone Camera app
npx expo start
#   - press  i   to also open the iOS Simulator (optional)
#   - if the QR won't connect (different networks / firewall):
npx expo start --tunnel
#   - to start from a clean cache if something looks stale:
npx expo start -c

# --- Optional sanity checks (no device needed) ---
npm run typecheck        # tsc --noEmit
npm run lint             # expo lint
npx expo-doctor          # 18/18 expected
npx expo export --platform ios   # production JS bundle builds; then: rm -rf dist
```

To open in the Simulator instead of a physical device: `npm run ios`.

---

## 2. `.env` setup

Edit `mobile/.env` with **real** values:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-public-key>
EXPO_PUBLIC_API_BASE_URL=https://invoices.tdstudiosny.com
```

- [ ] `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` set (anon key
      only — **never** a service-role/secret key in mobile).
- [ ] `EXPO_PUBLIC_API_BASE_URL` set to the **deployed web app** URL. Required for
      the *authoritative* PDF; if blank the viewer uses the offline HTML preview.
- [ ] **Restart `expo start` after editing `.env`** (env is read at bundle start).
- [ ] Sanity: if all Supabase vars are blank, the app shows a clear
      "Add EXPO_PUBLIC_SUPABASE_URL…" configuration message instead of crashing.

---

## 3. Admin login

- [ ] Launch the app → lands on the **sign-in** screen.
- [ ] Sign in with the **admin** account.
- [ ] Routes to the **admin** experience (Dashboard), not the portal.
- [ ] Dashboard, Clients, Invoices, Settings tabs load real data.
- [ ] Settings ▸ Account shows the admin email and "Administrator".

## 4. Portal login

- [ ] Sign out (or use a second device), then sign in with the **portal** account.
- [ ] Routes to the **portal** home (`/portal-home`), not the admin dashboard.
- [ ] Portal can see only **their** client's invoices/files; no admin screens.
- [ ] Portal ▸ Settings shows "Client portal" and the correct **Uploads** value
      (Enabled vs View only) matching `can_upload`.

## 5. Realtime behavior

- [ ] Open the portal **Files** screen on the device.
- [ ] In the **web app** (or a second device), add/upload a file for that client.
- [ ] The mobile list **updates on its own** (no manual pull-to-refresh).
- [ ] Repeat for an invoice change (e.g. mark sent/paid in web) → mobile reflects
      it.
- [ ] Pull-to-refresh still works as a manual fallback.

## 6. PDF viewer (#4)

- [ ] Open an invoice → tap **View PDF**.
- [ ] The **authoritative** PDF renders (matches the web/emailed PDF byte-for-byte,
      not an HTML lookalike) — requires `EXPO_PUBLIC_API_BASE_URL` + network.
- [ ] Tap **Share PDF** → iOS share sheet → save to Files / open in Quick Look /
      Mail — the shared file is a real `.pdf`.
- [ ] Works for **both** an admin-opened invoice and a portal-opened invoice.
- [ ] **Offline fallback:** turn on Airplane Mode → open a different invoice's PDF
      → it shows "**Showing an offline preview…**" (locally rendered HTML) and can
      still be shared. Turn networking back on.
- [ ] (Optional) Blank out `EXPO_PUBLIC_API_BASE_URL`, restart → viewer always
      uses the offline preview. Restore the value afterward.

## 7. Camera upload (#5 — portal user with `can_upload`)

- [ ] Portal ▸ **Files** → the **Upload Document** card is visible.
- [ ] Tap Upload → **Take Photo** → grant camera permission (first time).
- [ ] Capture a photo → see a **thumbnail preview** + file size.
- [ ] **Rename** the file (base name editable, extension preserved) → **Upload**.
- [ ] **Progress bar** advances; reaches **100%** → "**Uploaded**" confirmation.
- [ ] The new file appears under **Uploads** (live, via realtime) with correct
      size/timestamp.

## 8. Document upload (#5)

- [ ] Upload ▸ **Choose from Library** → pick a photo → preview → upload → success.
- [ ] Upload ▸ **Choose a File** → pick a **PDF** → file icon preview → upload →
      success.
- [ ] From a **portal invoice** detail → **Upload Supporting Document** → upload →
      success (activity is tagged with the invoice number).
- [ ] Confirm a **portal user with `can_upload = false`** sees **no** Upload card
      anywhere.

## 9. File download

- [ ] Portal ▸ Files → tap a file row → it opens via a **short-lived signed URL**
      (in the browser / appropriate viewer).
- [ ] A just-uploaded file downloads/opens correctly.
- [ ] Files are **never** public — only reachable through the signed URL flow.

## 10. Face ID / Touch ID — enable / disable (#6)

- [ ] Settings ▸ **Security** → toggle shows **Face ID** or **Touch ID** (matches
      the device).
- [ ] Turn the toggle **ON** → a biometric prompt appears immediately → on success
      the toggle **stays on**.
- [ ] Fully quit and relaunch the app (with a saved session) → it **prompts to
      unlock** before showing any content.
- [ ] Turn the toggle **OFF** → no prompt on next relaunch/background.
- [ ] **Unavailable device:** on a phone with **no** enrolled biometrics, the
      toggle is **disabled** with an explanation and the app **never locks**
      (fails open).

## 11. Background → foreground lock (#6)

(With the lock **enabled**:)
- [ ] Send the app to the **background** (Home / app switcher), then reopen → the
      **lock overlay** appears and prompts.
- [ ] Successful biometric → app content returns to exactly where you were.
- [ ] **Cold start** with an existing session → prompts before content.
- [ ] **First login is never blocked:** sign out, force-quit, relaunch, sign in
      with email/password → you go **straight into the app** (no biometric gate on
      the fresh login itself).

## 12. Sign out

- [ ] Settings ▸ **Sign out** → returns to the sign-in screen.
- [ ] After sign-out, relaunch → starts at login (no stale session, **no** lock
      prompt without a session).
- [ ] On the **lock screen**, **Sign out instead** works as an escape hatch and
      returns to login.

## 13. Failure cases

**Auth**
- [ ] Wrong password → inline error, stays on login.
- [ ] Misconfigured/blank Supabase env → clear configuration message, no crash.

**Uploads**
- [ ] File **> 25 MB** → rejected with "…over the 25 MB limit." (no upload).
- [ ] **Unsupported type** (e.g. `.txt`, `.mov`) → rejected with the allowed-types
      message.
- [ ] **Cancel** mid-upload → returns to the preview, nothing is saved.
- [ ] **Offline** during upload (Airplane Mode) → friendly failure message →
      **Retry** succeeds once back online.
- [ ] Deny camera/photo permission → clear "permission required" message, no crash.

**Biometrics**
- [ ] Cancel the unlock prompt → "**Authentication failed. Try again.**" →
      **Unlock** retry works.
- [ ] Several failed attempts → still recoverable (retry or **Sign out instead**);
      never permanently locked out.

**PDF**
- [ ] Open PDF with no network and no API base URL → offline preview (no crash).

**Realtime/permissions**
- [ ] Portal user cannot see another client's invoices/files anywhere (RLS).
- [ ] Draft invoices do **not** appear for portal users.

---

## Sign-off

| Area | Pass | Notes |
|---|---|---|
| Setup / env | ☐ | |
| Admin login | ☐ | |
| Portal login | ☐ | |
| Realtime | ☐ | |
| PDF viewer | ☐ | |
| Camera upload | ☐ | |
| Document upload | ☐ | |
| File download | ☐ | |
| Face ID / Touch ID toggle | ☐ | |
| Background lock | ☐ | |
| Sign out | ☐ | |
| Failure cases | ☐ | |

Tester: ____________  Device / iOS: ____________  Date: ____________
