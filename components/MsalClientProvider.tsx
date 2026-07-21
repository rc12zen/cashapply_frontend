"use client";
/**
 * components/MsalClientProvider.tsx
 * ====================================
 * Wraps the app in MSAL React's <MsalProvider> — only when real Azure AD
 * SSO is in play (APP_ENV !== "local"). In local dev this renders its
 * children directly with no MSAL instance at all, so the existing
 * X-Dev-User cookie flow (app/page.tsx, lib/api.ts) keeps working exactly
 * as before — nothing MSAL-related is even constructed in that mode.
 *
 * Also handles the redirect-flow plumbing MsalProvider needs
 * (handleRedirectPromise is called once, automatically, by MSAL React
 * itself on mount — this component only needs to construct+initialize
 * the PublicClientApplication instance and hand it to the provider).
 */
import { PublicClientApplication, EventType, type AuthenticationResult } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { useEffect, useMemo, useState } from "react";
import { IS_LOCAL_DEV, isAzureConfigured, msalConfig } from "@/lib/msalConfig";

export default function MsalClientProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(IS_LOCAL_DEV); // local dev never waits on MSAL

  const msalInstance = useMemo(() => {
    if (IS_LOCAL_DEV) return null;
    if (!isAzureConfigured()) {
      // eslint-disable-next-line no-console
      console.error(
        "[MSAL] NEXT_PUBLIC_AZURE_CLIENT_ID / NEXT_PUBLIC_AZURE_TENANT_ID are not set — " +
          "Azure AD sign-in cannot start. Set them in .env.local (see AZURE_SSO_SETUP.md)."
      );
      return null;
    }
    return new PublicClientApplication(msalConfig);
  }, []);

  useEffect(() => {
    if (IS_LOCAL_DEV || !msalInstance) return;
    let mounted = true;
    msalInstance.initialize().then(() => {
      // Pick an active account automatically after a redirect completes,
      // or if one is already cached from a previous session — every
      // acquireTokenSilent() call downstream (lib/api.ts) needs an active
      // account set, MSAL doesn't infer it on its own with multiple
      // accounts possible in the cache.
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
        msalInstance.setActiveAccount(accounts[0]);
      }
      msalInstance.addEventCallback((event) => {
        if (
          (event.eventType === EventType.LOGIN_SUCCESS || event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS) &&
          (event.payload as AuthenticationResult)?.account
        ) {
          msalInstance.setActiveAccount((event.payload as AuthenticationResult).account);
        }
      });
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [msalInstance]);

  if (IS_LOCAL_DEV) return <>{children}</>;

  if (!msalInstance) {
    // Azure isn't configured at all — surface this clearly instead of a
    // silent blank screen, since every API call will otherwise 401 with
    // no obvious cause.
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="max-w-sm text-center">
          <p className="text-sm font-bold text-red-600 uppercase tracking-wide mb-2">
            Sign-in unavailable
          </p>
          <p className="text-xs text-gray-500">
            Azure AD SSO isn&apos;t configured for this environment. Contact an administrator.
          </p>
        </div>
      </div>
    );
  }

  if (!ready) return null; // brief — avoids rendering pre-MSAL-init

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
