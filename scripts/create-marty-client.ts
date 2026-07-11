/**
 * One-time (but safe-to-re-run) setup script: provision the "Marty" client
 * portal account.
 *
 * What it does, idempotently:
 *   1. Resolves the ADMIN auth user from ADMIN_EMAILS[0] — every seeded row's
 *      owner_id must be the admin's id (service-role inserts get no auth.uid()
 *      default, and the dashboard's RLS is owner-scoped).
 *   2. Finds or creates Marty's Supabase auth user (email pre-confirmed) with
 *      the temporary password from MARTY_TEMP_PASSWORD. An existing user's
 *      password is NEVER reset unless --reset-password is passed.
 *   3. Finds or creates his `clients` row.
 *   4. Finds or creates his `client_users` mapping (can_upload=false,
 *      must_change_password=true; reactivates a revoked mapping; refuses to
 *      rewire a mapping that points at a different client).
 *   5. Seeds the starter project "Marty Design Files" (in_progress).
 *
 * Prerequisites:
 *   - supabase/migrations/0016_client_projects.sql applied to the database.
 *   - .env.local with SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_EMAILS.
 *   - MARTY_TEMP_PASSWORD set (only required when a password will be set).
 *
 * Usage:
 *   MARTY_TEMP_PASSWORD='<temp password>' npm run client:create-marty
 *   MARTY_TEMP_PASSWORD='<temp password>' npm run client:create-marty -- --reset-password
 *
 * Runtime: plain Node >= 22.18 (native TypeScript type-stripping + --env-file;
 * the npm script passes --env-file=.env.local). Constraints that implies: ESM
 * only, no TS enums/namespaces, no "@/" path aliases — repo imports must be
 * `import type` (erased at run time); value imports only from node_modules.
 * Older Node fallback: npm i -D tsx && node --env-file=.env.local --import tsx
 * scripts/create-marty-client.ts
 *
 * The service-role key never leaves process.env and is never printed. The
 * temp password is printed to stdout ONLY when this run actually set it.
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../lib/types/database";

const MARTY_EMAIL = "zazaorders26@gmail.com";
const CLIENT_COMPANY_NAME = "Marty";
const PROJECT_NAME = "Marty Design Files";
const PROJECT_DESCRIPTION =
  "Private design files and completed artwork provided by TD Studios.";

type Admin = SupabaseClient<Database>;

function fail(message: string, remediation?: string): never {
  console.error(`\n✖ ${message}`);
  if (remediation) console.error(`\n${remediation}`);
  process.exit(1);
}

function assertEnv() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const adminEmail = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)[0];

  if (!url || !secretKey) {
    fail(
      "SUPABASE_URL and SUPABASE_SECRET_KEY are required.",
      "Set them in .env.local (see .env.example) — the npm script loads it via --env-file.",
    );
  }
  if (!adminEmail) {
    fail(
      "ADMIN_EMAILS is required (its first entry becomes the owner of the seeded rows).",
      "Set ADMIN_EMAILS in .env.local to your admin sign-in email.",
    );
  }
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  return { url, secretKey, adminEmail, siteUrl };
}

async function findAuthUserByEmail(
  admin: Admin,
  email: string,
): Promise<User | null> {
  const target = email.toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) fail(`Could not list auth users: ${error.message}`);
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === target,
    );
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  return null;
}

function isWeakPasswordError(message: string): boolean {
  return /password/i.test(message) && /at least|too short|weak|length/i.test(message);
}

function requireTempPassword(): string {
  const password = process.env.MARTY_TEMP_PASSWORD;
  if (!password) {
    fail(
      "MARTY_TEMP_PASSWORD is required to set the account password.",
      "Run:  MARTY_TEMP_PASSWORD='<temp password>' npm run client:create-marty\n" +
        "(The password is intentionally not hardcoded in the repo.)",
    );
  }
  return password;
}

/** PostgREST error for a missing column/table means 0016 wasn't applied. */
function checkMigrationError(message: string | undefined): void {
  if (!message) return;
  if (/column|relation|schema cache|does not exist/i.test(message)) {
    fail(
      `Database error: ${message}`,
      "This looks like migration 0016 hasn't been applied. Run\n" +
        "supabase/migrations/0016_client_projects.sql in the Supabase SQL editor\n" +
        "(or `supabase db push`), then re-run this script.",
    );
  }
}

