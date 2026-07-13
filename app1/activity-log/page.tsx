"use client";
import {
	Calendar,
	CheckCircle,
	Download,
	FileText,
	History,
	Landmark,
	Layers,
	Play,
	Search,
	User,
	XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// --- LOG SYSTEM SCHEMA SPECIFICATIONS ---
interface AuditLogEntry {
	id: string;
	timestamp: string;
	actionType: "File Upload" | "Analysis Run" | "Approved" | "Rejected";
	user: string;
	description: string;
	source: string;
	bank: string;
}

export default function ActivityLogPage() {
	// --- IDENTITY MATRIX STATE ---
	const [userDisplayName, setUserDisplayName] = useState("Admin User");

	// --- INTERACTIVE FILTER CONSOLE STATES ---
	const [activePill, setActivePill] = useState("All Actions");
	const [selectedUser, setSelectedUser] = useState("All Users");
	const [selectedBank, setSelectedBank] = useState("All Banks");
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [searchQuery, setSearchQuery] = useState("");

	// --- COOKIE INTERCEPT ENGINE ---
	useEffect(() => {
		const match = document.cookie.match(
			/(?:^|; )login_user_email_stub=([^;]*)/,
		);
		if (match && match[1]) {
			setUserDisplayName(decodeURIComponent(match[1]).split("@")[0]);
		}
	}, []);

	// --- IMMUTABLE ENGINE MOCK DATA ---
	const auditLogs: AuditLogEntry[] = useMemo(
		() => [
			{
				id: "LOG-001",
				timestamp: "2026-06-10 09:14:22 AM",
				actionType: "File Upload",
				user: userDisplayName,
				description:
					"Uploaded bank account statement ledger 'citi_5019_April-2026.xlsx' targeting North America Enterprise BU.",
				source: "Web Application Console / Direct Upload",
				bank: "Citibank Europe",
			},
			{
				id: "LOG-002",
				timestamp: "2026-06-10 09:15:05 AM",
				actionType: "Analysis Run",
				user: "System Pipeline",
				description:
					"Triggered automated multi-tier AI extraction run (v2.1) on 'citi_5019_April-2026.xlsx'. Parsed 1,250 row records.",
				source: "AWS S3 Lambda Intercept Engine",
				bank: "Citibank Europe",
			},
			{
				id: "LOG-003",
				timestamp: "2026-06-09 04:30:11 PM",
				actionType: "Approved",
				user: userDisplayName,
				description:
					"Manually approved invoice remittance matching context for line entry ID L-102 (FedEx Services LLC -> INV-2026-0114). Flagged ready for Oracle posting.",
				source: "HITL Core Portal",
				bank: "Citibank Europe",
			},
			{
				id: "LOG-004",
				timestamp: "2026-06-09 02:11:45 PM",
				actionType: "Rejected",
				user: "finance_manager",
				description:
					"Rejected heuristic matching confidence context for statement transaction entry ID L-809 due to variance threshold overflow (> $500.00 limits).",
				source: "HITL Exception Workbench",
				bank: "HSBC Holdings",
			},
			{
				id: "LOG-005",
				timestamp: "2026-06-08 11:00:12 AM",
				actionType: "File Upload",
				user: "operator_east",
				description:
					"Uploaded standard transmission block 'hsbc_statement_block_q2.csv' via automated batch framework setup.",
				source: "SFTP Secure Data Hub",
				bank: "HSBC Holdings",
			},
			{
				id: "LOG-006",
				timestamp: "2026-06-07 01:15:59 PM",
				actionType: "Approved",
				user: "System Pipeline",
				description:
					"Auto-posted 2,890 perfectly matched line items from statement run 'jpm_chase_daily_settle.txt' directly into Oracle Fusion ERP accounts receivable tables.",
				source: "Oracle Fusion ERP Integration Service",
				bank: "JP Morgan Chase",
			},
		],
		[userDisplayName],
	);

	// --- FILTER EXECUTION PIPELINE ---
	const filteredLogs = useMemo(() => {
		return auditLogs.filter((log) => {
			// 1. Action Type Pill Filter
			if (activePill === "File Uploads" && log.actionType !== "File Upload")
				return false;
			if (activePill === "Analysis Runs" && log.actionType !== "Analysis Run")
				return false;
			if (activePill === "Approvals" && log.actionType !== "Approved")
				return false;
			if (activePill === "Rejections" && log.actionType !== "Rejected")
				return false;

			// 2. User Dropdown Filter
			if (selectedUser !== "All Users" && log.user !== selectedUser)
				return false;

			// 3. Bank Dropdown Filter
			if (selectedBank !== "All Banks" && log.bank !== selectedBank)
				return false;

			// 4. Date Filter Boundary Checks
			if (
				dateFrom &&
				new Date(log.timestamp.split(" ")[0]) < new Date(dateFrom)
			)
				return false;
			if (dateTo && new Date(log.timestamp.split(" ")[0]) > new Date(dateTo))
				return false;

			// 5. Global Content Search Bar Query
			if (searchQuery) {
				const query = searchQuery.toLowerCase();
				return (
					log.description.toLowerCase().includes(query) ||
					log.source.toLowerCase().includes(query) ||
					log.timestamp.toLowerCase().includes(query)
				);
			}

			return true;
		});
	}, [
		auditLogs,
		activePill,
		selectedUser,
		selectedBank,
		dateFrom,
		dateTo,
		searchQuery,
	]);

	// --- EXPORT MASTER CSV DATA GENERATOR ---
	const exportLogsToCSV = () => {
		if (!filteredLogs.length) return;
		const headers = [
			"Log ID",
			"Timestamp",
			"Action Type",
			"Actor User",
			"Log Description",
			"System Source Target",
			"Bank Affinity",
		].join(",");
		const rows = filteredLogs
			.map(
				(l) =>
					`"${l.id}","${l.timestamp}","${l.actionType}","${l.user}","${l.description.replace(/"/g, '""')}","${l.source}","${l.bank}"`,
			)
			.join("\n");

		const blob = new Blob([headers + "\n" + rows], {
			type: "text/csv;charset=utf-8;",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `cashapply_centralized_audit_trail_${new Date().toISOString().split("T")[0]}.csv`;
		link.click();
	};

	// --- ATTRIBUTION BADGE RENDER DICTIONARY ---
	const getActionBadgeProps = (type: string) => {
		switch (type) {
			case "File Upload":
				return {
					text: "File Upload",
					styles: "bg-blue-50 text-blue-700 border-blue-200",
					icon: <FileText size={11} />,
				};
			case "Analysis Run":
				return {
					text: "Analysis Run",
					styles: "bg-purple-50 text-purple-700 border-purple-200",
					icon: <Play size={11} />,
				};
			case "Approved":
				return {
					text: "Approved",
					styles: "bg-emerald-50 text-emerald-700 border-emerald-200",
					icon: <CheckCircle size={11} />,
				};
			case "Rejected":
				return {
					text: "Rejected",
					styles: "bg-rose-50 text-rose-700 border-rose-200",
					icon: <XCircle size={11} />,
				};
			default:
				return {
					text: "System Log",
					styles: "bg-gray-50 text-gray-700 border-gray-200",
					icon: <History size={11} />,
				};
		}
	};

	return (
		<div className="space-y-6 max-w-7xl mx-auto">
			{/* ROW 1: HEADER PLATFORM ACTION ROW */}
			<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-gray-200">
				<div>
					<h1 className="text-xl font-black text-primary uppercase tracking-wider flex items-center gap-2">
						<span>Activity Log</span>
					</h1>
					<p className="text-xs text-gray-500 mt-0.5 font-medium">
						Full audit trail of all actions - immutable.
					</p>
				</div>

				<button
					onClick={exportLogsToCSV}
					disabled={filteredLogs.length === 0}
					className="flex items-center gap-2 text-xs font-black uppercase tracking-wider bg-[#1E3A5F] hover:bg-[#2E6DA4] disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-sm shadow-xs transition-colors cursor-pointer whitespace-nowrap"
				>
					<Download size={13} /> Export CSV
				</button>
			</div>

			{/* ROW 2: ACTIONS CATALYST NAVIGATION FILTER PILLS */}
			<div className="flex items-center gap-1 bg-white border border-gray-200 p-1.5 rounded-sm shadow-2xs w-max max-w-full overflow-x-auto select-none">
				{[
					"All Actions",
					"File Uploads",
					"Analysis Runs",
					"Approvals",
					"Rejections",
				].map((pill) => (
					<button
						key={pill}
						onClick={() => setActivePill(pill)}
						className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xs transition-all whitespace-nowrap cursor-pointer ${
							activePill === pill
								? "bg-[#1E3A5F] text-white shadow-xs"
								: "text-gray-500 hover:text-primary hover:bg-gray-50"
						}`}
					>
						{pill}
					</button>
				))}
			</div>

			{/* ROW 3: DATALINK MATRIX INTERACTIVE FILTERS CONSOLE */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-white border border-gray-200 p-4 rounded-sm shadow-2xs">
				{/* Dropdown: Filter by User */}
				<div className="relative">
					<User
						size={13}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
					/>
					<select
						value={selectedUser}
						onChange={(e) => setSelectedUser(e.target.value)}
						className="w-full bg-gray-50 border border-gray-300 text-xs font-bold text-primary pl-9 pr-8 py-2 rounded-sm appearance-none focus:outline-none focus:border-[#4A90E2] cursor-pointer"
					>
						<option>All Users</option>
						<option>{userDisplayName}</option>
						<option>System Pipeline</option>
						<option>finance_manager</option>
						<option>operator_east</option>
					</select>
					<span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">
						▼
					</span>
				</div>

				{/* Dropdown: Filter by Bank Entity */}
				<div className="relative">
					<Landmark
						size={13}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
					/>
					<select
						value={selectedBank}
						onChange={(e) => setSelectedBank(e.target.value)}
						className="w-full bg-gray-50 border border-gray-300 text-xs font-bold text-primary pl-9 pr-8 py-2 rounded-sm appearance-none focus:outline-none focus:border-[#4A90E2] cursor-pointer"
					>
						<option>All Banks</option>
						<option>Citibank Europe</option>
						<option>HSBC Holdings</option>
						<option>JP Morgan Chase</option>
					</select>
					<span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">
						▼
					</span>
				</div>

				{/* Date Inputs: From Boundary */}
				<div className="relative flex items-center">
					<span className="absolute left-3 text-[9px] font-black uppercase text-gray-400 tracking-wider">
						From
					</span>
					<input
						type="date"
						value={dateFrom}
						onChange={(e) => setDateFrom(e.target.value)}
						className="w-full bg-gray-50 border border-gray-300 rounded-sm text-xs font-bold text-primary pl-12 pr-3 py-2 outline-none focus:border-[#4A90E2]"
					/>
				</div>

				{/* Date Inputs: To Boundary */}
				<div className="relative flex items-center">
					<span className="absolute left-3 text-[9px] font-black uppercase text-gray-400 tracking-wider">
						To
					</span>
					<input
						type="date"
						value={dateTo}
						onChange={(e) => setDateTo(e.target.value)}
						className="w-full bg-gray-50 border border-gray-300 rounded-sm text-xs font-bold text-primary pl-9 pr-3 py-2 outline-none focus:border-[#4A90E2]"
					/>
				</div>
			</div>

			{/* ROW 4: JOINED COMPOSITE AUDIT LIST MODULE */}
			<div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
				<div className="divide-y divide-gray-200">
					{filteredLogs.length === 0 ? (
						<div className="text-center py-16 bg-gray-50/20">
							<Layers
								className="text-gray-300 mx-auto mb-2 stroke-[1.5]"
								size={36}
							/>
							<p className="text-xs font-black text-gray-400 uppercase tracking-wider">
								No Audit Logs Matched Search Query Parameters
							</p>
						</div>
					) : (
						filteredLogs.map((log) => {
							const badge = getActionBadgeProps(log.actionType);
							return (
								<div
									key={log.id}
									className="flex flex-col md:flex-row items-stretch hover:bg-gray-50/60 transition-colors group"
								>
									{/* TIMESTAMP BOUNDS LEFT BLOCK COLUMN */}
									<div className="md:w-56 p-4 bg-gray-50/40 border-b md:border-b-0 md:border-r border-gray-100 flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center gap-1 shrink-0">
										<div className="text-xs font-mono font-bold text-primary tracking-tight">
											{log.timestamp}
										</div>
									</div>

									{/* CONTENT SUMMARY MATRIX DATA BLOCK */}
									<div className="flex-1 p-4 flex flex-col justify-between space-y-2">
										{/* INTERNAL ELEMENT ROW 1: ACTION META ATTRIBUTION LABELS */}
										<div className="flex flex-wrap items-center gap-2">
											<span
												className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider border rounded-xs px-2 py-0.5 shadow-2xs ${badge.styles}`}
											>
												{badge.icon}
												<span>{badge.text}</span>
											</span>

											<div className="flex items-center gap-1 text-xs">
												<span className="font-black text-[#1E3A5F]">
													{log.user}
												</span>
											</div>
										</div>

										{/* INTERNAL ELEMENT ROW 2: DETAILED SYSTEM LOG TEXT SUMMARY */}
										<p className="text-xs text-gray-700 leading-relaxed font-medium">
											{log.description}
										</p>

										{/* INTERNAL ELEMENT ROW 3: SYSTEM DATA TRACE LINK ORIGIN */}
										<div className="flex items-center gap-1 text-[10px] font-mono text-gray-400 pt-0.5">
											<span className="font-bold uppercase tracking-wider text-[9px]">
												Source:
											</span>
											<span className="font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-xs">
												{log.source}
											</span>
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
}