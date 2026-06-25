# TD Studios Mobile

Expo companion app for the existing TD Studios invoice platform. The mobile
project lives in `mobile/` and connects directly to the same Supabase project
with the public anon key and existing Row Level Security policies.

## Current scope

- Email/password Supabase Auth with persisted sessions
- Protected admin and client-portal navigation
- Admin dashboard, clients, invoice creation/editing, invoice detail, and settings
- Portal home, secure file list/downloads, invoices, invoice detail, and settings
- Existing-client invoice writes through the anon client and owner-scoped RLS
- Admin file uploads for any owned client, including category and folder metadata
- No service-role client, schema changes, Stripe, or Resend

## Project structure

```text
mobile/
  app/                  Expo Router screens and role-based route groups
    (admin)/            Admin tabs and detail stacks
    (portal)/           Portal tabs and invoice detail stack
  src/components/       Shared native UI and invoice detail
  src/hooks/            Screen query/pull-to-refresh helper
  src/lib/              Supabase client, reads, and formatting
  src/providers/        Auth session and role provider
  src/types/            Type-only bridge to the web app's database types
```

## Setup

Requires Node.js 20+.

```bash
cd mobile
npm install
cp .env.example .env
```

Set the same public values used by the web app:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

Never use a Supabase service-role key in the mobile app.

## Test on an iPhone with Expo Go

This app intentionally uses Expo SDK 54 because Expo currently recommends SDK
54 for physical-device Expo Go testing during the SDK 56 transition.

1. Install **Expo Go** from the iOS App Store.
2. Connect the Mac and iPhone to the same Wi-Fi network.
3. Run `npx expo start` from `mobile/`.
4. Scan the terminal QR code with the iPhone Camera app.
5. Sign in with an existing admin or portal account.

If LAN discovery is blocked, try `npx expo start --tunnel`.

## iOS Simulator

Install Xcode and an iOS Simulator runtime, then run:

```bash
npm run ios
```

You can also start Metro with `npx expo start` and press `i`.

## Checks

```bash
npm run typecheck
npm run lint
npx expo-doctor
```

## EAS build later

No EAS project or store submission is configured yet. When device testing is
complete, install the EAS CLI, run `eas build:configure`, choose the final bundle
identifier, and create an internal iOS build before considering App Store
submission.
