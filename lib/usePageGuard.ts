"use client";
/**
 * lib/usePageGuard.ts
 * ======================
 * Frontend page-level RBAC guard. The backend enforces every permission
 * for real (require_permission(...) on each route — see auth/permissions.py)
 * — this hook is the UI-side counterpart: it stops a page that lacks the
 * right permission from ever firing its data-fetching effects and renders
 * a clean "you don't have access" state instead of a page full of 403s.
 *
 * Nav hiding (app/layout.tsx) already keeps most people from clicking into
 * a page they can't use, but doesn't stop a direct/bookmarked URL — this
 * closes that gap consistently across every page, the same way
 * app/users/page.tsx already guarded itself before this hook existed.
 *
 * Usage:
 *   const { allowed, checking } = usePageGuard("run:view");
 *   if (checking) return null;       // avoid a flash of content pre-check
 *   if (!allowed) return <PageAccessDenied />;
 *   ... rest of the page ...
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { hasPermission, type PermissionFlags } from "@/lib/permissions";

export function usePageGuard(permissionCode: keyof PermissionFlags | string) {
  const router = useRouter();
  const { loading, permissions, isViewer } = useCurrentUser();
  const [redirected, setRedirected] = useState(false);

  const allowed = !loading && hasPermission(permissions, permissionCode as string);

  useEffect(() => {
    if (loading || allowed || redirected) return;
    // Viewer gets bounced to /home by the layout-level guard already; for
    // every other under-permissioned role, staying on the page and
    // showing an explicit "not allowed" message (see PageAccessDenied)
    // is clearer than a silent redirect.
    if (isViewer) {
      setRedirected(true);
      router.replace("/home");
    }
  }, [loading, allowed, isViewer, redirected, router]);

  return { allowed, checking: loading };
}
