"use client";
import {
	AlertTriangle,
	Calendar,
	CheckCircle,
	ChevronDown,
	Download,
	FileText,
	History,
	Layers,
	Link2,
	Play,
	RefreshCw,
	Search,
	Trash2,
	User,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import { getActivityLog, getActivityUsers, purgeSystemLogs } from "@/lib/api";

// --- LOG SYSTEM SCHEMA — mirrors bff/activity_log_routes.py's response ---
interface ActivityLogEntry {
	id: number;
	user_id: number | null;
	user_email: string | null;
	action: string;
	entity_type: string | null;
	entity_id: string | null;
	status: "success" | "failure";
	ip_address: string | null;
	metadata: Record<string, unknown> | null;
	summary: string;
	created_at: string | null;
}

// PATCH: "System Logs" pill removed — it existed to surface the blanket
// per-request rows the old ActivityLogMiddleware wrote (one per page view /
// poll / list call). That middleware is gone (see app/main.py), so there's
// nothing left to filter into that bucket going forward. Added "Manual
// Invoice Mapping" — a SPOC hand-picking invoice(s) for a payment is a
// distinct, worth-tracking action that didn't have its own pill before.
const PILLS = [
	{ key: "analysis_run", label: "Analysis Run" },
	{ key: "manual_mapping", label: "Manual Invoice Mapping" },
	{ key: "approved", label: "Accepted" },
	{ key: "rejected", label: "Rejected" },
	{ key: null, label: "All Logs" },
] as const;

// Best-effort human label for the raw `action` string (e.g. "hitl.approve").
function describeAction(entry: ActivityLogEntry): { label: string; icon: React.ReactNode; styles: string } {
	const a = entry.action || "";
	if (a.startsWith("statement.upload")) {
		return { label: "File Upload", icon: <FileText size={11} />, styles: "bg-blue-50 text-blue-700 border-blue-200" };
	}
	if (a.startsWith("run.") || a.startsWith("statement.ingest")) {
		return { label: "Analysis Run", icon: <Play size={11} />, styles: "bg-purple-50 text-purple-700 border-purple-200" };
	}
	if (a.startsWith("hitl.manual_mapping")) {
		return { label: "Manual Invoice Mapping", icon: <Link2 size={11} />, styles: "bg-indigo-50 text-indigo-700 border-indigo-200" };
	}
	if (a.startsWith("hitl.approve") || a.startsWith("oracle.retry")) {
		return { label: "Accepted", icon: <CheckCircle size={11} />, styles: "bg-emerald-50 text-emerald-700 border-emerald-200" };
	}
	if (a.startsWith("hitl.reject")) {
		return { label: "Rejected", icon: <XCircle size={11} />, styles: "bg-rose-50 text-rose-700 border-rose-200" };
	}
	return { label: "Other Activity", icon: <History size={11} />, styles: "bg-gray-50 text-gray-700 border-gray-200" };
}

function fmtTimestamp(iso: string | null): string {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString(undefined, {
		year: "numeric", month: "2-digit", day: "2-digit",
		hour: "2-digit", minute: "2-digit", second: "2-digit",
	});
}

export default function ActivityLogPage() {
	const [activePill, setActivePill] = useState<(typeof PILLS)[number]["key"]>("analysis_run");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [userOptions, setUserOptions] = useState<string[]>([]);
	const [selectedUser, setSelectedUser] = useState("All Users");

	const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const pageSize = 50;

	// Which rows have their technical details (raw action code, IP address)
	// expanded — collapsed by default so the list reads as plain sentences
	// for anyone who isn't an engineer, while still being one click away
	// for whoever does need it.
	const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
	const toggleExpanded = (id: number) =>
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id); else next.add(id);
			return next;
		});

	// One-time cleanup of the historical "GET /api/..." style noise rows a
	// now-removed background process used to write (see backend
	// activity_log_routes.py's purge-system-logs for the full story).
	const [purging, setPurging] = useState(false);
	const [purgeMsg, setPurgeMsg] = useState("");

	const load = useCallback(async (pageArg: number) => {
		setLoading(true);
		setError("");
		try {
			const res = await getActivityLog({
				page: pageArg,
				pageSize,
				category: activePill ?? undefined,
				userEmail: selectedUser !== "All Users" ? selectedUser : undefined,
				dateFrom: dateFrom || undefined,
				dateTo: dateTo || undefined,
			});
			setLogs(res.data.data || []);
			setTotal(res.data.total || 0);
		} catch {
			setLogs([]);
			setTotal(0);
			setError("Could not load the activity log from the backend.");
		}
		setLoading(false);
	}, [activePill, selectedUser, dateFrom, dateTo]);

	useEffect(() => {
		setPage(1);
		load(1);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activePill, selectedUser, dateFrom, dateTo]);

	// Load distinct users for the filter dropdown (once on mount).
	useEffect(() => {
		getActivityUsers()
			.then((res) => setUserOptions(res.data.users || []))
			.catch(() => setUserOptions([]));
	}, []);

	// --- Client-side free-text search over the currently loaded page ---
	const filteredLogs = useMemo(() => {
		if (!searchQuery) return logs;
		const q = searchQuery.toLowerCase();
		return logs.filter((log) =>
			log.summary.toLowerCase().includes(q) ||
			(log.user_email || "").toLowerCase().includes(q) ||
			log.action.toLowerCase().includes(q)
		);
	}, [logs, searchQuery]);

	const exportLogsToCSV = () => {
		if (!filteredLogs.length) return;
		const headers = ["ID", "Timestamp", "Description", "Action", "User", "Entity Type", "Entity ID", "Status", "IP Address"].join(",");
		const rows = filteredLogs
			.map((l) =>
				`"${l.id}","${fmtTimestamp(l.created_at)}","${l.summary.replace(/"/g, '""')}","${l.action}","${l.user_email ?? "System"}","${l.entity_type ?? ""}","${l.entity_id ?? ""}","${l.status}","${l.ip_address ?? ""}"`,
			)
			.join("\n");
		const blob = new Blob([headers + "\n" + rows], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `cashapply_activity_log_${new Date().toISOString().split("T")[0]}.csv`;
		link.click();
	};

	const handlePurgeSystemLogs = async () => {
		if (!window.confirm(
			"This permanently deletes old page-view/poll log rows that a retired background process used to write. " +
			"It does not touch any real activity (uploads, runs, approvals, rejections, config changes, manual mappings). Continue?",
		)) return;
		setPurging(true);
		setPurgeMsg("");
		try {
			const res = await purgeSystemLogs();
			setPurgeMsg(`Removed ${res.data.deleted_count.toLocaleString()} old log entries.`);
			load(page);
		} catch (e: any) {
			setPurgeMsg(e?.response?.data?.detail || "Could not clear old logs — you may need admin access.");
		}
		setPurging(false);
		setTimeout(() => setPurgeMsg(""), 6000);
	};


	return (
		<div className="space-y-6 max-w-7xl mx-auto">
			{/* HEADER */}
			<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-gray-200">
				<div>
					<h1 className="text-xl font-black text-primary uppercase tracking-wider flex items-center gap-2">
						<span>Activity Log</span>
					</h1>
					<p className="text-xs text-gray-500 mt-0.5 font-medium">
						A plain-English record of who did what, and when. {total > 0 && `${total} entries.`}
					</p>
				</div>

				<div className="flex items-center gap-2">
					<button
						onClick={handlePurgeSystemLogs}
						disabled={purging}
						title="Deletes old page-view/poll log rows a retired background process used to write. Real activity is never touched."
						className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-red-600 cursor-pointer border border-gray-300 hover:border-red-300 px-3 py-2.5 rounded-sm transition-colors disabled:opacity-50"
					>
						<Trash2 size={13} className={purging ? "animate-pulse" : ""} /> Clear Old Logs
					</button>
					<button
						onClick={() => load(page)}
						className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-primary cursor-pointer border border-gray-300 hover:border-[#1E3A5F] px-3 py-2.5 rounded-sm transition-colors"
					>
						<RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
					</button>
					<button
						onClick={exportLogsToCSV}
						disabled={filteredLogs.length === 0}
						className="flex items-center gap-2 text-xs font-black uppercase tracking-wider bg-[#1E3A5F] hover:bg-[#2E6DA4] disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-sm shadow-xs transition-colors cursor-pointer whitespace-nowrap"
					>
						<Download size={13} /> Export CSV
					</button>
				</div>
			</div>

			{error && (
				<div className="bg-red-50 border-l-2 border-red-600 p-3 text-xs flex items-center gap-2.5 text-gray-900">
					<AlertTriangle size={14} className="text-red-600 shrink-0" />
					<span className="font-medium">{error}</span>
				</div>
			)}

			{purgeMsg && (
				<div className="bg-blue-50 border-l-2 border-blue-600 p-3 text-xs flex items-center gap-2.5 text-gray-900">
					<History size={14} className="text-blue-600 shrink-0" />
					<span className="font-medium">{purgeMsg}</span>
				</div>
			)}

			{/* ACTION PILLS */}
			<div className="flex items-center gap-1 bg-white border border-gray-200 p-1.5 rounded-sm shadow-2xs w-max max-w-full overflow-x-auto select-none">
				{PILLS.map((pill) => (
					<button
						key={pill.label}
						onClick={() => setActivePill(pill.key)}
						className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xs transition-all whitespace-nowrap cursor-pointer ${
							activePill === pill.key
								? "bg-[#1E3A5F] text-white shadow-xs"
								: "text-gray-500 hover:text-primary hover:bg-gray-50"
						}`}
					>
						{pill.label}
					</button>
				))}
			</div>

			{/* FILTER CONSOLE — who, what, and when */}
			<div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white border border-gray-200 p-4 rounded-sm shadow-2xs">
				<div className="relative flex items-center">
					<User size={13} className="absolute left-3 text-gray-400 pointer-events-none" />
					<select
						value={selectedUser}
						onChange={(e) => setSelectedUser(e.target.value)}
						className="w-full bg-gray-50 border border-gray-300 rounded-sm text-xs font-bold text-primary pl-9 pr-3 py-2 outline-none focus:border-[#4A90E2] cursor-pointer"
					>
						<option>All Users</option>
						{userOptions.map((o) => (
							<option key={o}>{o}</option>
						))}
					</select>
				</div>

				<div className="relative sm:col-span-1">
					<Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
					<input
						type="text"
						placeholder="Search…"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full bg-gray-50 border border-gray-300 text-xs font-medium text-primary pl-9 pr-3 py-2 rounded-sm focus:outline-none focus:border-[#4A90E2]"
					/>
				</div>

				<div className="relative flex items-center">
					<Calendar size={13} className="absolute left-3 text-gray-400" />
					<span className="absolute left-8 text-[9px] font-black uppercase text-gray-400 tracking-wider pointer-events-none">From</span>
					<input
						type="date"
						value={dateFrom}
						onChange={(e) => setDateFrom(e.target.value)}
						className="w-full bg-gray-50 border border-gray-300 rounded-sm text-xs font-bold text-primary pl-20 pr-3 py-2 outline-none focus:border-[#4A90E2]"
					/>
				</div>

				<div className="relative flex items-center">
					<span className="absolute left-3 text-[9px] font-black uppercase text-gray-400 tracking-wider pointer-events-none">To</span>
					<input
						type="date"
						value={dateTo}
						onChange={(e) => setDateTo(e.target.value)}
						className="w-full bg-gray-50 border border-gray-300 rounded-sm text-xs font-bold text-primary pl-9 pr-3 py-2 outline-none focus:border-[#4A90E2]"
					/>
				</div>
			</div>

			{/* LIST */}
			<div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
				<div className="divide-y divide-gray-200">
					{loading ? (
						<div className="text-center py-16 bg-gray-50/20">
							<RefreshCw className="text-gray-300 mx-auto mb-2 animate-spin" size={28} />
							<p className="text-xs font-black text-gray-400 uppercase tracking-wider">Loading activity log…</p>
						</div>
					) : filteredLogs.length === 0 ? (
						<div className="text-center py-16 bg-gray-50/20">
							<Layers className="text-gray-300 mx-auto mb-2 stroke-[1.5]" size={36} />
							<p className="text-xs font-black text-gray-400 uppercase tracking-wider">
								Nothing to show for this filter
							</p>
							<p className="text-[11px] text-gray-400 mt-1">Try a different tab, date range, or clearing your search.</p>
						</div>
					) : (
						filteredLogs.map((log) => {
							const badge = describeAction(log);
							const isExpanded = expandedIds.has(log.id);
							const hasDetails = !!(log.ip_address || log.entity_id || log.entity_type);
							return (
								<div key={log.id} className="flex flex-col md:flex-row items-stretch hover:bg-gray-50/60 transition-colors group">
									<div className="md:w-48 p-4 bg-gray-50/40 border-b md:border-b-0 md:border-r border-gray-100 flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center gap-1 shrink-0">
										<div className="text-xs font-bold text-primary tracking-tight">
											{fmtTimestamp(log.created_at)}
										</div>
									</div>

									<div className="flex-1 p-4 flex flex-col justify-between space-y-2">
										<div className="flex flex-wrap items-center gap-2">
											<span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider border rounded-xs px-2 py-0.5 shadow-2xs ${badge.styles}`}>
												{badge.icon}
												<span>{badge.label}</span>
											</span>
											{log.status === "failure" && (
												<span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider border rounded-xs px-2 py-0.5 bg-red-50 text-red-700 border-red-200">
													<AlertTriangle size={10} /> Didn't Go Through
												</span>
											)}
											<div className="flex items-center gap-1 text-xs">
												<User size={11} className="text-gray-400" />
												<span className="font-black text-[#1E3A5F]">{log.user_email || "Automated Process"}</span>
											</div>
										</div>

										<p className="text-xs text-gray-700 leading-relaxed font-medium">
											{log.summary}
										</p>

										{hasDetails && (
											<div>
												<button
													onClick={() => toggleExpanded(log.id)}
													className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-primary cursor-pointer"
												>
													<ChevronDown size={11} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
													{isExpanded ? "Hide details" : "Show details"}
												</button>
												{isExpanded && (
													<div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-mono text-gray-400">
														<span className="font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-xs">{log.action}</span>
														{log.entity_type && log.entity_id && (
															<span className="font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-xs">{log.entity_type} #{log.entity_id}</span>
														)}
														{log.ip_address && (
															<span className="font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-xs">IP {log.ip_address}</span>
														)}
													</div>
												)}
											</div>
										)}
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>

			{/* PAGINATION */}
			{total > pageSize && (
				<div className="flex items-center justify-between text-xs font-bold text-gray-500">
					<span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))} — {total} entries</span>
					<div className="flex gap-2">
						<button
							disabled={page <= 1 || loading}
							onClick={() => { const p = page - 1; setPage(p); load(p); }}
							className="px-3 py-1.5 border border-gray-300 rounded-sm disabled:opacity-40 hover:border-[#1E3A5F] cursor-pointer disabled:cursor-not-allowed"
						>
							Previous
						</button>
						<button
							disabled={page >= Math.ceil(total / pageSize) || loading}
							onClick={() => { const p = page + 1; setPage(p); load(p); }}
							className="px-3 py-1.5 border border-gray-300 rounded-sm disabled:opacity-40 hover:border-[#1E3A5F] cursor-pointer disabled:cursor-not-allowed"
						>
							Next
						</button>
					</div>
				</div>
			)}
		</div>
	);
}