#!/usr/bin/env node
/**
 * Route-level smoke checks for the public surface.
 *
 * Exists because the repo's automated gate (lint / tsc / test / build) never
 * issues a request: a deleted route, a dropped PUBLIC_PATHS entry or a broken
 * redirect all build perfectly green. Run it against a dev server or a
 * deployment:
 *
 *   npm run dev &            # or point BASE at a preview URL
 *   node scripts/smoke-routes.mjs
 *   BASE=https://tdstudiosny.com node scripts/smoke-routes.mjs
 *
 * Redirect rows assert the Location header too, so "redirects somewhere" and
 * "redirects to the right place" are different results.
 */

const BASE = process.env.BASE ?? "http://localhost:3000";

/** [path, expectedStatus, expectedLocationContains?] */
const CHECKS = [
  // Superseded routes — removed, kept alive as permanent redirects because
  // both were public URLs that may have been shared externally.
  ["/how-to-order", 308, "/mylar-printing"],
  ["/mylar-bag-printing", 308, "/mylar-printing"],
  ["/qr-generator/designs", 308, "/premadedesigns"],

  // The route they were superseded by, plus the static shop rewrite.
  ["/mylar-printing", 200],
  ["/mylar", 200],

  // Public galleries and tools must stay reachable without a session.
  ["/", 200],
  ["/portfolio", 200],
  ["/gso", 200],
  ["/premadedesigns", 200],
  ["/newpremades", 200],
  ["/taste-budz", 200],
  ["/designs", 200],
  ["/mafiaterpz", 200],
  ["/martyig", 200],
  ["/whiteash", 200],
  ["/qr-generator", 200],
  ["/custom-design-request", 200],
  ["/tools/cutline-generator", 200],
  ["/tools/mockup-generator", 200],
  ["/tools/8pc-mockup-generator", 200],
  ["/tools/bag-mockup-grid", 200],
  ["/login", 200],
  ["/sign-up", 200],

  // Signed out, the admin app must bounce to /login rather than render.
  ["/dashboard", 307, "/login"],
];

let failed = 0;

for (const [path, expectedStatus, expectedLocation] of CHECKS) {
  let status;
  let location = "";
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    status = res.status;
    location = res.headers.get("location") ?? "";
  } catch (error) {
    console.log(`FAIL  ${path}  (request failed: ${error.message})`);
    failed += 1;
    continue;
  }

  const statusOk = status === expectedStatus;
  const locationOk = !expectedLocation || location.includes(expectedLocation);

  if (statusOk && locationOk) {
    const suffix = expectedLocation ? ` -> ${location}` : "";
    console.log(`ok    ${path}  ${status}${suffix}`);
  } else {
    const want = expectedLocation
      ? `${expectedStatus} -> ${expectedLocation}`
      : `${expectedStatus}`;
    console.log(`FAIL  ${path}  got ${status} ${location}  want ${want}`);
    failed += 1;
  }
}

console.log(
  failed === 0
    ? `\nAll ${CHECKS.length} route checks passed.`
    : `\n${failed} of ${CHECKS.length} route checks FAILED.`,
);
process.exit(failed === 0 ? 0 : 1);
