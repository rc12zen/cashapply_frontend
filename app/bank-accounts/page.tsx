/**
 * app/bank-accounts/page.tsx -- Server Component wrapper
 * =====================================================================
 * Split out specifically so this route can be forced into per-request
 * dynamic rendering (`export const dynamic = "force-dynamic"`), which
 * ONLY takes effect in a Server Component -- Next.js silently ignores it
 * in a "use client" file (confirmed by testing: the build kept marking a
 * client-component page as statically prerendered even with this export
 * present).
 *
 * Why this route needs to be dynamic at all: VAPT requires
 * 'strict-dynamic' in the CSP script-src directive. strict-dynamic only
 * propagates trust to scripts a trusted script creates via JS -- it does
 * NOT cover the static <script src="..."> tags Next.js bakes directly
 * into a STATICALLY PRE-RENDERED page's HTML (confirmed by testing: every
 * one of those tags got blocked when strict-dynamic was added to a static
 * page, and 'self' stops applying once strict-dynamic is present, so
 * there was nothing left to permit them). A dynamically-rendered page
 * does not have this problem (confirmed: zero violations on the one route
 * that was already dynamic before this refactor).
 *
 * All the actual page logic lives in ./PageClient.tsx, unchanged.
 */
export const dynamic = "force-dynamic";

import AccountsAndOUsPage from "./PageClient";

export default function Page() {
  return <AccountsAndOUsPage />;
}
