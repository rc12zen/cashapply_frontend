"use client";
import {
	AlertTriangle,
	ArrowRight,
	Lock,
	Mail,
	ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { getMe } from "@/lib/api";

export default function LoginScreen() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
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
			// NOTE: this cookie is what lib/api.ts sends as the X-Dev-User
			// header on every request — it's the backend's local/test SSO
			// bypass (see design doc §1.3), not just a UI decoration. The
			// email must be one of DEV_SSO_BYPASS_EMAILS AND already exist
			// as a seeded user (scripts/seed_rbac.py --dev-user ...) or
			// every API call will 401. In production this whole screen is
			// replaced by MSAL's Azure Entra ID redirect flow — no password
			// field, no local cookie, no bypass path (see design doc §1.1).
			//
			// PATCH: previously this just set the cookie and redirected —
			// ANY syntactically valid email "logged in" successfully, and
			// the user only discovered it was rejected when the first API
			// call on /home 401'd and silently bounced them back here. Now
			// we call /api/auth/me with the candidate cookie already set,
			// so a bad dev-bypass email fails right here with a clear
			// message instead of a confusing round-trip.
			document.cookie = `login_user_email_stub=${encodeURIComponent(email)}; path=/; max-age=86400; SameSite=Lax`;
			await getMe();
			router.refresh();
			router.push("/home");
		} catch (err: any) {
			// Clear the cookie we just set — it's not a valid dev-bypass
			// identity, so don't leave it sitting there for the next request.
			document.cookie = "login_user_email_stub=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
			const detail = err?.response?.data?.detail;
			setError(
				detail ||
				"That email isn't recognized. For local/test access it must be a seeded dev-bypass user (see README_SETUP_AND_TESTING.md)."
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="min-h-screen w-full flex items-center justify-center bg-gray-50 px-4">
			{/* CENTRAL CORE CONTAINER */}
			<div className="w-full max-w-md bg-white border border-gray-200 p-8 shadow-sm flex flex-col justify-between min-h-[550px]">
				{/* BRAND HEADER SEGMENT */}
				<div className="text-center space-y-2.5">
					{/* (logo) */}
					{/* (logo) */}
					{/* (logo) */}
					<div className="inline-flex items-center justify-center h-28 w-28 rounded-sm overflow-hidden">
					<Image
						src="/logo.png"
						alt="Logo"
						width={110}
						height={110}
						className="object-contain"
					/>
					</div>

					{/* (title) */}
					<h1 className="text-xl font-black tracking-tight text-[#1E3A5F] uppercase">
						Cash Apply
					</h1>
					{/* (catchphrase) */}
					<p className="text-xs text-gray-500 font-medium max-w-[280px] mx-auto leading-relaxed">
						From bank statement to Fusion in seconds.
					</p>
				</div>

				{/* ERROR PIPELINE FEEDBACK */}
				{error && (
					<div className="bg-red-50 border-l-2 border-red-600 p-3 mt-4 text-xs flex items-center gap-2.5 text-gray-900 transition-all">
						<AlertTriangle size={14} className="text-red-600 shrink-0" />
						<span className="font-medium">{error}</span>
					</div>
				)}

				{/* INPUT INTERACTION SEGMENT */}
				<form onSubmit={handleSubmit} className="space-y-4 my-auto pt-4">
					{/* username / email */}
					<div className="space-y-1">
						<label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block">
							Username
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
								className="w-full bg-white border border-gray-300 focus:border-[#4A90E2] pl-9 pr-3 py-2 text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors disabled:opacity-60"
							/>
						</div>
					</div>

					{/* password */}
					<div className="space-y-1">
						<label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block">
							Password
						</label>
						<div className="relative">
							<span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
								<Lock size={14} />
							</span>
							<input
								type="password"
								required
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••••••"
								disabled={isLoading}
								className="w-full bg-white border border-gray-300 focus:border-[#4A90E2] pl-9 pr-3 py-2 text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none transition-colors disabled:opacity-60"
							/>
						</div>
					</div>

					{/* (button) */}
					<button
						type="submit"
						disabled={isLoading}
						className="w-full flex items-center justify-center gap-2 bg-[#1E3A5F] hover:bg-[#2E6DA4] text-white py-2.5 font-bold text-xs uppercase tracking-widest transition-all shadow-sm group disabled:opacity-50 mt-2"
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

				{/* FOOTER SEGMENT */}
				{/* (copyright info) */}
				<div className="pt-6 border-t border-gray-100 text-center">
					<p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
						&copy; Zensar Technologies • For Internal Use Only • PoC v1.0
					</p>
				</div>
			</div>
		</div>
	);
}
