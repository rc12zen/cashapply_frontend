"use client";
/**
 * RowDetailDrawer
 * ---------------
 * Full-screen split-panel detail view for one matched_results row.
 *
 * LEFT PANEL  — Bank info, extraction, aging match, validation rule checks
 * RIGHT PANEL — Remittance email (raw body + per-invoice breakdown) OR
 *               a "No remittance email linked" placeholder
 *
 * Usage:
 *   <RowDetailDrawer recordId={selectedId} onClose={() => setSelectedId(null)} />
 */

import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	FileText,
	Mail,
	MinusCircle,
	RefreshCw,
	ShieldCheck,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { approveEntry, rejectEntry, getRowDetail } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Check {
	rule:   string;
	label:  string;
	status: "passed" | "failed" | "skipped";
	left:   { label: string; value: string | null };
	right:  { label: string; value: string | null };
	extra?: Record<string, any>;
	note:   string;
}

interface RemittanceInvoice {
	invoice_number: string;
	doc_amount:     number | null;
	tds_withheld:   number | null;
	amount_paid:    number | null;
	tds_deducted:   number | null;
}

interface Remittance {
	id:               number;
	filename:         string;
	sender:           string;
	subject:          string;
	customer_name:    string;
	payment_amount:   number;
	payment_currency: string;
	payment_date:     string;
	payment_reference:string;
	invoices:         RemittanceInvoice[];
	raw_body:         string;
}

