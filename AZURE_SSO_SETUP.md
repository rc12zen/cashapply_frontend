# Azure AD SSO — Frontend Setup

This covers wiring up the new files (`lib/msalConfig.ts`, `lib/msalToken.ts`,
`components/MsalClientProvider.tsx`, `app/auth/callback/page.tsx`, and the
updated `app/page.tsx` / `app/layout.tsx` / `lib/api.ts`) into a real
Next.js project. This upload didn't include `package.json` / `tsconfig.json`
/ `next.config.js`, so these steps assume you're merging these files into
your existing CashApply Next.js app.

## 1. Install dependencies

```bash
npm install @azure/msal-browser @azure/msal-react
```

## 2. Environment variables

Add to `.env.local` (and your UAT/prod environment config):

```bash
# "local" keeps the existing X-Dev-User dev-bypass login screen.
# "uat" or "prod" switches to the real Azure AD "Sign in with Microsoft" flow.
NEXT_PUBLIC_APP_ENV=local

# Only required when NEXT_PUBLIC_APP_ENV != local:
NEXT_PUBLIC_AZURE_CLIENT_ID=<this frontend's Azure App Registration client id>
NEXT_PUBLIC_AZURE_TENANT_ID=<your Azure AD tenant id>
NEXT_PUBLIC_AZURE_REDIRECT_URI=http://localhost:3000/auth/callback   # exact match to what's registered in Azure

# Optional — only if the backend's App Registration exposes a custom API
# scope (api://<backend-client-id>/access_as_user) rather than accepting
# the same v2 token audience as sign-in:
NEXT_PUBLIC_AZURE_API_SCOPE=api://<backend-client-id>/access_as_user
```

None of these are secrets — this is the standard "public client" /
authorization-code-with-PKCE flow MSAL uses; there's no client secret
anywhere in the frontend.

## 3. Azure App Registration checklist

- **Redirect URIs** (Platform: Single-page application) — add both:
  - `http://localhost:3000/auth/callback` (local testing against a real
    tenant, if you ever need it)
  - `https://<your-uat-domain>/auth/callback`
  - `https://<your-prod-domain>/auth/callback`
- **API permissions**: `openid`, `profile`, `email`, `User.Read` (Microsoft
  Graph, delegated) — matches `loginRequest.scopes` in `lib/msalConfig.ts`.
- The backend's `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` (see
  `db/settings.py`) must correspond to the same tenant, and either the same
  App Registration as this frontend, or one that accepts this frontend's
  token audience — confirm with whoever set up `auth/azure_validator.py`.

## 4. How the pieces fit together

- `components/MsalClientProvider.tsx` wraps the whole app in `<MsalProvider>`
  — but only when `NEXT_PUBLIC_APP_ENV !== "local"`. In local dev it's a
  no-op passthrough; no MSAL instance is even constructed.
- `app/page.tsx` shows the existing dev-bypass email form in local dev, or
  a "Sign in with Microsoft" button (calls `signInRedirect()` from
  `lib/msalToken.ts`, which does `loginRedirect()` — a full-page redirect,
  not a popup) otherwise.
- Azure redirects back to `/auth/callback` (`app/auth/callback/page.tsx`),
  which waits for MSAL to finish processing the redirect, confirms the
  backend recognizes the account via `getMe()` (the invite-only onboarding
  check in `auth/dependencies.py`), and either continues to `/home` or
  shows "not onboarded, contact an administrator".
- `lib/api.ts`'s axios interceptor attaches `Authorization: Bearer <token>`
  on every request when not in local dev, using `getAccessToken()` from
  `lib/msalToken.ts` — which tries `acquireTokenSilent()` first (no user
  interaction, the common path) and falls back to `acquireTokenRedirect()`
  only if the session genuinely needs re-authentication.
- `app/layout.tsx`'s sign-out button calls `signOutRedirect()` (MSAL's
  `logoutRedirect()`) instead of just clearing a cookie, in non-local mode.

## 6. Multi-role support

An Administrator can assign a user any number of roles at once (e.g. both
Analyst and Oracle Operator). This changed:

- `lib/permissions.ts`: `CurrentUser.roles` is now the full list (highest-
  priority first); `role` (singular) stays for back-compat display.
  `isViewerRoles(roles)` replaces `isViewer(role)` wherever the full list
  is available — a user counts as Viewer only if EVERY assigned role is
  Viewer (or they have none).
- `lib/useCurrentUser.ts` exposes both `role` and `roles`.
- `app/layout.tsx` shows one badge per assigned role in the header, and
  the Viewer route-guard now checks the full role list.
- `app/users/page.tsx` was split into smaller, focused files:
  - `components/users/RoleMultiSelect.tsx` — checkbox-list role picker
  - `components/users/OnboardUserModal.tsx` — the onboarding form
  - `components/users/UsersTable.tsx` — the list/table
  Assigning roles now sends the COMPLETE intended set (`role_names: string[]`)
  to the backend, which replaces (not merges) a user's roles.

## 7. RBAC page guards

Every page now calls `usePageGuard(permissionCode)` (`lib/usePageGuard.ts`)
and renders `<PageAccessDenied />` (`components/PageAccessDenied.tsx`)
instead of its real content if the signed-in user's role(s) don't include
that permission. This is a UI-only convenience — the backend enforces
every one of these for real — but it means a direct/bookmarked URL to a
page someone can't use shows a clean message instead of a screen full of
403s. Applied to: Overview, AI Usage, Activity Log, Config, Shortage
Review, Analysis History, Analysis History → Row Detail, Executive
Summary. Home (Viewer-only welcome) and Users (Administrator-only) already
had their own equivalent guards.

## 8. Large files split into focused pieces

Per-responsibility splits done in this pass:

- `app/analysis-history/row/[id]/page.tsx` (was ~1570 lines → ~1080):
  extracted `components/row-detail/types.ts` (interfaces + status/reason
  helpers), `SharedCardPieces.tsx` (DataRow/CardShell/CardHead),
  `RemittancePanel.tsx`, `OraclePayloadTable.tsx`, `RawResponseViewer.tsx`.
- `app/analysis-history/page.tsx`: extracted
  `components/analysis-history/FilePreviewPanel.tsx` (the statement/aging
  preview widget, including its internal `PreviewTable`).
- `app/users/page.tsx`: split as described in §6 above.

Every extracted file was verified with a full bundle-resolution check
(esbuild, `bundle: true`, real `@/...` alias resolution) — not just a
per-file syntax check — to confirm every new import actually resolves and
every export name matches.

## 9. What was intentionally NOT changed

Per the original request, JIT auto-provisioning
(`app/auth/jit_provision.py` on the backend) stays unwired — an unknown
Azure identity still gets a clear "not onboarded" message, not an
automatically-created account. That's a separate, already-discussed
follow-up.

