/**
 * lib/permissions.ts
 * =====================
 * Frontend mirror of the backend's 5-role RBAC model (see
 * backend scripts/seed_rbac.py — that file is the source of truth; this
 * one must be kept in sync with it). The backend enforces every one of
 * these checks for real (require_permission(...) on each route) — this
 * module only controls what the UI SHOWS, so a hidden button never
 * implies the underlying call is actually blocked, and vice versa.
 *
 * `/api/auth/me` returns { role, permissions } resolved server-side from
 * the signed-in user's role — never trust a client-side guess at role
 * instead of this.
 */

export type Role =
  | "Administrator"
  | "Analyst"
  | "Oracle Operator"
  | "Auditor"
  | "Viewer"
  | null;

export interface CurrentUser {
  id?: number;
  email?: string;
  display_name?: string | null;
  // A user can hold MULTIPLE roles at once (an Administrator assigns them
  // via the Users page) -- `roles` is the complete list, highest-priority
  // first (see backend auth/role_priority.py). `role` (singular) is kept
  // for backward compatibility and is just roles[0] -- permission checks
  // should always use `permissions` (the union across every assigned
  // role), never a single role name.
  roles: Role[];
  role: Role;
  permissions: string[];
}

/** True if `permissions` grants `code` — the wildcard "*" (Administrator)
 * always satisfies every check, same rule as the backend's
 * auth/permissions.py::user_has_permission(). */
export function hasPermission(permissions: string[] | undefined | null, code: string): boolean {
  if (!permissions) return false;
  return permissions.includes("*") || permissions.includes(code);
}

/** Viewer is the default role a brand-new SSO/JIT user lands on. It holds
 * NO permissions — the UI keeps them on the single Welcome page until an
 * Administrator assigns a real role (see db/settings.py's
 * DEFAULT_NEW_USER_ROLE / auth/jit_provision.py). Single-role form, kept
 * for callers that only have the back-compat `role` field. */
export function isViewer(role: Role): boolean {
  return role === "Viewer" || role === null || role === undefined;
}

/** Multi-role form: a user is a Viewer only if EVERY assigned role is
 * Viewer (or they have no roles at all) — holding Viewer plus any other
 * role means the other role's permissions apply. Prefer this over
 * isViewer(role) wherever the full `roles` list is available. */
export function isViewerRoles(roles: Role[] | undefined | null): boolean {
  if (!roles || roles.length === 0) return true;
  return roles.every((r) => r === "Viewer" || r === null || r === undefined);
}

export function isAdministrator(permissions: string[] | undefined | null): boolean {
  return hasPermission(permissions, "*");
}

/** Convenience flags for the common gates used across the app. Compute
 * once from a /me response and pass down, rather than re-deriving the
 * same permission-code strings in every component. */
export function derivePermissionFlags(permissions: string[] | undefined | null) {
  return {
    canViewData: hasPermission(permissions, "run:view"),
    canMonitorRuns: hasPermission(permissions, "run:monitor"),
    canRunAnalysis: hasPermission(permissions, "run:start"),
    canUploadStatement: hasPermission(permissions, "statement:upload"),
    canViewConfig: hasPermission(permissions, "config:view"),
    canAuthorConfig: hasPermission(permissions, "config:author"),
    canMapInvoices: hasPermission(permissions, "hitl:map"),
    canReject: hasPermission(permissions, "hitl:reject"),
    canApprove: hasPermission(permissions, "oracle:post"),
    canDownloadFiles: hasPermission(permissions, "file:download"),
    canViewActivityLog: hasPermission(permissions, "activity_log:view"),
    canManageUsers: hasPermission(permissions, "user:manage"),
    // config:manage is now Admin-only: aging upload/select/refresh/remove
    // and deleting a bank-format recipe. General config authoring (save
    // recipe, edit abbreviations, edit BU mapping, Config Builder) is
    // canAuthorConfig.
    canManageConfig: hasPermission(permissions, "config:manage"),
    isAdmin: isAdministrator(permissions),
  };
}

export type PermissionFlags = ReturnType<typeof derivePermissionFlags>;

/** Routes a Viewer is allowed to sit on. Anything else should bounce them
 * to /welcome -- the dedicated holding page for an account with no role
 * assigned yet (see app/welcome/page.tsx). Home is a working dashboard
 * for people who already have access; Viewer never lands there. */
export const VIEWER_ALLOWED_PATHS = ["/", "/welcome"];

export function isViewerAllowedPath(pathname: string): boolean {
  return VIEWER_ALLOWED_PATHS.includes(pathname);
}