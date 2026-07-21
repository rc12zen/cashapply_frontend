"use client";
/**
 * lib/msalToken.ts
 * ==================
 * Single place that knows how to get a fresh Azure AD access token for
 * the backend API, using whichever MSAL instance MsalClientProvider
 * constructed. Used by lib/api.ts's request interceptor so every outgoing
 * call carries a valid `Authorization: Bearer <token>` header.
 *
 * acquireTokenSilent() first (uses MSAL's cached/refreshed token, no user
 * interaction) — falling back to acquireTokenRedirect() only when silent
 * acquisition fails (e.g. the refresh token itself expired or needs a
 * fresh interactive consent). This matches the "silent refresh so
 * sessions don't die mid-use" requirement: a redirect is a last resort,
 * not the common path.
 */
import {
  InteractionRequiredAuthError,
  PublicClientApplication,
} from "@azure/msal-browser";
import { apiTokenRequest, IS_LOCAL_DEV, isAzureConfigured, msalConfig } from "@/lib/msalConfig";

// Lazily constructed, shared with MsalClientProvider's lifetime via module
// scope — MSAL explicitly supports having a single PublicClientApplication
// per app; this mirrors the same config so acquireTokenSilent() sees the
// same cache MsalClientProvider populated.
let _instance: PublicClientApplication | null = null;
let _initPromise: Promise<PublicClientApplication> | null = null;

function getInstance(): Promise<PublicClientApplication> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (!_instance) {
      _instance = new PublicClientApplication(msalConfig);
      await _instance.initialize();
    }
    return _instance;
  })();
  return _initPromise;
}

/**
 * Returns a valid access token, or null if:
 *   - running in local dev (no MSAL at all — caller should use the
 *     X-Dev-User cookie path instead), or
 *   - Azure isn't configured, or
 *   - no account is signed in yet (caller should redirect to sign-in).
 *
 * On a token error that needs user interaction, this KICKS OFF
 * acquireTokenRedirect() (which navigates away) and returns null — the
 * caller's in-flight request will simply not complete, which is correct:
 * the page is about to navigate to Azure's sign-in page anyway.
 */
export async function getAccessToken(): Promise<string | null> {
  if (IS_LOCAL_DEV || !isAzureConfigured()) return null;

  const msal = await getInstance();
  const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;
  if (!account) return null;

  try {
    const result = await msal.acquireTokenSilent({ ...apiTokenRequest, account });
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      // Refresh token expired / needs fresh consent — fall back to an
      // interactive redirect. This navigates the page away; the caller
      // gets null back and the original request is abandoned (correctly
      // — the user is about to re-authenticate).
      await msal.acquireTokenRedirect({ ...apiTokenRequest, account });
      return null;
    }
    // eslint-disable-next-line no-console
    console.error("[MSAL] acquireTokenSilent failed:", err);
    return null;
  }
}

/** Starts the interactive Azure AD sign-in redirect. Called from the login
 * screen's "Sign in with Microsoft" button. */
export async function signInRedirect(): Promise<void> {
  const msal = await getInstance();
  const { loginRequest } = await import("@/lib/msalConfig");
  await msal.loginRedirect(loginRequest);
}

/** Signs out of MSAL (clears its cache) and returns to the login screen. */
export async function signOutRedirect(): Promise<void> {
  const msal = await getInstance();
  const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;
  await msal.logoutRedirect({ account, postLogoutRedirectUri: "/" });
}
