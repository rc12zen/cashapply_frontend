"use client";
/**
 * lib/useCurrentUser.ts
 * ========================
 * Shared hook for "who is signed in and what can they do" — wraps
 * GET /api/auth/me (see bff/auth_routes.py) and derives the same
 * permission flags app/layout.tsx uses for nav gating, so any page or
 * component that needs to hide/disable an action (Approve, Reject, Map
 * Invoice, etc.) can do it with one line instead of re-fetching /me and
 * re-deriving flags itself.
 *
 * This is a UI-only convenience — the backend enforces every one of these
 * permissions for real via require_permission(...) on each route (see
 * auth/permissions.py). Hiding a button here is about not showing an
 * action a role can't complete, not the actual security boundary.
 */
import { useEffect, useState } from "react";
import { getMe } from "@/lib/api";
import { derivePermissionFlags, isViewerRoles, type PermissionFlags, type Role } from "@/lib/permissions";

export interface CurrentUserState {
  loading: boolean;
  role: Role;
  roles: Role[];
  permissions: string[];
  flags: PermissionFlags;
  isViewer: boolean;
}

export function useCurrentUser(): CurrentUserState {
  const [role, setRole] = useState<Role>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getMe()
      .then((res) => {
        if (!mounted) return;
        setRole(res.data?.role ?? null);
        setRoles(res.data?.roles ?? []);
        setPermissions(res.data?.permissions ?? []);
      })
      .catch(() => {
        if (!mounted) return;
        setRole(null);
        setRoles([]);
        setPermissions([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return {
    loading,
    role,
    roles,
    permissions,
    flags: derivePermissionFlags(permissions),
    isViewer: isViewerRoles(roles),
  };
}