async function main() {
  const env = assertEnv();
  const resetPassword = process.argv.includes("--reset-password");

  const admin: Admin = createClient<Database>(env.url!, env.secretKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const summary: string[] = [];

  // 1. Resolve the admin (owner of all seeded rows).
  const adminUser = await findAuthUserByEmail(admin, env.adminEmail!);
  if (!adminUser) {
    fail(
      `Admin auth user <${env.adminEmail}> not found in Supabase Auth.`,
      "Sign in to the app once as that email (ADMIN_EMAILS[0]) so the auth user exists, then re-run.",
    );
  }
  const ownerId = adminUser.id;
  summary.push(`Owner (admin): ${env.adminEmail} (${ownerId})`);

  // 2. Marty's auth user.
  let martyAuth = await findAuthUserByEmail(admin, MARTY_EMAIL);
  let passwordWasSet = false;
  if (!martyAuth) {
    const tempPassword = requireTempPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email: MARTY_EMAIL,
      password: tempPassword,
      email_confirm: true,
    });
    if (error || !data.user) {
      const message = error?.message ?? "unknown error";
      if (isWeakPasswordError(message)) {
        fail(
          `Supabase rejected the temp password: ${message}`,
          "Choose a MARTY_TEMP_PASSWORD that satisfies the project's minimum password length\n" +
            "(Dashboard → Authentication → Sign In / Providers), then re-run.",
        );
      }
      fail(`Could not create the auth user: ${message}`);
    }
    martyAuth = data.user;
    passwordWasSet = true;
    summary.push(`Auth user: created (${MARTY_EMAIL}, email pre-confirmed)`);
  } else if (resetPassword) {
    const tempPassword = requireTempPassword();
    const { error } = await admin.auth.admin.updateUserById(martyAuth.id, {
      password: tempPassword,
    });
    if (error) {
      if (isWeakPasswordError(error.message)) {
        fail(
          `Supabase rejected the temp password: ${error.message}`,
          "Choose a MARTY_TEMP_PASSWORD that satisfies the project's minimum password length, then re-run.",
        );
      }
      fail(`Could not reset the password: ${error.message}`);
    }
    passwordWasSet = true;
    summary.push("Auth user: exists — password RESET (--reset-password)");
  } else {
    summary.push(
      "Auth user: exists — password left untouched (use --reset-password to force)",
    );
  }

  // 3. clients row (owner-scoped; find by email under this owner).
  const { data: existingClient, error: clientFindError } = await admin
    .from("clients")
    .select("id, company_name")
    .eq("owner_id", ownerId)
    .ilike("email", MARTY_EMAIL)
    .limit(1)
    .maybeSingle();
  if (clientFindError) {
    // A missing-column error means 0016 isn't applied; any OTHER lookup error
    // (network, timeout, 5xx) must also stop us — continuing would insert a
    // duplicate client, breaking idempotency.
    checkMigrationError(clientFindError.message);
    fail(`Could not look up the client record: ${clientFindError.message}`);
  }

  let clientId: string;
  if (existingClient) {
    clientId = existingClient.id;
    summary.push(`Client record: exists (“${existingClient.company_name}”)`);
  } else {
    const { data: inserted, error } = await admin
      .from("clients")
      .insert({
        owner_id: ownerId,
        company_name: CLIENT_COMPANY_NAME,
        contact_name: CLIENT_COMPANY_NAME,
        email: MARTY_EMAIL,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      checkMigrationError(error?.message);
      fail(`Could not create the client record: ${error?.message}`);
    }
    clientId = inserted.id;
    summary.push(`Client record: created (“${CLIENT_COMPANY_NAME}”)`);
  }

  // 4. client_users mapping (user_id is unique — one portal per auth user).
  const { data: mapping, error: mappingError } = await admin
    .from("client_users")
    .select("id, client_id, revoked_at, must_change_password")
    .eq("user_id", martyAuth.id)
    .maybeSingle();
  if (mappingError) checkMigrationError(mappingError.message);

  if (!mapping) {
    const { error } = await admin.from("client_users").insert({
      owner_id: ownerId,
      user_id: martyAuth.id,
      client_id: clientId,
      email: MARTY_EMAIL,
      can_upload: false,
      must_change_password: true,
    });
    if (error) {
      checkMigrationError(error.message);
      fail(`Could not create the portal mapping: ${error.message}`);
    }
    summary.push(
      "Portal access: created (downloads only, must change password on first login)",
    );
  } else if (mapping.client_id !== clientId) {
    fail(
      `The auth user is already mapped to a DIFFERENT client (${mapping.client_id}).`,
      "Refusing to rewire an existing portal mapping. Resolve this manually in the\n" +
        "admin dashboard (/client-portals) or the Supabase table editor.",
    );
  } else {
    const patch: Database["public"]["Tables"]["client_users"]["Update"] = {};
    if (mapping.revoked_at) {
      patch.revoked_at = null;
      patch.can_upload = false;
      summary.push("Portal access: was revoked — reactivated");
    }
    if (passwordWasSet && !mapping.must_change_password) {
      patch.must_change_password = true;
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await admin
        .from("client_users")
        .update(patch)
        .eq("id", mapping.id);
      if (error) fail(`Could not update the portal mapping: ${error.message}`);
      if (patch.must_change_password) {
        summary.push("Portal access: re-flagged must-change-password");
      }
    }
    if (!mapping.revoked_at && Object.keys(patch).length === 0) {
      summary.push("Portal access: exists (unchanged)");
    }
  }

  // 5. Starter project (find by name under this client).
  const { data: existingProject, error: projectFindError } = await admin
    .from("client_projects")
    .select("id")
    .eq("client_id", clientId)
    .eq("name", PROJECT_NAME)
    .limit(1)
    .maybeSingle();
  if (projectFindError) checkMigrationError(projectFindError.message);

  if (existingProject) {
    summary.push(`Project: exists (“${PROJECT_NAME}”)`);
  } else {
    const { error } = await admin.from("client_projects").insert({
      owner_id: ownerId,
      client_id: clientId,
      name: PROJECT_NAME,
      description: PROJECT_DESCRIPTION,
      status: "in_progress",
    });
    if (error) {
      checkMigrationError(error.message);
      fail(`Could not create the starter project: ${error.message}`);
    }
    summary.push(`Project: created (“${PROJECT_NAME}”, in progress)`);
  }

  console.log("\n✔ Marty's portal is ready.\n");
  for (const line of summary) console.log(`  • ${line}`);
  console.log(`\n  Sign-in URL:  ${env.siteUrl}/login`);
  console.log(`  Email:        ${MARTY_EMAIL}`);
  if (passwordWasSet) {
    console.log(`  Temp password: ${process.env.MARTY_TEMP_PASSWORD}`);
    console.log(
      "\n  Marty will be prompted to set his own password on first login\n" +
        "  (portal → Account, or the banner shown on every portal page).",
    );
  }
  console.log("");
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
