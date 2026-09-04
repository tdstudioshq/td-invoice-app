/**
 * Reconcile the DATABASE's idea of "who is an admin" with the ENV's.
 *
 * `ADMIN_EMAILS` gates routes; Postgres cannot read it. Migration
 * 20260824193000 added the database half — `workspace_admins` (uid allowlist)
 * and the singleton `workspace_owner` (the uid every owner-scoped row is
 * written under) — and `current_owner_id()` maps an admin's uid onto that
 * owner so several logins share ONE dataset. Both tables run RLS with no
 * policies, so only this script (service role) can write them.
 *
 * That migration named this script as the authoritative seeder and it did not
 * exist, which meant every admin after the first had to be added by hand, and
 * an admin who was never added silently forked their own private workspace.
 *
 * WHAT IT DOES (idempotent, safe to re-run):
 *   1. Resolves every ADMIN_EMAILS address to its auth user.
 *   2. Seeds `workspace_owner` from ADMIN_EMAILS[0] when the table is empty.
 *      An EXISTING owner is never repointed — that would move the whole
 *      dataset — it is only reported when it drifts out of ADMIN_EMAILS.
 *   3. Inserts the missing `workspace_admins` rows.
 *   4. Audits every owner-scoped table for rows stranded under an admin uid
 *      that is not the canonical owner (a forked workspace), and for the
 *      `company_settings` row whose owner_id is NULL.
 *
 * WHAT IT DOES NOT DO WITHOUT A FLAG:
 *   --adopt   re-owns the stranded rows found by step 4 to the canonical
 *             owner, and adopts a NULL-owner company_settings row. This
 *             rewrites business data, so it is opt-in and prints the exact
 *             counts first.
 *   --prune   deletes `workspace_admins` rows whose email is no longer in
 *             ADMIN_EMAILS (removing DB access that the env already revoked).
 *
 * Attribution columns are deliberately left alone: `file_activity.actor_id`,
 * `client_files.uploaded_by` and `qr_generations.owner_id` record who acted,
 * not who owns, and remapping them would rewrite history.
 *
 * Usage:
 *   npm run admin:sync
 *   npm run admin:sync -- --adopt
 *   npm run admin:sync -- --adopt --prune
 *
 * Runtime: plain Node >= 22.18 (native TypeScript type-stripping + --env-file;
 * the npm script passes --env-file=.env.local). ESM only, no TS enums, no "@/"
 * aliases — repo imports must be `import type`. The service-role key never
 * leaves process.env and is never printed.
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../lib/types/database";

type Admin = SupabaseClient<Database>;

/**
 * Every table whose RLS reads `owner_id = current_owner_id()`. A row here
 * under the wrong uid is invisible to everyone once its author starts acting
 * as the workspace owner, which is exactly what --adopt repairs.
 *
 * Deliberately absent: `client_file_favorites` (no owner_id — a star is
 * personal, scoped by user_id) and `qr_generations` (an append-only log with
 * no policies, read by /qr/history through the service role).
 */
const OWNER_SCOPED_TABLES = [
  "clients",
  "invoices",
  "invoice_items",
  "payments",
  "client_users",
  "client_file_folders",
  "client_files",
  "file_activity",
  "client_projects",
  "qr_codes",
  "tasks",
] as const;

type OwnerScopedTable = (typeof OWNER_SCOPED_TABLES)[number];

function fail(message: string, remediation?: string): never {
  console.error(`\n✖ ${message}`);
  if (remediation) console.error(`\n${remediation}`);
  process.exit(1);
}

function assertEnv() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!url || !secretKey) {
    fail(
      "SUPABASE_URL and SUPABASE_SECRET_KEY are required.",
      "Set them in .env.local (see .env.example) — the npm script loads it via --env-file.",
    );
  }
  if (adminEmails.length === 0) {
    fail(
      "ADMIN_EMAILS is empty, so nobody is an admin and there is nothing to sync.",
      "Set ADMIN_EMAILS in .env.local to your admin sign-in address(es), comma-separated.",
    );
  }
  return { url, secretKey, adminEmails };
}

/** email (lowercased) -> auth user, for every user in the project. */
async function loadUsersByEmail(admin: Admin): Promise<Map<string, User>> {
  const byEmail = new Map<string, User>();
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) fail(`Could not list auth users: ${error.message}`);
    for (const user of data.users) {
      const email = (user.email ?? "").toLowerCase();
      if (email) byEmail.set(email, user);
    }
    if (data.users.length < perPage) break;
  }
  return byEmail;
}

