"use client";
import { Loader2, Plus, RefreshCw, Search, ShieldCheck, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getMe, getRoles, getUsers, onboardUser, setUserActive, updateUser } from "@/lib/api";

interface UserRow {
	id: number;
	email: string;
	display_name: string | null;
	role: string | null;
	is_active: boolean;
	last_login_at: string | null;
	status: "active" | "pending" | "disabled";
}

interface RoleRow {
	id: number;
	name: string;
	description?: string | null;
	permissions: string[];
}

function getCookie(name: string): string | null {
	if (typeof document === "undefined") return null;
	const m = document.cookie.match(
		new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`),
	);
	return m ? decodeURIComponent(m[1]) : null;
}

function fmtTimestamp(iso: string | null): string {
	if (!iso) return "—";
	const d = new Date(iso);
	if (isNaN(d.getTime())) return iso;
	return d.toLocaleString(undefined, {
		year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
	});
}

const STATUS_STYLES: Record<string, string> = {
	active: "bg-emerald-100 text-emerald-700",
	pending: "bg-amber-100 text-amber-700",
	disabled: "bg-gray-200 text-gray-500",
};

const PAGE_SIZE = 10;

export default function UsersPage() {
	const router = useRouter();
	const [authorized, setAuthorized] = useState<boolean | null>(null); // null = checking
	const [currentEmail, setCurrentEmail] = useState<string | null>(null);

	const [users, setUsers] = useState<UserRow[]>([]);
	const [roles, setRoles] = useState<RoleRow[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [busyId, setBusyId] = useState<number | null>(null);

	// Onboard modal
	const [modalOpen, setModalOpen] = useState(false);
	const [formEmail, setFormEmail] = useState("");
	const [formName, setFormName] = useState("");
	const [formRole, setFormRole] = useState("");
	const [saving, setSaving] = useState(false);

	// ── Route guard: admin-only. Backend also enforces "user:manage". ───────────
	useEffect(() => {
		setCurrentEmail(getCookie("login_user_email_stub"));
		getMe()
			.then((res) => {
				const perms: string[] = res.data?.permissions ?? [];
				const admin = perms.includes("user:manage") || perms.includes("*");
				setAuthorized(admin);
				if (!admin) router.replace("/home");
			})
			.catch(() => { setAuthorized(false); router.replace("/home"); });
	}, [router]);

	const fetchAll = useCallback(async () => {
		setLoading(true);
		try {
			const [u, r] = await Promise.all([getUsers(), getRoles()]);
			setUsers(u.data.users ?? []);
			setRoles(r.data.roles ?? []);
		} catch {
			setError("Could not load users.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (authorized) fetchAll();
	}, [authorized, fetchAll]);

	const showSuccess = (msg: string) => {
		setSuccess(msg);
		setTimeout(() => setSuccess(""), 4000);
	};
	const showError = (msg: string) => {
		setError(msg);
		setTimeout(() => setError(""), 5000);
	};

	// ── Derived: search + pagination ────────────────────────────────────────────
	const q = search.trim().toLowerCase();
	const filtered = useMemo(
		() => (q
			? users.filter((u) =>
				u.email.toLowerCase().includes(q) ||
				(u.display_name ?? "").toLowerCase().includes(q) ||
				(u.role ?? "").toLowerCase().includes(q))
			: users),
		[users, q],
	);
	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	useEffect(() => { setPage(1); }, [search]);
	const safePage = Math.min(page, pageCount);
	const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

	// ── Actions ───────────────────────────────────────────────────────────────
	const handleOnboard = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!formEmail.trim() || !formRole) return;
		setSaving(true);
		setError("");
		try {
			await onboardUser({
				email: formEmail.trim(),
				display_name: formName.trim() || undefined,
				role_name: formRole,
			});
			showSuccess(`Onboarded ${formEmail.trim()} as ${formRole}. They can sign in with this email.`);
			setModalOpen(false);
			setFormEmail(""); setFormName(""); setFormRole("");
			fetchAll();
		} catch (err: any) {
			setError(err?.response?.data?.detail || "Could not onboard user.");
		} finally {
			setSaving(false);
		}
	};

	const handleRoleChange = async (u: UserRow, roleName: string) => {
		if (roleName === u.role) return;
		setBusyId(u.id);
		try {
			await updateUser(u.id, { role_name: roleName });
			showSuccess(`Updated ${u.email} → ${roleName}.`);
			fetchAll();
		} catch (err: any) {
			showError(err?.response?.data?.detail || "Could not change role.");
		} finally {
			setBusyId(null);
		}
	};

	const handleToggleActive = async (u: UserRow) => {
		setBusyId(u.id);
		try {
			await setUserActive(u.id, !u.is_active);
			showSuccess(`${u.is_active ? "Deactivated" : "Reactivated"} ${u.email}.`);
			fetchAll();
		} catch (err: any) {
			showError(err?.response?.data?.detail || "Could not update user.");
		} finally {
			setBusyId(null);
		}
	};

	// While the guard is resolving, render nothing (avoids a flash of the table).
	if (authorized !== true) return null;

	const isSelf = (u: UserRow) => currentEmail != null && u.email.toLowerCase() === currentEmail.toLowerCase();

	return (
		<div className="space-y-6 max-w-5xl mx-auto">
			{/* HEADER */}
			<div className="pb-2 border-b border-gray-200 flex items-end justify-between">
				<div>
					<h1 className="text-xl font-black text-primary uppercase tracking-wider">Users</h1>
					<p className="text-xs text-gray-500 mt-0.5 font-medium">
						Onboard users by email, assign roles, and manage access
					</p>
				</div>
			</div>

			{success && (
				<div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-sm text-xs font-bold">
					✓ {success}
				</div>
			)}

			<div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
				{/* Section header */}
				<div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<ShieldCheck size={13} className="text-[#1E3A5F]" />
						<h2 className="text-xs font-black text-primary uppercase tracking-wider">System Users</h2>
						{users.length > 0 && (
							<span className="text-[10px] font-bold text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-xs">
								{users.length}
							</span>
						)}
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={fetchAll}
							disabled={loading}
							className="text-gray-400 hover:text-primary cursor-pointer p-1 disabled:opacity-40"
							title="Reload users"
						>
							<RefreshCw size={13} className={loading ? "animate-spin" : ""} />
						</button>
						<button
							onClick={() => { setModalOpen(true); setError(""); setFormRole(roles[0]?.name ?? ""); }}
							className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider bg-[#1E3A5F] hover:bg-[#2E6DA4] text-white px-3 py-1.5 rounded-sm cursor-pointer shadow-xs transition-colors"
						>
							<Plus size={12} /> Onboard User
						</button>
					</div>
				</div>

				{/* Search */}
				{users.length > 0 && (
					<div className="px-4 py-2.5 border-b border-gray-100">
						<div className="relative max-w-sm">
							<Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
							<input
								type="text"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search email, name or role…"
								className="w-full bg-white border border-gray-300 rounded-sm text-xs text-primary pl-7 pr-3 py-1.5 outline-none focus:border-[#4A90E2]"
							/>
						</div>
					</div>
				)}

				{error && (
					<div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs font-bold text-red-700">
						{error}
					</div>
				)}

				{/* Table */}
				{loading ? (
					<div className="flex items-center justify-center py-8 text-gray-400">
						<Loader2 size={16} className="animate-spin mr-2" /> Loading…
					</div>
				) : users.length === 0 ? (
					<div className="px-4 py-6 text-xs text-gray-400 text-center">
						No users yet. Onboard one to grant access.
					</div>
				) : filtered.length === 0 ? (
					<div className="px-4 py-6 text-xs text-gray-400 text-center">No users match “{search}”.</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-xs">
							<thead>
								<tr className="text-[10px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
									<th className="text-left px-4 py-2">User</th>
									<th className="text-left px-3 py-2">Role</th>
									<th className="text-left px-3 py-2">Status</th>
									<th className="text-left px-3 py-2">Last login</th>
									<th className="text-right px-4 py-2">Actions</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100">
								{paged.map((u) => (
									<tr key={u.id} className="hover:bg-gray-50/50">
										<td className="px-4 py-2.5">
											<div className="font-bold text-primary">{u.display_name || u.email.split("@")[0]}</div>
											<div className="font-mono text-[10px] text-gray-400">{u.email}</div>
										</td>
										<td className="px-3 py-2.5">
											<select
												value={u.role ?? ""}
												disabled={busyId === u.id}
												onChange={(e) => handleRoleChange(u, e.target.value)}
												className="bg-white border border-gray-300 rounded-sm text-[11px] font-semibold text-primary px-2 py-1 outline-none focus:border-[#4A90E2] cursor-pointer disabled:opacity-50"
											>
												{roles.map((r) => (
													<option key={r.id} value={r.name}>{r.name}</option>
												))}
											</select>
										</td>
										<td className="px-3 py-2.5">
											<span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-xs ${STATUS_STYLES[u.status]}`}>
												{u.status}
											</span>
										</td>
										<td className="px-3 py-2.5 text-gray-500">{fmtTimestamp(u.last_login_at)}</td>
										<td className="px-4 py-2.5 text-right">
											{busyId === u.id ? (
												<Loader2 size={13} className="animate-spin inline text-gray-400" />
											) : (
												<button
													onClick={() => handleToggleActive(u)}
													disabled={isSelf(u)}
													title={isSelf(u) ? "You can't deactivate your own account" : undefined}
													className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-sm cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
														u.is_active
															? "text-red-600 hover:bg-red-50"
															: "text-emerald-700 hover:bg-emerald-50"
													}`}
												>
													{u.is_active ? "Deactivate" : "Reactivate"}
												</button>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{/* Pagination */}
				{!loading && pageCount > 1 && (
					<div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-100">
						<span className="text-[10px] text-gray-400 font-medium">
							Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
						</span>
						<div className="flex items-center gap-1">
							<button
								onClick={() => setPage((p) => Math.max(1, p - 1))}
								disabled={safePage <= 1}
								className="text-[11px] font-bold text-gray-500 hover:text-primary px-2 py-1 rounded-sm disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
							>
								Prev
							</button>
							{Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
								<button
									key={n}
									onClick={() => setPage(n)}
									className={`text-[11px] font-bold w-6 h-6 rounded-sm cursor-pointer ${
										n === safePage ? "bg-[#1E3A5F] text-white" : "text-gray-500 hover:bg-gray-100"
									}`}
								>
									{n}
								</button>
							))}
							<button
								onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
								disabled={safePage >= pageCount}
								className="text-[11px] font-bold text-gray-500 hover:text-primary px-2 py-1 rounded-sm disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
							>
								Next
							</button>
						</div>
					</div>
				)}
			</div>

			{/* Onboard modal */}
			{modalOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setModalOpen(false)}>
					<div className="bg-white rounded-sm shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
						<div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
							<div className="flex items-center gap-2">
								<UserPlus size={14} className="text-[#1E3A5F]" />
								<h3 className="text-xs font-black text-primary uppercase tracking-wider">Onboard User</h3>
							</div>
							<button onClick={() => !saving && setModalOpen(false)} className="text-gray-400 hover:text-primary cursor-pointer">
								<X size={16} />
							</button>
						</div>
						<form onSubmit={handleOnboard} className="p-4 space-y-4">
							<div className="space-y-1">
								<label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Email *</label>
								<input
									type="email"
									required
									value={formEmail}
									onChange={(e) => setFormEmail(e.target.value)}
									placeholder="user@zensar.com"
									className="w-full bg-white border border-gray-300 rounded-sm text-xs text-primary px-3 py-2 outline-none focus:border-[#4A90E2]"
								/>
								<p className="text-[10px] text-gray-400">They sign in with this email (via SSO, or the login screen locally).</p>
							</div>
							<div className="space-y-1">
								<label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Display name</label>
								<input
									type="text"
									value={formName}
									onChange={(e) => setFormName(e.target.value)}
									placeholder="(optional)"
									className="w-full bg-white border border-gray-300 rounded-sm text-xs text-primary px-3 py-2 outline-none focus:border-[#4A90E2]"
								/>
							</div>
							<div className="space-y-1">
								<label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Role *</label>
								<select
									required
									value={formRole}
									onChange={(e) => setFormRole(e.target.value)}
									className="w-full bg-white border border-gray-300 rounded-sm text-xs font-semibold text-primary px-3 py-2 outline-none focus:border-[#4A90E2] cursor-pointer"
								>
									<option value="" disabled>Select a role…</option>
									{roles.map((r) => (
										<option key={r.id} value={r.name}>{r.name}</option>
									))}
								</select>
								{formRole && (
									<p className="text-[10px] text-gray-400">
										Grants: {roles.find((r) => r.name === formRole)?.permissions.join(", ") || "—"}
									</p>
								)}
							</div>
							{error && <div className="text-xs font-bold text-red-700">{error}</div>}
							<div className="flex justify-end gap-2 pt-1">
								<button
									type="button"
									onClick={() => setModalOpen(false)}
									disabled={saving}
									className="text-[11px] font-black uppercase tracking-wider text-gray-500 hover:text-primary px-3 py-2 rounded-sm cursor-pointer disabled:opacity-50"
								>
									Cancel
								</button>
								<button
									type="submit"
									disabled={saving || !formEmail.trim() || !formRole}
									className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider bg-[#1E3A5F] hover:bg-[#2E6DA4] text-white px-4 py-2 rounded-sm cursor-pointer shadow-xs disabled:opacity-50"
								>
									{saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
									{saving ? "Onboarding…" : "Onboard"}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
