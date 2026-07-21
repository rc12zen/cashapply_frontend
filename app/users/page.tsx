"use client";
/**
 * app/users/page.tsx
 * =====================
 * User Management. Broken into focused pieces (each responsible for one
 * thing) rather than one large file:
 *   - components/users/UsersTable.tsx       — the list/table + pagination
 *   - components/users/OnboardUserModal.tsx — the "onboard new user" form
 *   - components/users/RoleMultiSelect.tsx  — shared multi-role picker
 *     (an Administrator can assign a user ANY NUMBER of roles at once —
 *     see backend scripts/seed_rbac.py / db/models.py's UserRole table)
 * This file just orchestrates: fetching, search/pagination state, and the
 * onboard/role-change/activate handlers.
 */
import { Loader2, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getMe, getRoles, getUsers, onboardUser, setUserActive, updateUser } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import RoleLegend from "@/components/RoleLegend";
import UsersTable, { type UserRow } from "@/components/users/UsersTable";
import OnboardUserModal from "@/components/users/OnboardUserModal";
import { type RoleOption } from "@/components/users/RoleMultiSelect";

function getCookie(name: string): string | null {
	if (typeof document === "undefined") return null;
	const m = document.cookie.match(
		new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`),
	);
	return m ? decodeURIComponent(m[1]) : null;
}

const PAGE_SIZE = 10;

export default function UsersPage() {
	const router = useRouter();
	const [authorized, setAuthorized] = useState<boolean | null>(null); // null = checking
	const [currentEmail, setCurrentEmail] = useState<string | null>(null);

	const [users, setUsers] = useState<UserRow[]>([]);
	const [roles, setRoles] = useState<RoleOption[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [busyId, setBusyId] = useState<number | null>(null);

	// Onboard modal
	const [modalOpen, setModalOpen] = useState(false);
	const [modalError, setModalError] = useState("");
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
				(u.roles ?? []).some((r) => r.toLowerCase().includes(q)))
			: users),
		[users, q],
	);
	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	useEffect(() => { setPage(1); }, [search]);
	const safePage = Math.min(page, pageCount);
	const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

	// ── Actions ───────────────────────────────────────────────────────────────
	const handleOnboard = async (data: { email: string; display_name?: string; role_names: string[] }) => {
		setSaving(true);
		setModalError("");
		try {
			await onboardUser({
				email: data.email,
				display_name: data.display_name,
				role_names: data.role_names,
			});
			showSuccess(`Onboarded ${data.email} as ${data.role_names.join(", ")}. They can sign in with this email.`);
			setModalOpen(false);
			fetchAll();
		} catch (err: any) {
			setModalError(getErrorMessage(err, "Could not onboard user."));
		} finally {
			setSaving(false);
		}
	};

	const handleRolesChange = async (u: UserRow, roleNames: string[]) => {
		const current = u.roles ?? (u.role ? [u.role] : []);
		if (JSON.stringify([...current].sort()) === JSON.stringify([...roleNames].sort())) return;
		if (roleNames.length === 0) {
			showError("A user needs at least one role — use Viewer if they shouldn't have access yet.");
			return;
		}
		setBusyId(u.id);
		try {
			await updateUser(u.id, { role_names: roleNames });
			showSuccess(`Updated ${u.email} → ${roleNames.join(", ")}.`);
			fetchAll();
		} catch (err: any) {
			showError(getErrorMessage(err, "Could not change role."));
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
			showError(getErrorMessage(err, "Could not update user."));
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
						Onboard users by email, assign one or more roles, and manage access
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
						<ShieldCheck size={13} className="text-[#222222]" />
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
							onClick={() => { setModalOpen(true); setModalError(""); }}
							className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider bg-[#222222] hover:bg-[#222222] text-white px-3 py-1.5 rounded-sm cursor-pointer shadow-xs transition-colors"
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
								className="w-full bg-white border border-gray-300 rounded-sm text-xs text-primary pl-7 pr-3 py-1.5 outline-none focus:border-[#222222]"
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
					<div className="px-4 py-6 text-xs text-gray-400 text-center">No users match &ldquo;{search}&rdquo;.</div>
				) : (
					<UsersTable
						users={paged}
						roles={roles}
						busyId={busyId}
						isSelf={isSelf}
						onRolesChange={handleRolesChange}
						onToggleActive={handleToggleActive}
					/>
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
										n === safePage ? "bg-[#222222] text-white" : "text-gray-500 hover:bg-gray-100"
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

			<div className="mt-6">
				<RoleLegend />
			</div>

			{modalOpen && (
				<OnboardUserModal
					roles={roles}
					saving={saving}
					error={modalError}
					onCancel={() => setModalOpen(false)}
					onSubmit={handleOnboard}
				/>
			)}
		</div>
	);
}
