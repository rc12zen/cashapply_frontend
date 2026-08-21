"use client";
/**
 * lib/nonceContext.tsx
 * =====================
 * Content-Security-Policy's nonce (see middleware.ts) needs to reach any
 * Client Component that renders its OWN inline <style> tag for genuinely
 * dynamic values CSP can't otherwise allow (nonces work for <style>
 * elements, just not for the style="" HTML attribute -- see middleware.ts's
 * docstring for the full reasoning on why style-src is being fully
 * hardened this way now).
 *
 * `headers()` (how the nonce is actually read) is a Server Component-only
 * API, so it can't be called directly inside "use client" components like
 * this app's AppShell. This Context is the bridge: a Server Component
 * reads the nonce once (see app/layout.tsx) and provides it here; any
 * Client Component anywhere in the tree can then call useNonce() instead
 * of having the nonce threaded through every intermediate component's
 * props.
 */
import { createContext, useContext } from "react";

const NonceContext = createContext<string>("");

export function NonceProvider({
  nonce,
  children,
}: {
  nonce: string;
  children: React.ReactNode;
}) {
  return <NonceContext.Provider value={nonce}>{children}</NonceContext.Provider>;
}

export function useNonce(): string {
  return useContext(NonceContext);
}
