/**
 * lib/msalConfig.ts
 * ===================
 * MSAL (Microsoft Authentication Library) configuration for real Azure AD
 * SSO — see auth/azure_validator.py on the backend, which validates the
 * access token this config acquires.
 *
 * Only active when NEXT_PUBLIC_APP_ENV !== "local" (see app/page.tsx and
 * lib/api.ts) — local dev keeps using the existing X-Dev-User cookie
 * bypass, untouched.
 *
 * Required env vars (client-exposed, so NEXT_PUBLIC_-prefixed):
 *   NEXT_PUBLIC_APP_ENV               "local" | "uat" | "prod"
 *   NEXT_PUBLIC_AZURE_CLIENT_ID        this frontend's Azure App Registration client id
 *   NEXT_PUBLIC_AZURE_TENANT_ID        the Azure AD tenant id
 *   NEXT_PUBLIC_AZURE_REDIRECT_URI     must exactly match a Redirect URI
 *                                      registered on the App Registration,
 *                                      e.g. http://localhost:3000/auth/callback
 *                                      for local, or the UAT/prod domain's
 *                                      equivalent.
 *
 * None of these are secrets — the client id/tenant id are public by
 * design in the authorization-code-with-PKCE flow MSAL uses here; there is
 * no client secret anywhere in the frontend.
 */
import type { Configuration } from "@azure/msal-browser";
import { LogLevel } from "@azure/msal-browser";

export const APP_ENV: "local" | "uat" | "prod" =
  (process.env.NEXT_PUBLIC_APP_ENV as "local" | "uat" | "prod") || "local";

export const IS_LOCAL_DEV = APP_ENV === "local";

const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || "";
const tenantId = process.env.NEXT_PUBLIC_AZURE_TENANT_ID || "";
const redirectUri =
  process.env.NEXT_PUBLIC_AZURE_REDIRECT_URI ||
  (typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "/auth/callback");

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId || "common"}`,
    redirectUri,
    postLogoutRedirectUri: "/",
    // navigateToLoginRequestUrl intentionally omitted: not part of
    // BrowserAuthOptions' type in msal-browser v5 (moved internal to the
    // redirect flow -- confirmed against the installed package's own
    // source, where it's read as `options?.navigateToLoginRequestUrl ??
    // true`). It already defaults to true, which is what we want, so
    // omitting it here changes no behavior.
  },
  cache: {
    // In-memory + sessionStorage (MSAL's own cache), NOT localStorage —
    // matches "store nothing manually" in the requirements; MSAL owns the
    // token cache lifecycle entirely. Cleared when the browser tab closes,
    // which is the right tradeoff for a shared/kiosk-style workstation.
    //
    // storeAuthStateInCookie intentionally omitted: not part of
    // CacheOptions' type in msal-browser v5 (confirmed against the
    // installed package -- that type now only has cacheLocation and
    // cacheRetentionDays). It was an opt-in helper for some older
    // browsers that aggressively cleared sessionStorage; cacheLocation
    // above already covers our actual storage requirement.
    cacheLocation: "sessionStorage",
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) {
          // eslint-disable-next-line no-console
          console.error("[MSAL]", message);
        }
      },
      logLevel: IS_LOCAL_DEV ? LogLevel.Warning : LogLevel.Error,
    },
  },
};

/** Scopes requested at sign-in. `User.Read` is Microsoft Graph's basic
 * profile read — not actually called by this app, but commonly requested
 * so the same token/consent can be reused if a future feature needs it;
 * harmless to include and avoids a second consent prompt later. */
export const loginRequest = {
  scopes: ["openid", "profile", "email", "User.Read"],
};

/** The scope this app's OWN backend API token is acquired for. If the
 * backend's Azure App Registration exposes a custom API scope (e.g.
 * `api://<backend-client-id>/access_as_user`), set
 * NEXT_PUBLIC_AZURE_API_SCOPE to that value and it's used instead —
 * otherwise falls back to the same basic scopes as sign-in (fine for a
 * v2 token where AZURE_CLIENT_ID on the backend already matches this
 * frontend's audience). */
export const apiTokenRequest = {
  scopes: process.env.NEXT_PUBLIC_AZURE_API_SCOPE
    ? [process.env.NEXT_PUBLIC_AZURE_API_SCOPE]
    : loginRequest.scopes,
};

export function isAzureConfigured(): boolean {
  return Boolean(clientId && tenantId);
}