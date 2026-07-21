"use client";
/**
 * app/page.tsx — Login screen
 * ==============================
 * Branches on APP_ENV (NEXT_PUBLIC_APP_ENV):
 *   - "local": the existing dev-bypass form. Typing an email sets the
 *     `login_user_email_stub` cookie, which lib/api.ts sends as X-Dev-User
 *     on every request. Only honored by the backend when APP_ENV=local
 *     (see app/auth/bypass.py) — never reachable in UAT/prod.
 *   - "uat" / "prod": a real "Sign in with Microsoft" button that starts
 *     MSAL's loginRedirect() flow (see lib/msalToken.ts / lib/msalConfig.ts).
 *     No password field either way — this app never collects one; identity
 *     comes from Azure AD (or, in local dev, is asserted by the seeded
 *     dev-bypass user list).
 *
 * Split layout: logo.png is a WHITE wordmark, so it needs a dark surface
 * to actually be visible — it lives in the left dark panel now, not on
 * the white card. The Z-logo gif moved off the hero spot entirely (it's
 * now a small decorative badge in the dark panel's corner) since the
 * brand wordmark, not the animated badge, is the primary mark here.
 */
import { AlertTriangle, ArrowRight, Mail } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { getMe } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import { IS_LOCAL_DEV, isAzureConfigured } from "@/lib/msalConfig";
import { signInRedirect } from "@/lib/msalToken";

function AzureSignInScreen() {
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleSignIn = async () => {
		setError("");
		setIsLoading(true);
		try {
			await signInRedirect(); // navigates away — no further code runs here on success
		} catch (err) {
			setIsLoading(false);
			setError("Couldn't start sign-in. Please try again.");
		}
	};

	return (
		<div className="w-full max-w-sm">
			<div className="mb-6">
				<h2 className="text-lg font-black text-[#222222]">Sign in</h2>
				<p className="text-xs text-gray-500 mt-1">Use your Zensar Microsoft identity to continue.</p>
			</div>

			{!isAzureConfigured() && (
				<div className="bg-amber-50 border-l-2 border-amber-500 p-3 text-xs flex items-center gap-2.5 text-gray-900 rounded-r-lg mb-4">
					<AlertTriangle size={14} className="text-amber-600 shrink-0" />
					<span className="font-medium">
						Azure AD isn&apos;t configured for this environment yet. Contact an administrator.
					</span>
				</div>
			)}

			{error && (
				<div className="bg-red-50 border-l-2 border-red-600 p-3 text-xs flex items-center gap-2.5 text-gray-900 rounded-r-lg mb-4">
					<AlertTriangle size={14} className="text-red-600 shrink-0" />
					<span className="font-medium">{error}</span>
				</div>
			)}

			<button
				type="button"
				onClick={handleSignIn}
				disabled={isLoading || !isAzureConfigured()}
				className="w-full flex items-center justify-center gap-2 bg-[#222222] hover:bg-black text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-md hover:shadow-lg transition-all group disabled:opacity-50"
			>
				{/* Microsoft's 4-square logo mark, inline so no extra asset is needed */}
				<svg width="14" height="14" viewBox="0 0 21 21" aria-hidden="true">
					<rect x="1" y="1" width="9" height="9" fill="#f25022" />
					<rect x="11" y="1" width="9" height="9" fill="#7fba00" />
					<rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
					<rect x="11" y="11" width="9" height="9" fill="#ffb900" />
				</svg>
				{isLoading ? "Redirecting..." : "Sign in with Microsoft"}
				{!isLoading && (
					<ArrowRight size={12} className="opacity-70 group-hover:translate-x-0.5 transition-transform" />
				)}
			</button>

			<div className="pt-6 mt-6 border-t border-gray-100 text-center">
				<p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
					&copy; Zensar Technologies &bull; For Internal Use Only &bull; PoC v1.0
				</p>
			</div>
		</div>
	);
}

