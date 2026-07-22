"use client";
import { PublicClientApplication, EventType, type AuthenticationResult } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { useEffect, useMemo, useState } from "react";
import { IS_LOCAL_DEV, isAzureConfigured, msalConfig } from "@/lib/msalConfig";

export default function MsalClientProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(IS_LOCAL_DEV);

  const msalInstance = useMemo(() => {
    if (typeof window === "undefined") return null; // never construct during SSR
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

  // Still on the server (or first paint before hydration) — render nothing
  // rather than a misleading error screen; the real check happens once
  // we're actually in the browser.
  if (typeof window === "undefined") return null;

  if (!msalInstance) {
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

  if (!ready) return null;

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}