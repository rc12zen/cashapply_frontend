import { NextRequest, NextResponse } from "next/server";

/**
 * middleware.ts — universal nonce-based CSP (script-src, with strict-dynamic)
 * =====================================================================
 * VAPT requires 'strict-dynamic' specifically, not just a nonce/hash on
 * their own. That's what forced a real refactor: strict-dynamic only
 * propagates trust to scripts a trusted script creates via JS -- it does
 * NOT cover the static <script src="..."> tags Next.js bakes directly
 * into a STATICALLY PRE-RENDERED page's HTML. Confirmed by testing:
 * adding strict-dynamic to a static page blocked every one of its script
 * tags (strict-dynamic also disables 'self', so nothing was left to
 * permit them); the SAME header on an already-dynamic route produced zero
 * violations.
 *
 * The fix: every page in this app is now forced into per-request dynamic
 * rendering (`export const dynamic = "force-dynamic"` in each page.tsx --
 * see the Server/Client split done for this). With no statically
 * pre-rendered pages left, there's no caching left for a per-request
 * nonce to conflict with (the ORIGINAL reason nonces broke this app
 * before this refactor), so this can now be one universal mechanism
 * covering the whole app instead of the hash-based/nonce-based hybrid
 * split used temporarily during investigation.
 *
 * The contract (Next.js's own documented pattern, App Router 13.4+):
 *   1. Generate a random nonce per request.
 *   2. Put it on the REQUEST header `x-nonce` before calling
 *      NextResponse.next() -- lets Next.js's own internal scripts (the
 *      hydration/RSC bootstrap it injects automatically) discover the
 *      nonce and apply it to themselves. Confirmed via a full codebase
 *      grep: no manually authored inline <script> tags exist anywhere; if
 *      one is ever added, it needs `nonce={headers().get('x-nonce')}`
 *      read in a Server Component -- see Next's CSP docs.
 *   3. Set the SAME nonce inside the Content-Security-Policy response
 *      header, paired with 'strict-dynamic' -- which VAPT explicitly
 *      requires, and which now works correctly because every page is
 *      dynamically rendered (see above).
 *
 * style-src is now FULLY hardened -- no 'unsafe-inline' at all. Every
 * inline style={{...}} usage that used to exist in this codebase has been
 * dealt with:
 *   - Purely static values -> converted to Tailwind classes (compiled
 *     into the build's stylesheet, governed by 'self', not the style=""
 *     attribute at all).
 *   - "Dynamic-looking" values that actually came from a small, fixed,
 *     hardcoded set (role colors, metric colors, chart accent colors,
 *     never real user data) -> also converted to Tailwind classes, via
 *     lib/accentColor.ts.
 *   - The two genuinely dynamic, unbounded-value cases (a dropdown's
 *     on-screen position in components/users/RoleMultiSelect.tsx; a
 *     file-preview table's width based on an uploaded file's actual
 *     column count in components/analysis-history/FilePreviewPanel.tsx)
 *     -> each renders its own nonce'd <style> tag scoped to a unique id,
 *     using the SAME nonce this middleware sets, via lib/nonceContext.tsx
 *     (see app/layout.tsx for how the nonce reaches Client Components at
 *     all -- it's a Server Component specifically so it can read
 *     headers()).
 * A dead, unused component (MetricCard.tsx) that also had an inline style
 * was simply deleted rather than converted.
 *
 * nginx's /api/ and /api/auth/ locations set their OWN, more restrictive
 * CSP (`default-src 'none'`) directly -- this middleware's matcher
 * excludes those paths, so there's no duplicate-header risk there.
 */

const CSP_REPORT_PATH = "/api/csp-report";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' data: https:;
    font-src 'self' data:;
    connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com;
    frame-src 'self' https://login.microsoftonline.com;
    frame-ancestors 'none';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    upgrade-insecure-requests;
    block-all-mixed-content;
    report-uri ${CSP_REPORT_PATH};
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  // Every page/navigation gets a nonce now -- excludes only Next's own
  // static asset paths (never HTML documents, a nonce means nothing for
  // them) and the API prefix (nginx sets its own CSP there directly).
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|Z-logo.gif|logo.png).*)",
  ],
};
