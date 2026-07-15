"use client";
import Image from "next/image";
import "./globals.css";
import {
	BarChart2,
	FileBarChart,
	History,
	Home,
	LogOut,
	Menu,
	Settings,
	User,
	Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe } from "@/lib/api";

const navItems: {
	href: string;
	label: string;
	icon: typeof Home;
	section: string;
	requiresAdmin?: boolean;
}[] = [
	{ href: "/home", label: "Home", icon: Home, section: "Main" },
	{
		href: "/analysis-history",
		label: "Analysis History",
		icon: BarChart2,
		section: "Main",
	},
	{
		href: "/executive-summary",
		label: "Executive Summary",
		icon: FileBarChart,
		section: "Main",
	},
	//
	{
		href: "/activity-log",
		label: "Activity Log",
		icon: History,
		section: "Settings",
	},
	{ href: "/config", label: "Config", icon: Settings, section: "Settings" },
	// Admin-only — gated below by the current user's permissions from /me.
	{ href: "/users", label: "Users", icon: Users, section: "Settings", requiresAdmin: true },
];

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);

	const [userEmail, setUserEmail] = useState("admin@zensar.com");
	const [userIdentifier, setUserIdentifier] = useState("Admin User");
	// Resolved server-side from the auth header (dev-bypass or real Azure
	// token) — NOT trusted from the cookie/UI alone. Shown so it's obvious
	// during testing which role's permission set is actually in effect;
	// see backend design doc §7 for the role list.
	const [userRole, setUserRole] = useState<string | null>(null);
	// Admin gate for the Users tab — derived from the permissions /me returns,
	// which are resolved server-side from the user's role (not trusted from the
	// cookie). Administrator holds "*"; "user:manage" is the explicit code.
	const [isAdmin, setIsAdmin] = useState(false);

	const isLoginPage = pathname === "/";
	const visibleNavItems = navItems.filter((i) => !i.requiresAdmin || isAdmin);

	useEffect(() => {
		if (isLoginPage) return;

		const getCookie = (name: string) => {
			const matches = document.cookie.match(
				new RegExp(
					`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`,
				),
			);
			return matches ? decodeURIComponent(matches[1]) : null;
		};

		const activeEmail = getCookie("login_user_email_stub");
		if (activeEmail) {
			setUserEmail(activeEmail);
			const identifier = activeEmail.split("@")[0];
			setUserIdentifier(identifier);

			getMe()
				.then((res) => {
					setUserRole(res.data?.role ?? null);
					const perms: string[] = res.data?.permissions ?? [];
					setIsAdmin(perms.includes("user:manage") || perms.includes("*"));
				})
				.catch(() => { setUserRole(null); setIsAdmin(false); }); // 401 handled globally by lib/api.ts's interceptor
		}
	}, [isLoginPage, pathname]);

	const getPageTitle = () => {
    const currentItem = navItems.find(
        (item) => pathname === item.href || pathname.startsWith(item.href + "/")
    );
    return currentItem ? currentItem.label : "";
	};

	const handleSignOut = () => {
		document.cookie =
			"login_user_email_stub=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
	};

	return (
		<html lang="en" className="h-full">
			<body className="antialiased text-gray-800 bg-gray-50 h-full overflow-hidden">
				{isLoginPage ? (
					children
				) : (
					<div className="flex flex-col h-screen w-screen overflow-hidden">
						{/* GLOBAL FIXED TOP BAR */}
						<header className="h-16 bg-[#1E3A5F] text-white px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs border-b border-[#172e4c] shrink-0">
							<div className="flex items-center gap-4">
								<button
									onClick={() => setIsSidebarOpen(!isSidebarOpen)}
									className="p-1.5 rounded-sm hover:bg-[#2E6DA4]/30 transition-colors focus:outline-none cursor-pointer"
									aria-label="Toggle Sidebar"
								>
									<Menu size={18} />
								</button>

								<div className="flex items-center gap-2">
									{/* Logo */}
									<div className="flex justify-center">
										<Image
											src="/logo.png"
											alt="Cash Apply Logo"
											width={48}
											height={48}
											className="object-contain"
										/>
									</div>
									<div className="leading-tight border-r border-[#2E6DA4]/40 pr-4">
										<div className="text-xs font-black uppercase tracking-tight whitespace-nowrap">
											Cash Apply
										</div>
										<div className="text-[9px] text-[#4A90E2] font-black uppercase tracking-widest">
											From bank statement to Fusion - in seconds
										</div>
									</div>
									<h1 className="text-xs font-black uppercase tracking-wider text-white pl-1 hidden sm:block">
										{getPageTitle()}
									</h1>
								</div>
							</div>

							<div className="flex items-center gap-4">
								<div className="text-right hidden sm:block">
									<p className="text-xs font-bold text-white capitalize flex items-center gap-1.5 justify-end">
										{userIdentifier}
										{userRole && (
											<span className="text-[9px] font-black uppercase tracking-wider bg-[#4A90E2]/20 text-[#4A90E2] px-1.5 py-0.5 rounded-sm border border-[#4A90E2]/30">
												{userRole}
											</span>
										)}
									</p>
									<p className="text-[10px] text-gray-400 font-mono">
										{userEmail}
									</p>
								</div>
								<div className="h-8 w-8 rounded-full bg-[#2E6DA4]/20 text-white flex items-center justify-center border border-[#4A90E2]/20">
									<User size={14} />
								</div>
								<hr className="w-px h-6 bg-[#2E6DA4]/30" />
								<Link
									href="/"
									onClick={handleSignOut}
									className="text-gray-400 hover:text-[#e11d48] transition-colors p-1.5 rounded-sm hover:bg-[#e11d48]/5"
									title="Sign Out"
								>
									<LogOut size={16} />
								</Link>
							</div>
						</header>

						<div className="flex flex-1 h-[calc(100vh-64px)] relative overflow-hidden">
							{/* FIXED NAVIGATION PANEL */}
							<aside
								className={`bg-white border-r border-gray-200 flex flex-col fixed left-0 bottom-0 top-16 z-20 transition-all duration-300 ease-in-out shrink-0 ${
									isSidebarOpen ? "w-60" : "w-16"
								}`}
							>
								<nav className="flex-1 py-3 space-y-1.5 overflow-y-auto overflow-x-hidden">
									{visibleNavItems.map(
										({ href, label, icon: Icon, section }, index) => {
											const active = pathname === href;

											// Determine if this item is the start of a new visual section group
											const showSectionHeader =
												index === 0 || visibleNavItems[index - 1].section !== section;

											return (
												<div key={href} className="space-y-0.5">
													{showSectionHeader && (
														<div
															className={`px-6 text-[9px] font-black tracking-wider text-gray-400 uppercase transition-all duration-200 pt-3 pb-1 block h-7 truncate ${
																isSidebarOpen
																	? "opacity-100 pl-6"
																	: "opacity-0 h-0 pt-0 pb-0 pointer-events-none"
															}`}
														>
															{section}
														</div>
													)}

													<Link
														href={href}
														title={!isSidebarOpen ? label : undefined}
														className={`flex items-center gap-3 w-full px-6 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-150 ${
															active
																? "bg-[#1E3A5F] text-white border-l-4 border-[#4A90E2] pl-5"
																: "text-gray-500 hover:bg-gray-50 hover:text-primary pl-6"
														}`}
													>
														<div className="flex-shrink-0">
															<Icon
																size={16}
																className={active ? "text-[#4A90E2]" : ""}
															/>
														</div>
														<span
															className={`whitespace-nowrap transition-opacity duration-200 ${isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none hidden"}`}
														>
															{label}
														</span>
													</Link>
												</div>
											);
										},
									)}
								</nav>
								<div
									className={`p-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 border-t border-gray-100 whitespace-nowrap overflow-hidden transition-all duration-200 ${isSidebarOpen ? "opacity-100" : "opacity-0 w-0 h-0 p-0 pointer-events-none"}`}
								>
									Internal Use Only
								</div>
							</aside>

							{/* ISOLATED COMPOSITE VIEWPORT FOR INLINE PAGE COMPONENT LAYER SCROLLING */}
							<main
								className={`flex-1 p-8 h-full overflow-y-auto transition-all duration-300 ease-in-out ${
									isSidebarOpen ? "ml-60" : "ml-16"
								}`}
							>
								{children}
							</main>
						</div>
					</div>
				)}
			</body>
		</html>
	);
}