/** A missing table means 20260824193000 was never applied. */
function checkMigrationError(message: string | undefined): void {
  if (!message) return;
  if (/relation|schema cache|does not exist/i.test(message)) {
    fail(
      `Database error: ${message}`,
      "This looks like migration 20260824193000_workspace_admin_ownership.sql\n" +
        "hasn't been applied. Run `supabase db push --linked`, then re-run this script.",
    );
  }
}

async function main() {
  const env = assertEnv();
  const adopt = process.argv.includes("--adopt");
  const prune = process.argv.includes("--prune");
  const admin = createClient<Database>(env.url, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const byEmail = await loadUsersByEmail(admin);
  const notes: string[] = [];

  // ---------------------------------------------------------------------
  // 1. ADMIN_EMAILS -> auth users.
  // ---------------------------------------------------------------------
  const resolved: { email: string; user: User }[] = [];
  const missing: string[] = [];
  for (const email of env.adminEmails) {
    const user = byEmail.get(email);
    if (user) resolved.push({ email, user });
    else missing.push(email);
  }
  if (resolved.length === 0) {
    fail(
      "None of the ADMIN_EMAILS addresses has a Supabase auth user yet.",
      "Each admin must sign in (or be created in the Supabase dashboard) at least\n" +
        "once before they can be added to workspace_admins.",
    );
  }

  console.log("\nAdmins in ADMIN_EMAILS:");
  for (const { email, user } of resolved) {
    console.log(`  • ${email.padEnd(28)} ${user.id}`);
  }
  for (const email of missing) {
    console.log(`  • ${email.padEnd(28)} (no auth user yet — skipped)`);
    notes.push(
      `${email} has no Supabase auth user. They must sign in once, then re-run this script.`,
    );
  }

  // ---------------------------------------------------------------------
  // 2. The canonical owner. Seeded when absent; NEVER repointed, because
  //    every owner-scoped row in the database is written under it.
  // ---------------------------------------------------------------------
  const { data: ownerRow, error: ownerReadError } = await admin
    .from("workspace_owner")
    .select("owner_id")
    .limit(1)
    .maybeSingle();
  if (ownerReadError) {
    checkMigrationError(ownerReadError.message);
    fail(`Could not read workspace_owner: ${ownerReadError.message}`);
  }

  let ownerId = ownerRow?.owner_id ?? null;
  if (!ownerId) {
    const first = resolved[0];
    const { error } = await admin
      .from("workspace_owner")
      .insert({ singleton: true, owner_id: first.user.id });
    if (error) fail(`Could not seed workspace_owner: ${error.message}`);
    ownerId = first.user.id;
    console.log(`\nWorkspace owner: seeded as ${first.email}`);
  } else {
    const ownerEmail =
      resolved.find(({ user }) => user.id === ownerId)?.email ?? null;
    console.log(
      `\nWorkspace owner: ${ownerEmail ?? "(uid not in ADMIN_EMAILS)"} ${ownerId}`,
    );
    if (!ownerEmail) {
      notes.push(
        "workspace_owner points at a uid that is not in ADMIN_EMAILS. It is left\n" +
          "    alone on purpose — repointing it would orphan every existing row. Add that\n" +
          "    account's email back to ADMIN_EMAILS, or migrate ownership deliberately.",
      );
    }
  }

  // ---------------------------------------------------------------------
  // 3. workspace_admins rows.
  // ---------------------------------------------------------------------
  const { data: existingAdmins, error: adminsReadError } = await admin
    .from("workspace_admins")
    .select("user_id");
  if (adminsReadError) {
    checkMigrationError(adminsReadError.message);
    fail(`Could not read workspace_admins: ${adminsReadError.message}`);
  }
  const existingIds = new Set((existingAdmins ?? []).map((r) => r.user_id));

  console.log("\nworkspace_admins:");
  for (const { email, user } of resolved) {
    if (existingIds.has(user.id)) {
      console.log(`  • ${email.padEnd(28)} already present`);
      continue;
    }
    const { error } = await admin
      .from("workspace_admins")
      .insert({ user_id: user.id, note: `synced from ADMIN_EMAILS (${email})` });
    if (error) {
      // 42501 is the mutual-exclusion trigger: a portal user cannot also be a
      // workspace admin (20260824193000). Report it rather than dying, so the
      // remaining admins still sync.
      if (error.code === "42501" || /portal mapping/i.test(error.message)) {
        console.log(`  • ${email.padEnd(28)} REFUSED — has an active client portal login`);
        notes.push(
          `${email} has an active client_users mapping, so it cannot be a workspace\n` +
            "    admin (they are mutually exclusive by database trigger). Revoke that portal\n" +
            "    mapping first if this account really should be an admin.",
        );
        continue;
      }
      fail(`Could not add ${email} to workspace_admins: ${error.message}`);
    }
    console.log(`  • ${email.padEnd(28)} ADDED`);
  }

  // Rows in the table that the env no longer lists.
  const allowedIds = new Set(resolved.map(({ user }) => user.id));
  const stale = (existingAdmins ?? [])
    .map((r) => r.user_id)
    .filter((id) => !allowedIds.has(id));
  for (const id of stale) {
    const email =
      [...byEmail.entries()].find(([, u]) => u.id === id)?.[0] ?? "(unknown email)";
    if (!prune) {
      console.log(`  • ${email.padEnd(28)} in DB but NOT in ADMIN_EMAILS (use --prune to remove)`);
      notes.push(
        `${email} is a workspace admin in the database but is not in ADMIN_EMAILS.\n` +
          "    They cannot reach the dashboard (routes are gated by the env list), but the\n" +
          "    two allowlists should agree. Re-run with --prune to remove the row.",
      );
      continue;
    }
    const { error } = await admin.from("workspace_admins").delete().eq("user_id", id);
    if (error) fail(`Could not remove ${email} from workspace_admins: ${error.message}`);
    console.log(`  • ${email.padEnd(28)} PRUNED`);
  }

  // ---------------------------------------------------------------------
  // 4. Stranded rows — a forked workspace, which is the bug this whole
  //    mechanism exists to prevent. An admin who created rows BEFORE being
  //    added above owns them under their own uid; once current_owner_id()
  //    starts answering with the canonical owner, those rows are invisible
  //    to everyone, including their author.
  // ---------------------------------------------------------------------
  const strandedIds = [...allowedIds].filter((id) => id !== ownerId);
  const counts: { table: OwnerScopedTable; owner: string; n: number }[] = [];
  for (const table of OWNER_SCOPED_TABLES) {
    for (const id of strandedIds) {
      const { count, error } = await admin
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("owner_id", id);
      if (error) {
        checkMigrationError(error.message);
        fail(`Could not audit ${table}: ${error.message}`);
      }
      if ((count ?? 0) > 0) counts.push({ table, owner: id, n: count ?? 0 });
    }
  }

  const { data: settings, error: settingsError } = await admin
    .from("company_settings")
    .select("id, owner_id");
  if (settingsError) fail(`Could not read company_settings: ${settingsError.message}`);
  const orphanSettings = (settings ?? []).filter((row) => row.owner_id === null);

  if (counts.length === 0 && orphanSettings.length === 0) {
    console.log("\nOwned rows: nothing stranded — every row belongs to the workspace owner.");
  } else {
    console.log(
      adopt
        ? "\nAdopting rows into the shared workspace:"
        : "\nRows NOT visible in the shared workspace (re-run with --adopt to fix):",
    );
    for (const { table, owner, n } of counts) {
      const email =
        [...byEmail.entries()].find(([, u]) => u.id === owner)?.[0] ?? owner;
      if (!adopt) {
        console.log(`  • ${table.padEnd(22)} ${String(n).padStart(4)} row(s) owned by ${email}`);
        continue;
      }
      const { error } = await admin
        .from(table)
        .update({ owner_id: ownerId })
        .eq("owner_id", owner);
      if (error) fail(`Could not re-own ${table}: ${error.message}`);
      console.log(`  • ${table.padEnd(22)} ${String(n).padStart(4)} row(s) moved from ${email}`);
    }
    for (const row of orphanSettings) {
      if (!adopt) {
        console.log(`  • ${"company_settings".padEnd(22)}    1 row with owner_id NULL (invisible to every admin)`);
        continue;
      }
      const { error } = await admin
        .from("company_settings")
        .update({ owner_id: ownerId })
        .eq("id", row.id);
      if (error) fail(`Could not adopt company_settings: ${error.message}`);
      console.log(`  • ${"company_settings".padEnd(22)}    1 row adopted by the workspace owner`);
    }
  }

  if (!adopt && (counts.length > 0 || orphanSettings.length > 0)) {
    notes.push("Re-run with `npm run admin:sync -- --adopt` to move those rows into the shared workspace.");
  }

  console.log("\n✔ Workspace admins are in sync.\n");
  for (const note of notes) console.log(`  ! ${note}`);
  if (notes.length > 0) console.log("");
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