interface RowDetail {
	id: number;
	bank_info: {
		bank_name: string; statement_date: string; narrative: string;
		bank_account_number: string; credit_amount: number; currency: string;
	};
	extraction: {
		method: string; confidence_score: number;
		extracted_customer: string; extracted_invoice: string;
		all_invoice_numbers: string[]; row_type: string;
	};
	aging_match: {
		matched_customer: string; matched_invoice: string;
		customer_account: string; outstanding_amount: number;
		invoice_currency: string; business_unit: string;
		ou_number: string; aging_ou_number: string;
		matched_invoices: any[];
	};
	validation: {
		status: string; failed_rules: string[];
		result_group: string; checks: Check[];
	};
	remittance: Remittance | null;
	hitl: {
		status: string; oracle_ref: string | null;
		oracle_posted_at: string | null; remittance_status: string | null;
		remittance_ref: string | null; remittance_filename: string | null;
	};
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RuleRow({ check }: { check: Check }) {
	const icon =
		check.status === "passed"  ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> :
		check.status === "failed"  ? <AlertTriangle size={14} className="text-red-500 shrink-0" /> :
		                              <MinusCircle size={14} className="text-gray-300 shrink-0" />;

	const bg =
		check.status === "passed"  ? "bg-emerald-50/60 border-emerald-100" :
		check.status === "failed"  ? "bg-red-50/60 border-red-100" :
		                              "bg-gray-50 border-gray-100";

	return (
		<div className={`border rounded-sm p-3 ${bg}`}>
			<div className="flex items-start gap-2">
				{icon}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1.5">
						<span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{check.rule}</span>
						<span className="text-[11px] font-bold text-primary">{check.label}</span>
					</div>
					<div className="grid grid-cols-2 gap-2 mb-1.5">
						<div>
							<span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">{check.left.label}</span>
							<span className="text-[11px] font-mono font-bold text-primary break-all">{check.left.value || "—"}</span>
						</div>
						<div>
							<span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">{check.right.label}</span>
							<span className="text-[11px] font-mono font-bold text-primary break-all">{check.right.value || "—"}</span>
						</div>
					</div>
					{check.extra && check.rule === "VAL-003" && (
						<div className="flex flex-wrap gap-3 mb-1.5 text-[10px]">
							{check.extra.tds_pct_computed != null && (
								<span className="font-bold">TDS: <span className="font-mono">{Number(check.extra.tds_pct_computed).toFixed(2)}%</span> <span className="text-gray-400">(valid 88–92%)</span></span>
							)}
							{check.extra.diff_pct != null && (
								<span className="font-bold">Diff: <span className="font-mono">{check.extra.diff_pct}%</span></span>
							)}
							{check.extra.confirmed_count != null && (
								<span className="text-gray-500">Confirmed invoices: <span className="font-bold text-emerald-600">{check.extra.confirmed_count}</span></span>
							)}
							{check.extra.missing_count > 0 && (
								<span className="text-gray-500">Missing: <span className="font-bold text-red-500">{check.extra.missing_count}</span></span>
							)}
						</div>
					)}
					<p className={`text-[10px] font-medium ${check.status === "failed" ? "text-red-600" : check.status === "passed" ? "text-emerald-700" : "text-gray-400"}`}>
						{check.note}
					</p>
				</div>
			</div>
		</div>
	);
}

function InfoRow({ label, value, mono = false }: { label: string; value: any; mono?: boolean }) {
	return (
		<div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
			<span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 w-36">{label}</span>
			<span className={`text-[11px] font-bold text-primary text-right break-all ${mono ? "font-mono" : ""}`}>
				{value ?? "—"}
			</span>
		</div>
	);
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
	recordId: number | null;
	onClose:  () => void;
	onApprove?: (id: number) => void;
	onReject?:  (id: number) => void;
}

export default function RowDetailDrawer({ recordId, onClose, onApprove, onReject }: Props) {
	const [detail, setDetail]           = useState<RowDetail | null>(null);
	const [loading, setLoading]         = useState(false);
	const [actionLoading, setActionLoading] = useState(false);
	const [rightTab, setRightTab]       = useState<"email" | "raw">("email");

	useEffect(() => {
		if (!recordId) { setDetail(null); return; }
		setLoading(true);
		setDetail(null);
		getRowDetail(recordId)
			.then((res) => setDetail(res.data))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [recordId]);

	if (!recordId) return null;

	const handleApprove = async () => {
		if (!detail) return;
		setActionLoading(true);
		try {
			await approveEntry(detail.id);
			onApprove?.(detail.id);
			// Refresh detail
			const res = await getRowDetail(detail.id);
			setDetail(res.data);
		} catch {}
		setActionLoading(false);
	};

	const handleReject = async () => {
		if (!detail) return;
		setActionLoading(true);
		try {
			await rejectEntry(detail.id);
			onReject?.(detail.id);
			const res = await getRowDetail(detail.id);
			setDetail(res.data);
		} catch {}
		setActionLoading(false);
	};

	const { flags } = useCurrentUser();
	// A row can only be approved/rejected when BOTH the row's state allows
	// it AND the signed-in user's role actually holds the permission —
	// Analyst can view this drawer but holds neither oracle:post nor
	// hitl:reject (see scripts/seed_rbac.py), so those buttons never show
	// for them even on an otherwise-eligible row. The backend enforces the
	// permission side of this for real either way (require_permission on
	// /api/hitl/approve and /reject) — hiding the button here is just so an
	// Analyst isn't shown an action they'd get a 403 back for.
	const canApprove = detail?.hitl.status !== "approved" && detail?.validation.status === "passed" && flags.canApprove;
	const canReject  = detail?.hitl.status !== "rejected" && flags.canReject;

	// Status badge
	const hitlStatus = detail?.hitl.status;
	const statusColor =
		hitlStatus === "approved" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
		hitlStatus === "rejected" ? "bg-red-100 text-red-700 border-red-200" :
		                             "bg-amber-100 text-amber-700 border-amber-200";

	return (
		/* Full-screen overlay */
		<div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex">
			{/* Panel */}
			<div className="ml-auto w-full max-w-[1200px] h-full bg-white shadow-2xl flex flex-col">

				{/* ── Header ─────────────────────────────────────────────────── */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-[#222222] text-white flex-shrink-0">
					<div className="flex items-center gap-3">
						<button onClick={onClose} className="hover:bg-white/10 rounded-sm p-1 transition-colors cursor-pointer">
							<ArrowLeft size={16} />
						</button>
						<div>
							<h2 className="text-sm font-black uppercase tracking-wider">
								Row Detail — ID {recordId}
							</h2>
							{detail && (
								<p className="text-[10px] text-gray-300 mt-0.5 font-mono">
									{detail.bank_info.narrative?.slice(0, 80)}
								</p>
							)}
						</div>
					</div>

					<div className="flex items-center gap-3">
						{detail && (
							<>
								<span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-sm border ${statusColor}`}>
									{hitlStatus}
								</span>
								{canApprove && (
									<button
										disabled={actionLoading}
										onClick={handleApprove}
										className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-sm transition-colors cursor-pointer disabled:opacity-50"
									>
										<CheckCircle2 size={12} /> Approve & Post
									</button>
								)}
								{canReject && (
									<button
										disabled={actionLoading}
										onClick={handleReject}
										className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-sm transition-colors cursor-pointer disabled:opacity-50"
									>
										<X size={12} /> Reject
									</button>
								)}
							</>
						)}
						<button onClick={onClose} className="hover:bg-white/10 rounded-sm p-1 transition-colors cursor-pointer">
							<X size={18} />
						</button>
					</div>
				</div>

				{/* ── Body ───────────────────────────────────────────────────── */}
				{loading && (
					<div className="flex-1 flex items-center justify-center">
						<RefreshCw size={20} className="text-gray-400 animate-spin" />
						<span className="ml-2 text-xs text-gray-400">Loading detail…</span>
					</div>
				)}

				{!loading && !detail && (
					<div className="flex-1 flex items-center justify-center text-xs text-gray-400">Could not load row detail.</div>
				)}

				{!loading && detail && (
					<div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-x divide-gray-200 overflow-hidden">

						{/* ══════════════════════════════════════════════════════
						    LEFT PANEL — Statement + Extraction + Validation
						    ══════════════════════════════════════════════════════ */}
						<div className="overflow-y-auto p-6 space-y-5">

							{/* Bank Statement Info */}
							<section>
								<h3 className="text-[10px] font-black text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
									<FileText size={12} /> Bank Statement
								</h3>
								<div className="bg-gray-50 border border-gray-200 rounded-sm px-4 py-1">
									<InfoRow label="Bank"           value={detail.bank_info.bank_name} />
									<InfoRow label="Date"           value={detail.bank_info.statement_date} mono />
									<InfoRow label="Account"        value={detail.bank_info.bank_account_number} mono />
									<InfoRow label="Credit Amount"  value={`${Number(detail.bank_info.credit_amount).toLocaleString(undefined,{minimumFractionDigits:2})} ${detail.bank_info.currency}`} mono />
									<InfoRow label="Narrative"      value={detail.bank_info.narrative} />
								</div>
							</section>

							{/* AI Extraction */}
							<section>
								<h3 className="text-[10px] font-black text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
									<ShieldCheck size={12} /> AI Extraction
								</h3>
								<div className="bg-gray-50 border border-gray-200 rounded-sm px-4 py-1">
									<InfoRow label="Method"         value={detail.extraction.method} />
									<InfoRow label="Confidence"     value={detail.extraction.confidence_score ? `${(detail.extraction.confidence_score * 100).toFixed(0)}%` : "—"} />
									<InfoRow label="Customer"       value={detail.extraction.extracted_customer} />
									<InfoRow label="Invoice(s)"     value={detail.extraction.all_invoice_numbers.join(", ")} mono />
									<InfoRow label="Row Type"       value={detail.extraction.row_type} />
								</div>
							</section>

							{/* Aging Match */}
							<section>
								<h3 className="text-[10px] font-black text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
									<ShieldCheck size={12} /> Aging Match
								</h3>
								<div className="bg-gray-50 border border-gray-200 rounded-sm px-4 py-1">
									<InfoRow label="Customer"       value={detail.aging_match.matched_customer} />
									<InfoRow label="Cust. Account"  value={detail.aging_match.customer_account} mono />
									<InfoRow label="Invoice"        value={detail.aging_match.matched_invoice} mono />
									<InfoRow label="Outstanding"    value={detail.aging_match.outstanding_amount ? `${Number(detail.aging_match.outstanding_amount).toLocaleString(undefined,{minimumFractionDigits:2})} ${detail.aging_match.invoice_currency}` : "—"} mono />
									<InfoRow label="Business Unit"  value={detail.aging_match.business_unit} />
									<InfoRow label="OU / SEGMENT1"  value={`${detail.aging_match.ou_number} → aging: ${detail.aging_match.aging_ou_number}`} mono />
								</div>

								{/* Multi-invoice breakdown */}
								{detail.aging_match.matched_invoices?.length > 1 && (
									<div className="mt-2 border border-gray-200 rounded-sm overflow-hidden">
										<div className="bg-gray-100 px-3 py-1.5 text-[9px] font-black text-gray-500 uppercase tracking-wider">
											All matched invoices ({detail.aging_match.matched_invoices.length})
										</div>
										<table className="w-full text-[10px]">
											<thead>
												<tr className="bg-gray-50 border-b border-gray-200">
													{["Invoice","Customer","Outstanding","CCY","OU"].map((h) => (
														<th key={h} className="px-3 py-1.5 text-left text-[9px] font-black text-gray-400 uppercase tracking-wider">{h}</th>
													))}
												</tr>
											</thead>
											<tbody className="divide-y divide-gray-100">
												{detail.aging_match.matched_invoices.map((inv: any, i: number) => (
													<tr key={i} className="hover:bg-gray-50">
														<td className="px-3 py-1.5 font-mono font-bold text-primary">{inv.invoice}</td>
														<td className="px-3 py-1.5 text-gray-600">{inv.customer}</td>
														<td className="px-3 py-1.5 font-mono text-right">{Number(inv.outstanding||0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
														<td className="px-3 py-1.5 text-gray-400">{inv.currency}</td>
														<td className="px-3 py-1.5 text-gray-500">{inv.ou_number}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}
							</section>

							{/* Validation Checks */}
							<section>
								<h3 className="text-[10px] font-black text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
									<ShieldCheck size={12} /> Validation Rules
									<span className={`ml-1 px-2 py-0.5 rounded-full text-[9px] font-black border ${
										detail.validation.status === "passed"
											? "bg-emerald-50 text-emerald-700 border-emerald-200"
											: "bg-red-50 text-red-700 border-red-200"
									}`}>
										{detail.validation.status.toUpperCase()}
									</span>
								</h3>
								<div className="space-y-2">
									{detail.validation.checks.map((check) => (
										<RuleRow key={check.rule} check={check} />
									))}
								</div>
							</section>

							{/* Oracle Status */}
							{detail.hitl.oracle_ref && (
								<section>
									<h3 className="text-[10px] font-black text-primary uppercase tracking-wider mb-2">Oracle Fusion</h3>
									<div className="bg-emerald-50 border border-emerald-200 rounded-sm px-4 py-1">
										<InfoRow label="Transaction Ref" value={detail.hitl.oracle_ref} mono />
										<InfoRow label="Posted At"       value={detail.hitl.oracle_posted_at} mono />
									</div>
								</section>
							)}
						</div>

						{/* ══════════════════════════════════════════════════════
						    RIGHT PANEL — Remittance Email
						    ══════════════════════════════════════════════════════ */}
						<div className="flex flex-col overflow-hidden">
							<div className="flex items-center gap-2 px-6 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
								<Mail size={13} className="text-[#222222]" />
								<span className="text-[10px] font-black text-primary uppercase tracking-wider">
									Remittance Email
								</span>
								{detail.remittance && (
									<div className="ml-auto flex items-center gap-1 bg-white border border-gray-200 rounded-sm p-0.5">
										<button
											onClick={() => setRightTab("email")}
											className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${rightTab === "email" ? "bg-[#222222] text-white" : "text-gray-500 hover:text-primary"}`}
										>
											Parsed
										</button>
										<button
											onClick={() => setRightTab("raw")}
											className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${rightTab === "raw" ? "bg-[#222222] text-white" : "text-gray-500 hover:text-primary"}`}
										>
											Raw Body
										</button>
									</div>
								)}
							</div>

							{!detail.remittance ? (
								/* No remittance linked */
								<div className="flex-1 flex flex-col items-center justify-center text-center p-8">
									<Mail size={40} className="text-gray-200 mb-3" />
									<p className="text-xs font-black text-gray-400 uppercase tracking-wider">No Remittance Email Linked</p>
									<p className="text-[11px] text-gray-400 mt-1 max-w-xs leading-relaxed">
										{detail.hitl.remittance_status === "no_remittance"
											? "No matching remittance email was found for this payment. Upload one via the Remittance tab."
											: detail.hitl.remittance_status === "not_checked"
											? "Remittance check was not performed (invoice not matched in aging)."
											: `Status: ${detail.hitl.remittance_status || "unknown"}`}
									</p>
								</div>
							) : rightTab === "email" ? (
								/* Parsed remittance view */
								<div className="flex-1 overflow-y-auto p-6 space-y-5">
									{/* Header metadata */}
									<div className="bg-blue-50 border border-blue-100 rounded-sm px-4 py-1">
										<InfoRow label="File"         value={detail.remittance.filename} mono />
										<InfoRow label="From"         value={detail.remittance.sender} />
										<InfoRow label="Subject"      value={detail.remittance.subject} />
										<InfoRow label="Customer"     value={detail.remittance.customer_name} />
										<InfoRow label="Payment Date" value={detail.remittance.payment_date} mono />
										<InfoRow label="Reference"    value={detail.remittance.payment_reference} mono />
										<InfoRow label="Amount"       value={`${Number(detail.remittance.payment_amount||0).toLocaleString(undefined,{minimumFractionDigits:2})} ${detail.remittance.payment_currency}`} mono />
									</div>

									{/* Per-invoice breakdown */}
									{detail.remittance.invoices?.length > 0 && (
										<section>
											<h4 className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-2">
												Invoice Breakdown ({detail.remittance.invoices.length})
											</h4>
											<div className="border border-gray-200 rounded-sm overflow-hidden">
												<table className="w-full text-[10px]">
													<thead>
														<tr className="bg-[#222222] text-white">
															{["Invoice","Doc Amount","TDS Withheld","Amount Paid","TDS Deducted"].map((h) => (
																<th key={h} className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">{h}</th>
															))}
														</tr>
													</thead>
													<tbody className="divide-y divide-gray-100">
														{detail.remittance.invoices.map((inv: RemittanceInvoice, i: number) => {
															const isThisInvoice = detail.extraction.all_invoice_numbers.includes(inv.invoice_number);
															return (
																<tr key={i} className={`${isThisInvoice ? "bg-blue-50/50" : "hover:bg-gray-50"}`}>
																	<td className="px-3 py-2 font-mono font-bold text-primary">
																		{inv.invoice_number}
																		{isThisInvoice && (
																			<span className="ml-1.5 text-[8px] bg-blue-100 text-blue-700 font-black px-1 py-0.5 rounded-xs">THIS ROW</span>
																		)}
																	</td>
																	<td className="px-3 py-2 font-mono text-right">{inv.doc_amount != null ? Number(inv.doc_amount).toLocaleString(undefined,{minimumFractionDigits:2}) : "—"}</td>
																	<td className="px-3 py-2 font-mono text-right text-amber-700">{inv.tds_withheld != null ? Number(inv.tds_withheld).toLocaleString(undefined,{minimumFractionDigits:2}) : "—"}</td>
																	<td className="px-3 py-2 font-mono text-right text-emerald-700">{inv.amount_paid != null ? Number(inv.amount_paid).toLocaleString(undefined,{minimumFractionDigits:2}) : "—"}</td>
																	<td className="px-3 py-2 font-mono text-right text-red-600">{inv.tds_deducted != null ? Number(inv.tds_deducted).toLocaleString(undefined,{minimumFractionDigits:2}) : "—"}</td>
																</tr>
															);
														})}
													</tbody>
												</table>
											</div>
										</section>
									)}
								</div>
							) : (
								/* Raw email body */
								<div className="flex-1 overflow-y-auto p-4">
									<pre className="text-[10px] font-mono text-gray-600 leading-relaxed whitespace-pre-wrap break-words bg-gray-50 border border-gray-200 rounded-sm p-4">
										{detail.remittance.raw_body || "No body content available."}
									</pre>
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}