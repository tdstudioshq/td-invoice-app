import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  getPartnerContext,
  getUser,
  isAdminEmail,
  roleHome,
  type PartnerContext,
} from "@/lib/auth";
import {
  PARTNER_BASE_HEADER,
  PARTNER_ROUTE_ROOT,
  PARTNER_VIA_HEADER,
  partnerHref,
} from "@/lib/partner-jobs/routing";
import { getSiteUrl } from "@/lib/email/client";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { PartnerCompany } from "@/lib/types/database";

/**
 * Server-side helpers shared by every partner-portal page.
 *
 * The portal is one set of routes reached from three different URL shapes (see
 * lib/partner-jobs/routing.ts), so the two things a page always needs are:
 * which company it is rendering, and what prefix its links must carry.
 */

/**
 * Re-exported from the dependency-free routing module, where it now lives so
 * CLIENT components (the jobs browser, the tab chips) can build in-portal links
 * too — this file is `server-only` and cannot be imported by one.
 */
export { partnerHref };

/**
 * The prefix every in-portal link and redirect must be built from, in EXTERNAL
 * terms — so a rep on zazaorders.tdstudiosny.com never sees `/partner/zaza`
 * appear in their address bar.
 *
 * The proxy stamps how the request arrived onto the rewritten request; anything
 * it did not stamp is a direct hit on the internal path. Those headers are
 * deleted from every incoming request before being re-set, so a client cannot
 * forge one — and forging one would only change link prefixes on the page they
 * are already looking at, never what they may read.
 */
export async function partnerBasePath(companySlug: string): Promise<string> {
  const requestHeaders = await headers();
  const via = requestHeaders.get(PARTNER_VIA_HEADER);
  if (via === "subdomain") return "";
  if (via === "alias") {
    const base = requestHeaders.get(PARTNER_BASE_HEADER);
    if (base && base.startsWith("/")) return base;
  }
  return `${PARTNER_ROUTE_ROOT}/${companySlug}`;
}

/**
 * Resolve a portal slug to its company.
 *
 * Reads through the SERVICE-ROLE client because the login page has no session
 * and `partner_companies` is readable under RLS only by a member of that
 * company — a signed-out visitor would otherwise get nothing and the portal
 * could not render its own name. Only the four branding fields are returned,
 * and only for an ACTIVE company, so this exposes no more than the login screen
 * already shows to anyone who knows the URL.
 *
 * Degrades to the cookie-scoped client when service-role credentials are absent
 * (a signed-in rep still gets their own company), and to null beyond that.
 */
export async function getPartnerCompanyBySlug(
  slug: string,
): Promise<Pick<PartnerCompany, "id" | "name" | "slug" | "active"> | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = isSupabaseAdminConfigured()
      ? createAdminClient()
      : await createClient();
    const { data, error } = await supabase
      .from("partner_companies")
      .select("id, name, slug, active")
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      console.error("getPartnerCompanyBySlug", error.message);
      return null;
    }
    if (!data || !data.active) return null;
    return data;
  } catch (error) {
    console.error("getPartnerCompanyBySlug", error);
    return null;
  }
}

/**
 * Require a signed-in rep of THIS company, or leave.
 *
 * Three distinct outcomes, deliberately kept apart:
 *   * no session          -> the portal's own login, carrying the page they
 *                            wanted so they land back on it;
 *   * a session belonging
 *     to another company
 *     or to no partner    -> their own home (`roleHome` handles admins,
 *                            portal clients and customers), never a page of
 *                            somebody else's jobs;
 *   * a rep of this company -> the context, so callers can scope their reads.
 *
 * This is the page-level gate. It is NOT the security boundary — RLS is (every
 * partner table is scoped by `partner_company_id()`), so a mistake here shows
 * the wrong chrome, not the wrong data.
 */
export async function requirePartnerSession(
  companySlug: string,
  subPath = "/",
): Promise<PartnerContext> {
  const requestHeaders = await headers();
  const onSubdomain = requestHeaders.get(PARTNER_VIA_HEADER) === "subdomain";
  const basePath = await partnerBasePath(companySlug);

  // A path on the main site is not reachable from a partner hostname — every
  // path there resolves back into this portal — so anything that sends a
  // non-partner AWAY has to become absolute first.
  const offPortal = (path: string) =>
    onSubdomain ? `${getSiteUrl()}${path}` : path;

  const user = await getUser();
  if (!user) {
    const target = partnerHref(basePath, subPath);
    redirect(`${partnerHref(basePath, "/login")}?redirect=${encodeURIComponent(target)}`);
  }

  const partner = await getPartnerContext();
  if (!partner || partner.companySlug !== companySlug) {
    // An admin who wandered in belongs on the admin list, not in a rep's view.
    if (isAdminEmail(user.email)) redirect(offPortal("/partner-jobs"));
    redirect(offPortal(await roleHome(user)));
  }
  return partner;
}