function DevBypassLoginForm() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError("");

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			setError("Please enter a valid email address.");
			return;
		}

		setIsLoading(true);

		try {
			document.cookie = `login_user_email_stub=${encodeURIComponent(email)}; path=/; max-age=86400; SameSite=Lax`;
			await getMe();
			router.refresh();
			router.push("/home");
		} catch (err: any) {
			// Clear the cookie we just set — it's not a valid dev-bypass
			// identity, so don't leave it sitting there for the next request.
			document.cookie = "login_user_email_stub=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
			const message = getErrorMessage(err, "");
			setError(
				message ||
					"That email isn't recognized. For local/test access it must be a seeded dev-bypass user (see README_SETUP_AND_TESTING.md)."
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="w-full max-w-sm">
			<div className="mb-6">
				<h2 className="text-lg font-black text-[#222222]">Sign in</h2>
				{/* <p className="text-xs text-gray-500 mt-1">Use your Zensar identity to continue.</p>
				<p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mt-2">
					Local dev bypass — not used in UAT/Prod
				</p> */}
			</div>

			{error && (
				<div className="bg-red-50 border-l-2 border-red-600 p-3 text-xs flex items-center gap-2.5 text-gray-900 rounded-r-lg mb-4">
					<AlertTriangle size={14} className="text-red-600 shrink-0" />
					<span className="font-medium">{error}</span>
				</div>
			)}

			<form onSubmit={handleSubmit} className="space-y-4">
				<div className="space-y-1">
					<label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block">
						Email
					</label>
					<div className="relative">
						<span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
							<Mail size={14} />
						</span>
						<input
							type="text"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="identity@zensar.com"
							disabled={isLoading}
							className="w-full bg-gray-50 border border-gray-200 focus:border-[#222222] focus:bg-white rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors disabled:opacity-60"
						/>
					</div>
				</div>

				<button
					type="submit"
					disabled={isLoading}
					className="w-full flex items-center justify-center gap-2 bg-[#222222] hover:bg-black text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-md hover:shadow-lg transition-all group disabled:opacity-50"
				>
					{isLoading ? "Authenticating..." : "Sign In"}
					{!isLoading && (
						<ArrowRight
							size={12}
							className="opacity-70 group-hover:translate-x-0.5 transition-transform"
						/>
					)}
				</button>
			</form>

			<div className="pt-6 mt-6 border-t border-gray-100 text-center">
				<p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
					&copy; Zensar Technologies &bull; For Internal Use Only &bull; PoC v1.0
				</p>
			</div>
		</div>
	);
}

export default function LoginScreen() {
	return (
		<div className="min-h-screen w-full flex bg-white">
			{/* LEFT — dark brand panel. Hidden on small screens (the form is
			     what matters there); the wordmark needs this dark surface to
			     be visible at all, since logo.png is a white asset. */}
			<div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#0B0C0E] items-center justify-center">
				<div className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-emerald-500/20 blur-3xl animate-blob pointer-events-none" />
				<div className="absolute -bottom-40 -right-16 w-[420px] h-[420px] rounded-full bg-teal-400/15 blur-3xl animate-blob animate-blob-delay-1 pointer-events-none" />
				<svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.07]" preserveAspectRatio="none" viewBox="0 0 1000 1000">
					<polyline
						points="0,820 120,760 240,800 360,620 480,680 600,480 720,540 840,300 960,360 1000,220"
						fill="none" stroke="#ffffff" strokeWidth="4"
					/>
				</svg>

				<div className="relative text-center px-16">
					<Image
						src="/logo.png"
						alt="Zensar"
						width={225}
						height={125}
						className="object-contain h-16 w-auto mx-auto mb-8"
					/>
					<h1 className="text-3xl font-black tracking-tight text-white uppercase">
						Cash Apply
					</h1>
					<p className="text-sm text-white/60 font-medium max-w-[320px] mx-auto mt-3 leading-relaxed">
						From bank statement to Fusion, reconciled in seconds.
					</p>
				</div>

				{/* Z-logo gif — moved here as a small ambient badge, not the
				     primary hero mark. */}
				<div className="absolute bottom-8 left-8 h-11 w-11 rounded-full overflow-hidden shadow-lg ring-2 ring-white/10">
					{/* eslint-disable-next-line @next/next/no-img-element -- plain <img>
					     on purpose: next/image would re-encode/optimize the GIF and can
					     strip its animation */}
					<img src="/Z-logo.gif" alt="Zensar" className="h-full w-full object-cover" />
				</div>
			</div>

			{/* RIGHT — sign-in form */}
			<div className="w-full lg:w-1/2 flex items-center justify-center px-4 py-12">
				<div className="w-full max-w-sm">
					<div className="mb-8 lg:hidden text-center">
						<Image
							src="/logo.png"
							alt="Zensar"
							width={160}
							height={91}
							className="object-contain h-10 w-auto mx-auto mb-4 invert"
						/>
						<h1 className="text-xl font-black tracking-tight text-[#222222] uppercase">Cash Apply</h1>
					</div>

					{IS_LOCAL_DEV ? <DevBypassLoginForm /> : <AzureSignInScreen />}
				</div>
			</div>
		</div>
	);
}
