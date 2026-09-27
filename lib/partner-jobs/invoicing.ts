import "server-only";

import type { PartnerJobInvoiceContext } from "@/lib/partner-jobs/queries";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type CookieClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The `clients` row a partner company is invoiced as, creating and recording it
 * on first use.
 *
 * Two clients, split by what each table allows: `clients` is owner-scoped, so
 * the row is found or created through the studio's COOKIE-SCOPED client under
 * the workspace owner (exactly as `resolveClientId` in app/actions/invoices.ts
 * does for a typed name); `partner_companies` has no owner and no admin policy,
 * so recording the link goes through the service role. Callers have already
 * asserted requireAdmin().
 *
 * A recorded client_id that the studio can no longer see (the client was
 * deleted, and the FK nulled it — or it never belonged to this workspace) is
 * re-resolved rather than trusted.
 */
export async function ensurePartnerCompanyClient(
  context: PartnerJobInvoiceContext,
  supabase: CookieClient,
  ownerId: string,
): Promise<{ clientId: string } | { error: string }> {
  const { company } = context;

  if (company.client_id) {
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("id", company.client_id)
      .maybeSingle();
    if (existing) return { clientId: existing.id };
  }

  let clientId: string | null = null;
  const { data: byName } = await supabase
    .from("clients")
    .select("id")
    .ilike("company_name", company.name)
    .limit(1)
    .maybeSingle();
  if (byName) {
    clientId = byName.id;
  } else {
    const { data: created, error } = await supabase
      .from("clients")
      .insert({ company_name: company.name, owner_id: ownerId })
      .select("id")
      .single();
    if (error || !created) {
      console.error("ensurePartnerCompanyClient insert", error?.message);
      return { error: `Couldn't create a client for ${company.name}.` };
    }
    clientId = created.id;
  }

  if (!isSupabaseAdminConfigured()) {
    return { error: "Supabase admin access is not configured." };
  }
  const { error: linkError } = await createAdminClient()
    .from("partner_companies")
    .update({ client_id: clientId })
    .eq("id", company.id);
  if (linkError) {
    console.error("ensurePartnerCompanyClient link", linkError.message);
    return { error: `Couldn't link ${company.name} to its client.` };
  }
  return { clientId };
}
