import "./globals.css";
import { headers } from "next/headers";
import { NonceProvider } from "@/lib/nonceContext";
import AppShellRoot from "./AppShellRoot";

/**
 * app/layout.tsx -- root layout
 * ==============================
 * Split into two files specifically to support the nonce-based CSP
 * hardening of style-src (see middleware.ts):
 *
 *   - THIS file is a Server Component (no "use client") -- the only kind
 *     of component allowed to call headers(), which is how the
 *     per-request nonce set in middleware.ts is actually read here.
 *   - AppShellRoot.tsx holds everything that used to live directly in
 *     this file (the sidebar, top bar, route-guard logic, etc.) -- all of
 *     it genuinely needs to be a Client Component (useState/useEffect/
 *     usePathname), so it couldn't stay in a file that also needs to call
 *     headers().
 *
 * The nonce is handed to NonceProvider so any Client Component anywhere
 * in the tree can retrieve it via useNonce() without prop-drilling -- see
 * components/users/RoleMultiSelect.tsx and
 * components/analysis-history/FilePreviewPanel.tsx, the two places that
 * currently need it (both have genuinely dynamic, continuous values --
 * a dropdown's on-screen position and a table's width based on an
 * uploaded file's actual column count -- that can't become static
 * Tailwind classes or be covered by 'unsafe-inline' any other way).
 */
export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const nonce = (await headers()).get("x-nonce") ?? "";

	return (
		<html lang="en" className="h-full">
			<body className="antialiased text-[#222222] bg-[#F1FAF8] h-full overflow-hidden">
				<NonceProvider nonce={nonce}>
					<AppShellRoot>{children}</AppShellRoot>
				</NonceProvider>
			</body>
		</html>
	);
}
