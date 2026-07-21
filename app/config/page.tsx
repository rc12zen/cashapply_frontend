"use client";
import { Database, Cpu, Loader2, Mail, Plus, RefreshCw, Save, Search, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { listAccounts, uploadBuilderFile } from "@/lib/configBuilderApi";
import type { AccountSummary, FormatSummary } from "@/lib/configBuilderTypes";
import ConfigBuilderWizard from "@/components/ConfigBuilderWizard";

interface BankConfigEntry {
	config_key: string;
	display_name?: string;
	bank?: string;
	currency?: string;
	formats: FormatSummary[];
}

// Server timestamps are UTC ISO strings ("2026-07-14T11:42:10Z"). Render as a
// compact local date-time; fall back to the raw string if it can't be parsed.
function fmtTimestamp(iso?: string): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (isNaN(d.getTime())) return iso;
	return d.toLocaleString(undefined, {
		year: "numeric", month: "short", day: "numeric",
		hour: "2-digit", minute: "2-digit",
	});
}

import { usePageGuard } from "@/lib/usePageGuard";
import PageAccessDenied from "@/components/PageAccessDenied";

export default function ConfigPage() {
	const { allowed, checking } = usePageGuard("canViewData");
	// ── Bank Statement Configs ───────────────────────────────────────────────
	const [bankConfigs, setBankConfigs]       = useState<BankConfigEntry[]>([]);
	const [configsLoading, setConfigsLoading] = useState(false);
	const [wizardFile, setWizardFile]         = useState<string | null>(null);
	const [uploading, setUploading]           = useState(false);
	const [configSuccess, setConfigSuccess]   = useState("");
	const [configError, setConfigError]       = useState("");
	const [search, setSearch]                 = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const fetchBankConfigs = useCallback(async () => {
		setConfigsLoading(true);
		try {
			const res = await listAccounts();
			setBankConfigs((res.data.accounts ?? []).map((a: AccountSummary) => ({
				config_key: a.account_number,
				display_name: a.display_name,
				bank: a.bank,
				currency: a.currency,
				formats: a.formats ?? [],
			})));
		} catch {}
		finally { setConfigsLoading(false); }
	}, []);

	useEffect(() => { fetchBankConfigs(); }, [fetchBankConfigs]);

	// "Add New Config" = upload the report directly here, then open the wizard on
	// the returned filename. A new version is added by re-uploading + saving.
	const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";                       // allow re-selecting the same file
		if (!file) return;
		setConfigError("");
		setUploading(true);
		try {
			const res = await uploadBuilderFile(file);
			setWizardFile(res.data.filename);
		} catch {
			setConfigError("Upload failed. Please try again.");
		} finally { setUploading(false); }
	};

	const q = search.trim().toLowerCase();
	const filteredConfigs = q
		? bankConfigs.filter((c) =>
			c.config_key.toLowerCase().includes(q) ||
			(c.display_name ?? "").toLowerCase().includes(q) ||
			(c.bank ?? "").toLowerCase().includes(q))
		: bankConfigs;

	// Numbered pagination — only kicks in once the filtered list exceeds one
	// page. Search filters the full set first (above), then we page the result.
	const PAGE_SIZE = 10;
	const [page, setPage] = useState(1);
	const pageCount = Math.max(1, Math.ceil(filteredConfigs.length / PAGE_SIZE));
	// Reset to page 1 whenever the search term changes.
	useEffect(() => { setPage(1); }, [search]);
	// Clamp if the current page falls out of range (e.g. after a reload shrinks the list).
	const safePage = Math.min(page, pageCount);
	const pagedConfigs = filteredConfigs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
	// Frontend-only visibility toggle. The Matching Thresholds / Oracle Fusion /
	// Notifications sections and the global "Save Config" bar are hidden for now —
	// only Bank Statement Configs is shown. Flip to `true` to bring them back;
	// all their state/handlers below are intentionally kept intact.
	const SHOW_LEGACY_CONFIG_SECTIONS = false;

	// --- WORKSPACE CONFIGURATION PARAMETER STATES ---
	const [confidenceScore, setConfidenceScore] = useState(85);
	const [bankChargesTolerance, setBankChargesTolerance] = useState(25.0);
	const [fusionEndpoint, setFusionEndpoint] = useState(
		"https://fa-ext.oraclecloud.com/fscmRestApi/resources/11.13.18.05",
	);
	const [environment, setEnvironment] = useState("test");
	const [saved, setSaved] = useState(false);

	// Notification flags
	const [notifyOnComplete, setNotifyOnComplete] = useState(true);
	const [notifyOnPostFailure, setNotifyOnPostFailure] = useState(true);
	const [notifySummaryToManager, setNotifySummaryToManager] = useState(false);

	const handleGlobalConfigSave = () => {
		setSaved(true);
		setTimeout(() => setSaved(false), 3000);
	};

	if (checking) return null;
	if (!allowed) return <PageAccessDenied />;

	return (
		<div className="space-y-6 max-w-5xl mx-auto">
			{/* HEADER PLATFORM ANCHOR */}
			<div className="pb-2 border-b border-gray-200">
				<h1 className="text-xl font-black text-primary uppercase tracking-wider">
					Config
				</h1>
				<p className="text-xs text-gray-500 mt-0.5 font-medium">
					Manage bank statement ingestion configs and their versions
				</p>
			</div>

			{SHOW_LEGACY_CONFIG_SECTIONS && (<>
			{saved && (
				<div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-sm text-xs font-bold tracking-wide shadow-2xs">
					✓ Parameters and rules synchronized successfully over active pipeline
					instances.
				</div>
			)}

			{/* SECTION: MATCHING THRESHOLDS */}
			<div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
				<div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center gap-2">
					<ShieldAlert size={13} className="text-[#222222]" />
					<h2 className="text-xs font-black text-primary uppercase tracking-wider">
						Matching Thresholds
					</h2>
				</div>

				<div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
					{/* Left Column: Confidence Score */}
					<div className="space-y-1.5">
						<label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
							Minimum confidence score to auto-suggest
						</label>
						<div className="relative max-w-xs">
							<input
								type="number"
								min={0}
								max={100}
								value={confidenceScore}
								onChange={(e) => setConfidenceScore(Number(e.target.value))}
								className="w-full bg-white border border-gray-300 rounded-sm text-xs font-bold text-primary pl-3 pr-8 py-2 outline-none focus:border-[#222222]"
							/>
							<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400 pointer-events-none">
								%
							</span>
						</div>
					</div>

					{/* Right Column: Bank Charges Variance Tolerance */}
					<div className="space-y-1.5">
						<label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
							Amount tolerance for bank charges (any currency)
						</label>
						<div className="relative max-w-xs">
							<input
								type="number"
								step="0.01"
								value={bankChargesTolerance}
								onChange={(e) =>
									setBankChargesTolerance(Number(e.target.value))
								}
								className="w-full bg-white border border-gray-300 rounded-sm text-xs font-mono font-bold text-primary px-3 py-2 outline-none focus:border-[#222222]"
							/>
						</div>
					</div>
				</div>
			</div>

			{/* SECTION: ORACLE FUSION INTEGRATION ENGINE */}
			<div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
				<div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center gap-2">
					<Cpu size={13} className="text-[#222222]" />
					<h2 className="text-xs font-black text-primary uppercase tracking-wider">
						Oracle Fusion
					</h2>
				</div>

				<div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-6">
					{/* Left Column: API Endpoint Base Route */}
					<div className="md:col-span-8 space-y-1.5">
						<label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
							Oracle Fusion API endpoint
						</label>
						<input
							type="text"
							value={fusionEndpoint}
							onChange={(e) => setFusionEndpoint(e.target.value)}
							className="w-full bg-white border border-gray-300 rounded-sm text-xs font-mono font-semibold text-primary px-3 py-2 outline-none focus:border-[#222222]"
						/>
					</div>

					{/* Right Column: Environment Type Dropdown */}
					<div className="md:col-span-4 space-y-1.5">
						<label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
							Environment
						</label>
						<div className="relative">
							<select
								value={environment}
								onChange={(e) => setEnvironment(e.target.value)}
								className="w-full bg-white border border-gray-300 text-xs font-bold text-primary pl-3 pr-8 py-2 rounded-sm appearance-none focus:outline-none focus:border-[#222222] cursor-pointer"
							>
								<option value="production">production</option>
								<option value="test">test</option>
							</select>
							<span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">
								▼
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* SECTION: AUTOMATED EVENT NOTIFICATIONS */}
			<div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
				<div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center gap-2">
					<Mail size={13} className="text-[#222222]" />
					<h2 className="text-xs font-black text-primary uppercase tracking-wider">
						Notifications
					</h2>
				</div>

				<div className="p-4 space-y-3">
					{/* Checkbox Option 1 */}
					<label className="flex items-start gap-3 select-none group cursor-pointer">
						<input
							type="checkbox"
							checked={notifyOnComplete}
							onChange={(e) => setNotifyOnComplete(e.target.checked)}
							className="mt-0.5 rounded-xs text-[#222222] focus:ring-0 cursor-pointer h-3.5 w-3.5 border-gray-300"
						/>
						<span className="text-xs font-semibold text-gray-700 group-hover:text-primary transition-colors">
							Send a mail when analysis run completes
						</span>
					</label>

					{/* Checkbox Option 2 */}
					<label className="flex items-start gap-3 select-none group cursor-pointer">
						<input
							type="checkbox"
							checked={notifyOnPostFailure}
							onChange={(e) => setNotifyOnPostFailure(e.target.checked)}
							className="mt-0.5 rounded-xs text-[#222222] focus:ring-0 cursor-pointer h-3.5 w-3.5 border-gray-300"
						/>
						<span className="text-xs font-semibold text-gray-700 group-hover:text-primary transition-colors">
							Alert me when Oracle posting fails
						</span>
					</label>

					{/* Checkbox Option 3 */}
					<label className="flex items-start gap-3 select-none group cursor-pointer">
						<input
							type="checkbox"
							checked={notifySummaryToManager}
							onChange={(e) => setNotifySummaryToManager(e.target.checked)}
							className="mt-0.5 rounded-xs text-[#222222] focus:ring-0 cursor-pointer h-3.5 w-3.5 border-gray-300"
						/>
						<span className="text-xs font-semibold text-gray-700 group-hover:text-primary transition-colors">
							Periodically send a summary mail to Finance manager(s)
						</span>
					</label>
				</div>
			</div>

			{/* SAVE EXECUTION BUTTON BAR */}
			<div className="pt-2 flex justify-end">
				<button
					onClick={handleGlobalConfigSave}
					className="flex items-center gap-2 text-xs font-black uppercase tracking-wider bg-[#222222] hover:bg-[#222222] text-white px-6 py-2.5 rounded-sm shadow-xs transition-colors cursor-pointer"
				>
					<Save size={13} /> Save Config
				</button>
			</div>
			</>)}

			{/* BANK STATEMENT CONFIGS */}
			<div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
				<div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Database size={13} className="text-[#222222]" />
						<h2 className="text-xs font-black text-primary uppercase tracking-wider">Bank Statement Configs</h2>
						{bankConfigs.length > 0 && (
							<span className="text-[10px] font-bold text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-xs">
								{bankConfigs.length}
							</span>
						)}
					</div>
					<div className="flex items-center gap-2">
						<button
							onClick={fetchBankConfigs}
							disabled={configsLoading}
							className="text-gray-400 hover:text-primary cursor-pointer p-1 disabled:opacity-40"
							title="Reload configs"
						>
							<RefreshCw size={13} className={configsLoading ? "animate-spin" : ""} />
						</button>
						<input
							ref={fileInputRef}
							type="file"
							accept=".xlsx,.xls,.csv"
							className="hidden"
							onChange={handleFileChosen}
						/>
						<button
							onClick={() => fileInputRef.current?.click()}
							disabled={uploading}
							className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider bg-[#222222] hover:bg-[#222222] text-white px-3 py-1.5 rounded-sm cursor-pointer shadow-xs transition-colors disabled:opacity-50"
						>
							{uploading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
							{uploading ? "Uploading…" : "Add New Config"}
						</button>
					</div>
				</div>

				{/* Search / filter */}
				{bankConfigs.length > 0 && (
					<div className="px-4 py-2.5 border-b border-gray-100">
						<div className="relative max-w-sm">
							<Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
							<input
								type="text"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search account, bank or name…"
								className="w-full bg-white border border-gray-300 rounded-sm text-xs text-primary pl-7 pr-3 py-1.5 outline-none focus:border-[#222222]"
							/>
						</div>
					</div>
				)}

				{configError && (
					<div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs font-bold text-red-700">
						{configError}
					</div>
				)}

				{configsLoading ? (
					<div className="flex items-center justify-center py-8 text-gray-400">
						<Loader2 size={16} className="animate-spin mr-2" /> Loading…
					</div>
				) : bankConfigs.length === 0 ? (
					<div className="px-4 py-6 text-xs text-gray-400 text-center">
						No bank statement configs yet. Add one to enable auto-detection.
					</div>
				) : filteredConfigs.length === 0 ? (
					<div className="px-4 py-6 text-xs text-gray-400 text-center">
						No configs match “{search}”.
					</div>
				) : (
					<div className="divide-y divide-gray-100">
						{pagedConfigs.map((c) => (
							<div key={c.config_key} className="px-4 py-3">
								{/* Account header */}
								<div className="flex items-baseline gap-2 flex-wrap">
									<span className="text-xs font-bold text-primary font-mono">{c.config_key}</span>
									{c.display_name && (
										<span className="text-[11px] text-gray-600 font-semibold">{c.display_name}</span>
									)}
									{(c.bank || c.currency) && (
										<span className="text-[10px] text-gray-400">
											{[c.bank, c.currency].filter(Boolean).join(" · ")}
										</span>
									)}
								</div>

								{/* Per-format version lists */}
								<div className="mt-2 space-y-2">
									{c.formats.map((f) => (
										<div key={f.format} className="border border-gray-100 rounded-sm bg-gray-50/50">
											<div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-gray-100">
												<span className="text-[9px] font-black uppercase tracking-wide bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-xs">
													{f.format}
												</span>
												<span className="text-[10px] text-gray-400 font-medium">
													{f.versions.length} version{f.versions.length === 1 ? "" : "s"}
												</span>
											</div>
											<ul className="divide-y divide-gray-100">
												{f.versions.map((v) => {
													const isActive = v.version === f.active_version;
													return (
														<li key={v.version} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
															<span className={`font-mono font-bold ${isActive ? "text-primary" : "text-gray-400"}`}>
																v{v.version}
															</span>
															{isActive && (
																<span className="text-[8px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-xs">
																	Active
																</span>
															)}
															<span className="text-gray-500">{fmtTimestamp(v.created_at)}</span>
															{v.created_by && (
																<span className="text-gray-400 ml-auto">added by {v.created_by}</span>
															)}
														</li>
													);
												})}
											</ul>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				)}

				{/* Pagination — only shown once the filtered list exceeds one page */}
				{!configsLoading && pageCount > 1 && (
					<div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-100">
						<span className="text-[10px] text-gray-400 font-medium">
							Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredConfigs.length)} of {filteredConfigs.length}
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
										n === safePage
											? "bg-[#222222] text-white"
											: "text-gray-500 hover:bg-gray-100"
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

				{configSuccess && (
					<div className="px-4 py-2 bg-emerald-50 border-t border-emerald-100 text-xs font-bold text-emerald-700">
						✓ {configSuccess}
					</div>
				)}
			</div>

			{/* Config Builder Wizard — opened after "Add New Config" uploads a file.
			    Saving appends a new version for the detected account + format. */}
			{wizardFile && (
				<ConfigBuilderWizard
					filename={wizardFile}
					onClose={() => setWizardFile(null)}
					onSaved={(configKey) => {
						setWizardFile(null);
						setConfigSuccess(`Config '${configKey}' saved.`);
						fetchBankConfigs();
						setTimeout(() => setConfigSuccess(""), 4000);
					}}
				/>
			)}
		</div>
	);
}