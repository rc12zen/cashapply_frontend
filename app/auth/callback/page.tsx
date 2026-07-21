"use client";
/**
 * app/auth/callback/page.tsx
 * =============================
 * Azure AD redirects back here after loginRedirect() (see
 * lib/msalConfig.ts's redirectUri / lib/msalToken.ts's signInRedirect()).
 * MsalProvider (components/MsalClientProvider.tsx) already calls
 * handleRedirectPromise() automatically on mount — this page's only job
 * is to wait briefly for that to settle, then move on to /home (success)
 * or back to / with an error (failure), same "not onboarded, contact an
 * administrator" copy pattern as the local dev-bypass login screen.
 */
import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getMe } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { instance, inProgress, accounts } = useMsal();
  const [error, setError] = useState("");

  useEffect(() => {
    if (inProgress !== "none") return; // still processing the redirect

    if (accounts.length === 0) {
      setError("Sign-in didn't complete. Please try again.");
      return;
    }

    instance.setActiveAccount(accounts[0]);

    // Confirm the backend actually recognizes this identity (invite-only
    // onboarding — see auth/dependencies.py) before sending the user
    // further into the app.
    getMe()
      .then(() => router.replace("/home"))
      .catch((e) => {
        setError(
          getErrorMessage(
            e,
            "This account has not been onboarded. Contact an administrator to get access."
          )
        );
      });
  }, [inProgress, accounts, instance, router]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white px-6">
      <div className="max-w-sm w-full text-center">
        {error ? (
          <div className="bg-red-50 border-l-2 border-red-600 p-4 text-xs flex items-start gap-2.5 text-gray-900 rounded-r-lg text-left">
            <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-1">Sign-in failed</p>
              <p className="font-medium">{error}</p>
              <button
                onClick={() => router.replace("/")}
                className="mt-3 text-[11px] font-bold uppercase tracking-wider text-[#222222] underline"
              >
                Back to sign in
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="h-8 w-8 mx-auto mb-4 rounded-full border-2 border-gray-200 border-t-[#222222] animate-spin" />
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Finishing sign-in...
            </p>
          </>
        )}
      </div>
    </div>
  );
}
