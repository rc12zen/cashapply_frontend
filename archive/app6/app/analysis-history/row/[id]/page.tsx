"use client";
/**
 * Row Detail — /app/analysis-history/row/[id]/page.tsx
 *
 * Changes from base version:
 *  - Header: breadcrumb (Date · Run ID · Category · Row ID), no narrative
 *  - Special flags banner: Acceptable Short Payment / Cross Currency /
 *    Cross Ledger / Cross Entity — shown above Card 1 when applicable
 *  - Card 1: Statement date shown, Amount Credited prominent
 *  - Card 2: smart empty states (not attempted vs not found)
 *  - Card 3: Aging snapshot (only when invoices matched)
 *  - Card 4: Why this status — reason sentence + amount comparison
 *  - Card 5: Oracle payload — shown for ready_for_oracle / processed /
 *    post_failed; "not generated" state for others
 *  - Approve & Post: only for ready_for_oracle category
 *  - Reject: allowed for any non-terminal identified row
 *  - Remittance panel: right side, collapsed by default, auto-opens when found
 *  - Bug fix: hitl / validation fields removed — status derived from oracle.*
 *
 *  - NEW: Manual Invoice Mapping card — shown for any row that is NOT
 *    already ready_for_oracle or processed (unidentified, needs_remittance,
 *    conflict_exception, post_failed, rejected). Lets a SPOC hand-pick
 *    invoice(s) from the currently-loaded aging report; amounts are
 *    ALWAYS auto-loaded from the aging report, never typed. Confirming a
 *    qualifying selection only RE-CLASSIFIES the row into ready_for_oracle
 *    — it does NOT post to Oracle. The existing Approve & Post button
 *    (already built above) is what actually posts, once the row shows up
 *    there — same two-gate model as an automatic match.
 *    Backend: hitl/manual_mapping.py via /api/hitl/{id}/mapping-*.
 */
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Loader2,
  Mail, X, ZapIcon, ChevronLeft, Building2,
  User, Hash, Banknote, Check, FileText, Info,
  ArrowRightLeft, Layers, GitBranch, RefreshCw, Download,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  approveEntry, rejectEntry, retryOracle, getRowDetail, recheckRemittance,
  getMappingOptions, getInvoicesForCustomer, previewManualMapping, confirmManualMapping,
  downloadStorageFile,
} from "@/lib/api";

import { getErrorMessage } from "@/lib/errorMessage";

// The backend now normalizes every error (including FastAPI's own 422
// validation errors) into { title, message } server-side — see
// app/common/errors.py. This just delegates to the shared helper; kept as
// a named wrapper so call sites below didn't all need renaming.
function formatApiError(e: any, fallback = "Action failed."): string {
  return getErrorMessage(e, fallback);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConfirmedInvoice {
  invoice_number:     string;
  customer_name:      string | null;
  outstanding_amount: number | null;
  currency:           string | null;
  ou_number:          string | null;
  ou_display_name?:   string | null;  // e.g. "DALLAS(205)" — resolved OU the invoice actually belongs to
  invoice_date:       string | null;
  remittance_amount:  number | null;
  computed_amount:    number | null;
}

interface RowDetail {
  id:              number;
  run_id?:         number;
  status:          string;
  category?:       string;       // "ready_for_oracle" | "conflict_exception" | …
  category_label?: string;       // "Ready for Oracle" | …
  // Special flags from LineItem (added by patched build_row_detail)
  is_cross_currency?: boolean;   // credited currency != invoice currency
  is_cross_ledger?:   boolean;   // invoice currency != OU functional currency
  is_cross_ou?:       boolean;   // payment landed in different OU than invoice
  // PATCH: persistent record of whether THIS row's current invoice mapping
  // came from a SPOC manually picking invoice(s) via the Manual Invoice
  // Mapping card, vs automatic AI/regex extraction or an automatic aging
  // match. Backend: LineItem.manually_mapped (see db/models.py).
  manually_mapped?:    boolean;
  manually_mapped_at?: string | null;
  manually_mapped_by?: string | null;
  bank_statement: {
    bank_name:           string;
    statement_date:      string | null;
    narrative:           string;
    bank_account_number: string;
    bank_reference:      string | null;
    credit_amount:       number;
    currency:            string;
    business_unit:       string;
    ou_number:           string;
    ou_display_name?:    string | null;  // e.g. "PUNE(111)" — resolved OU that RECEIVED the payment
  };
  extraction: {
    method:              string | null;
    confidence_score:    number | null;
    extracted_customer:  string | null;
    primary_invoice:     string | null;
    all_invoice_numbers: string[];
    row_type:            string | null;
    is_matched:          boolean;
  };
  confirmed_invoices: ConfirmedInvoice[];
  sum_outstanding:    number;
  credit_amount:      number;
  pipeline:           any[];
  oracle: {
    payload:             Record<string, any>;
    remittance_scenario: string | null;
    remittance_status:   string | null;
    hitl_status:         string | null;
    post_status:         string | null;
    // PATCH: post_status (above) is the invoice-mapping outcome
    // (reference_status on the backend) — it means "fully done, posted
    // with real invoice mapping". receipt_creation_status means only "a
    // bare receipt exists" — every row gets one during reconciliation,
    // regardless of category. Don't conflate the two — see the READY
    // badge logic below, which used to only check whether *a* payload
    // existed (always true now) instead of what it actually represents.
    receipt_creation_status?: string | null;
    post_message:        string | null;
    oracle_ref_no:       string | null;
    oracle_status_code:  string | null;
    standard_receipt_id: string | null;
    oracle_posted_at:    string | null;
    // Present on newer backend builds — the actual Oracle response bodies.
    receipt_response_raw?:   Record<string, any> | null;
    reference_response_raw?: any[] | null;
  };
  remittance: {
    subject?:           string | null;
    payer?:             string | null;
    sender?:            string | null;
    customer_name?:     string | null;
    payment_reference?: string | null;
    payment_date?:      string | null;
    payment_amount?:    number | null;
    payment_currency?:  string | null;
    storage_key?:       string | null;
    invoices?:          any[];
    raw_body?:          string | null;
    filename?:          string | null;
    // Real, fetchable link for the original .msg/.pdf/.eml App2 archived —
    // see bff/storage_routes.py. Null when no file was ever stored for
    // this extraction (shouldn't normally happen, but the panel handles it).
    download_url?:      string | null;
  } | null;
}

// ── Manual invoice mapping types ─────────────────────────────────────────────

interface MappingInvoiceOption {
  invoice_number:     string;
  outstanding_amount: number;
  currency:           string | null;
  ou_number:          string | null;
  customer_name:      string | null;
  customer_number:    string | null;
}

interface MappingOptionsResponse {
  customer_identified: boolean;
  customer_name:       string | null;
  customers?:          string[];
  invoices:            MappingInvoiceOption[];
}

interface MappingPreviewResponse {
  qualifies:       boolean;
  tag:             string | null;
  rule_id:         string;
  reason_code:     string;
  message:         string;
  target_total:    number;
  received_total:  number;
  shortfall_pct:   number;
}

// ── Reason-code → plain English ───────────────────────────────────────────────

const REASON_SENTENCES: Record<string, { text: string; tone: "ok" | "warn" | "error" | "info" }> = {
  EXACT_MATCH:              { tone: "ok",    text: "Payment exactly covers the invoice outstanding. Ready to post." },
  ACCEPTABLE_SHORT_PAYMENT: { tone: "ok",    text: "Payment is slightly below the invoice outstanding, but within the accepted short-payment tolerance. Posting is allowed." },
  UNEXPLAINED_SHORTAGE:     { tone: "warn",  text: "Payment falls short of the invoice outstanding beyond the accepted tolerance. SPOC review is required." },
  OVERPAYMENT_UNEXPLAINED:  { tone: "warn",  text: "Payment exceeds the invoice outstanding. All overpayments require SPOC review before posting." },
  CUSTOMER_ONLY_NO_REMIT:   { tone: "info",  text: "Customer was identified but no invoice number was found. Waiting for the customer to send a remittance advice." },
  NO_SIGNAL:                { tone: "error", text: "Nothing could be extracted — no customer name or invoice number was found in the payment narrative." },
  CUSTOMER_CONFLICT:        { tone: "error", text: "The customer on the remittance does not match who the aging report shows as the invoice owner." },
  INVOICE_CUSTOMER_MISMATCH:{ tone: "error", text: "An invoice was found but the customer does not match the aging record. Payment may be applied to the wrong account." },
  AMBIGUOUS_REMITTANCE:     { tone: "error", text: "More than one remittance email matches this payment. SPOC must select the correct one." },
  INVOICE_NOT_IN_AGING:     { tone: "error", text: "The invoice number found in the narrative does not appear in the aging report — it may be closed, paid, or misquoted." },
  POSSIBLE_DUPLICATE_PAYMENT:{ tone: "error", text: "This payment matches an invoice that has already been posted. SPOC must confirm it is not a duplicate." },
  CROSS_CUSTOMER_SPLIT:     { tone: "warn",  text: "The remittance lists invoices across more than one customer. A manual split is required before posting." },
  FX_RATE_MISSING:          { tone: "warn",  text: "Payment and invoice are in different currencies but no exchange rate could be resolved. A rate must be provided before posting." },
  WRONG_OU_PAYMENT:         { tone: "error", text: "The customer's invoices are in a different business unit than the bank account that received this payment. The receipt must be re-routed." },
  WRONG_OU_SPLIT_REQUIRED:  { tone: "error", text: "An invoice was matched but it belongs to a different business unit. The posting must be re-routed to the correct entity." },
  DUPLICATE_INVOICE_NO:     { tone: "error", text: "The invoice number appears against more than one customer in the aging report. The match is ambiguous." },
};

function getReasonConfig(code: string | null | undefined) {
  if (!code) return { text: "No evaluation result available for this payment.", tone: "info" as const };
  return REASON_SENTENCES[code] || {
    text: code.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase()),
    tone: "warn" as const,
  };
}

// ── Status derivation ─────────────────────────────────────────────────────────

function deriveStatus(oracle: RowDetail["oracle"]) {
  if (oracle.post_status === "success")   return "processed";
  if (oracle.hitl_status === "rejected")  return "rejected";
  if (oracle.post_status === "failed")    return "post_failed";
  if (oracle.hitl_status === "approved")  return "approved";
  return "pending";
}

const STATUS_CHIP: Record<string, string> = {
  processed:  "bg-emerald-100 text-emerald-700 border-emerald-300",
  rejected:   "bg-red-100 text-red-700 border-red-300",
  post_failed:"bg-amber-100 text-amber-700 border-amber-300",
  approved:   "bg-blue-100 text-blue-700 border-blue-300",
  pending:    "bg-gray-100 text-gray-600 border-gray-300",
};
const STATUS_LABEL: Record<string, string> = {
  processed: "Processed", rejected: "Rejected",
  post_failed: "Post Failed", approved: "Approved", pending: "Pending",
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dp = 2) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function DataRow({ label, value, mono = false }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 pt-0.5 min-w-[120px]">{label}</span>
      <span className={`text-[11px] font-semibold text-gray-800 text-right break-all leading-snug ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
      {children}
    </div>
  );
}

function CardHead({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/70">
      <div className="flex items-center gap-2.5">
        <span className="text-[#222222]">{icon}</span>
        <span className="text-[10px] font-black text-[#222222] uppercase tracking-widest">{title}</span>
      </div>
      {right}
    </div>
  );
}

// ── Remittance panel ──────────────────────────────────────────────────────────

function RemittancePanel({ remittance, allInvoiceNumbers, remittanceStatus, collapsed, onToggle }: {
  remittance: RowDetail["remittance"];
  allInvoiceNumbers: string[];
  remittanceStatus: string | null | undefined;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [tab, setTab] = useState<"parsed" | "raw">("parsed");
  const [downloading, setDownloading] = useState(false);
  const hasRemittance = !!remittance;

  const handleDownloadOriginal = async () => {
    if (!remittance?.download_url || downloading) return;
    setDownloading(true);
    try {
      const res = await downloadStorageFile(remittance.download_url);
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = remittance.filename || "remittance-email";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Best-effort — the panel doesn't have its own error banner, so this
      // fails silently rather than crashing the row-detail page. Retriable
      // by clicking again.
    }
    setDownloading(false);
  };

  return (
    <div className={`flex flex-col h-full border-l border-gray-200 bg-white transition-all duration-200 flex-shrink-0 ${collapsed ? "w-11" : "w-[320px]"}`}>
      {/* Toggle header */}
      <button onClick={onToggle}
        className="flex items-center justify-center gap-2 px-3 py-3.5 bg-[#222222] hover:bg-[#222222] transition-colors cursor-pointer flex-shrink-0 w-full">
        {collapsed ? (
          <Mail size={14} className={hasRemittance ? "text-emerald-400" : "text-white/40"} />
        ) : (
          <>
            <Mail size={12} className={hasRemittance ? "text-emerald-400" : "text-white/40"} />
            <span className="text-[9px] font-black text-white uppercase tracking-widest flex-1 text-left">Remittance</span>
            {hasRemittance && <span className="bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">Found</span>}
            <ChevronLeft size={12} className="text-white/50" />
          </>
        )}
      </button>

      {!collapsed && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {!remittance ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10 gap-4">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <Mail size={20} className="text-gray-300" />
              </div>
              <div>
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-1">No Remittance Email</p>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  {remittanceStatus === "not_checked"
                    ? "Remittance check skipped — no invoice was matched."
                    : "No matching email found for this payment."}
                </p>
              </div>
              {allInvoiceNumbers.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xs px-3 py-2.5 text-left w-full">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-2">Searched for</p>
                  {allInvoiceNumbers.map(inv => <p key={inv} className="font-mono text-[10px] text-gray-600">{inv}</p>)}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 bg-gray-50 space-y-2">
                <div className="flex gap-1 bg-white border border-gray-200 rounded-xs p-0.5">
                  {(["parsed", "raw"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                      className={`flex-1 py-1 text-[9px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${tab === t ? "bg-[#222222] text-white" : "text-gray-500 hover:text-[#222222]"}`}>
                      {t}
                    </button>
                  ))}
                </div>
                {remittance.download_url && (
                  <button
                    onClick={handleDownloadOriginal}
                    disabled={downloading}
                    className="w-full flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[#222222] hover:text-[#222222] border border-gray-200 hover:border-[#222222] rounded-xs py-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {downloading ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                    {downloading ? "Downloading…" : "Download Original Email"}
                  </button>
                )}
              </div>
              {tab === "parsed" ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="bg-blue-50/60 border border-blue-100 rounded-xs px-3">
                    <DataRow label="Subject"   value={remittance.subject} />
                    <DataRow label="From"      value={remittance.sender || remittance.payer} />
                    <DataRow label="Customer"  value={remittance.customer_name || remittance.payer} />
                    <DataRow label="Date"      value={fmtDate(remittance.payment_date)} mono />
                    <DataRow label="Reference" value={remittance.payment_reference} mono />
                    <DataRow label="Amount"
                      value={remittance.payment_amount != null ? `${fmt(remittance.payment_amount)} ${remittance.payment_currency || ""}` : null}
                      mono />
                  </div>
                  {(remittance.invoices || []).length > 0 && (
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-2">
                        Invoices in email — {remittance.invoices!.length}
                      </p>
                      <div className="border border-gray-200 rounded-xs overflow-hidden">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="bg-[#222222] text-white">
                              <th className="px-2.5 py-2 text-left text-[9px] font-black uppercase tracking-wider">Invoice #</th>
                              <th className="px-2.5 py-2 text-right text-[9px] font-black uppercase tracking-wider">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {remittance.invoices!.map((inv: any, i: number) => {
                              const isThis = allInvoiceNumbers.includes(inv.invoice_number);
                              return (
                                <tr key={i} className={isThis ? "bg-blue-50" : "hover:bg-gray-50"}>
                                  <td className="px-2.5 py-2 font-mono font-bold text-[#222222]">
                                    {inv.invoice_number}
                                    {isThis && <span className="ml-1 text-[8px] bg-blue-100 text-blue-700 font-black px-1 py-0.5 rounded-xs">this row</span>}
                                  </td>
                                  <td className="px-2.5 py-2 font-mono text-right text-emerald-700 font-bold">
                                    {inv.amount_paid != null ? fmt(inv.amount_paid) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4">
                  <pre className="text-[9px] font-mono text-gray-600 leading-relaxed whitespace-pre-wrap break-words bg-gray-50 border border-gray-200 rounded-xs p-3">
                    {remittance.raw_body || "No body content."}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Oracle payload table ──────────────────────────────────────────────────────

function OraclePayloadTable({ payload, creditAmount }: { payload: Record<string, any>; creditAmount: number }) {
  const refs = (payload.remittanceReferences || []) as any[];
  const topFields = Object.entries(payload).filter(([k]) => k !== "remittanceReferences" && !k.startsWith("_"));
  const auditFields = Object.entries(payload).filter(([k]) => k.startsWith("_"));
  const sumRefs = refs.reduce((s, r) => s + Number(r.ReferenceAmount || 0), 0);
  const sumOk = refs.length === 0 || Math.abs(sumRefs - creditAmount) < 0.02;

  return (
    <div className="space-y-5">
      {/* Top-level fields grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {topFields.map(([k, v]) => (
          <div key={k} className="bg-gray-50 border border-gray-200 rounded-xs px-3 py-2.5">
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{k}</div>
            <div className="text-[11px] font-mono font-bold text-[#222222] break-all">{v == null ? "—" : String(v)}</div>
          </div>
        ))}
      </div>

      {/* remittanceReferences table */}
      {refs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Invoice References</span>
            <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border ${sumOk ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
              Σ {fmt(sumRefs)} {sumOk ? "✓ balanced" : "✗ mismatch"}
            </span>
          </div>
          <div className="border border-gray-200 rounded-xs overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-[#222222] text-white">
                  <th className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-wider">Invoice #</th>
                  <th className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-wider">Match By</th>
                  <th className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-wider">Reference Amount</th>
                  <th className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-wider">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {refs.map((ref, i) => (
                  <tr key={i} className="hover:bg-blue-50/30">
                    <td className="px-3 py-2.5 font-mono font-bold text-[#222222]">{ref.ReferenceNumber}</td>
                    <td className="px-3 py-2.5 text-gray-500">{ref.ReceiptMatchBy}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-right text-[#222222]">{fmt(Number(ref.ReferenceAmount))}</td>
                    <td className="px-3 py-2.5 font-mono text-right text-gray-400 text-[10px]">
                      {creditAmount > 0 ? `${((Number(ref.ReferenceAmount) / creditAmount) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase tracking-wider">Total</td>
                  <td className={`px-3 py-2 font-mono font-black text-right ${sumOk ? "text-emerald-700" : "text-red-600"}`}>{fmt(sumRefs)}</td>
                  <td className="px-3 py-2 font-mono text-right text-gray-400 text-[10px]">
                    {creditAmount > 0 ? `${((sumRefs / creditAmount) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Audit / FX fields collapsed */}
      {auditFields.length > 0 && (
        <details className="text-[10px]">
          <summary className="cursor-pointer font-bold text-gray-400 uppercase tracking-wider select-none">FX / Audit detail</summary>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {auditFields.map(([k, v]) => (
              <div key={k} className="bg-gray-50 border border-gray-200 rounded-xs px-3 py-2">
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{k}</div>
                <div className="text-[10px] font-mono font-bold text-gray-600 break-all">
                  {v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Raw JSON viewer (collapsible) ────────────────────────────────────────────
// Used for the actual Oracle response bodies — receipt creation + invoice
// mapping — which the older OraclePayloadTable above doesn't cover (that
// table renders the OUTBOUND request payload; this renders what Oracle
// actually sent BACK).

function RawResponseViewer({ title, data }: { title: string; data: any }) {
  const [open, setOpen] = useState(false);
  // PATCH: this used to `return null` entirely when data was missing —
  // which looked exactly like the section didn't exist at all, with zero
  // indication anything was ever supposed to be here. Now always renders
  // the header; only the expand behavior changes based on whether data
  // is actually present.
  const hasData = data != null;
  return (
    <div className="border border-gray-200 rounded-xs overflow-hidden">
      <button
        onClick={() => hasData && setOpen(v => !v)}
        disabled={!hasData}
        className={`w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 transition-colors ${hasData ? "hover:bg-gray-100 cursor-pointer" : "cursor-default"}`}
      >
        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">{title}</span>
        <span className={`text-[9px] font-bold ${hasData ? "text-gray-400" : "text-gray-300 italic"}`}>
          {hasData ? (open ? "Hide" : "Show") : "Not recorded for this row"}
        </span>
      </button>
      {!hasData && (
        <p className="px-4 py-2.5 text-[9px] text-gray-400 leading-relaxed border-t border-gray-100">
          This row's receipt/mapping ran before this response was being saved, or that step hasn't run yet.
        </p>
      )}
      {open && (
        <pre className="text-[9px] font-mono text-gray-600 leading-relaxed whitespace-pre-wrap break-words bg-white p-3 max-h-[320px] overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RowDetailPage() {
  const params       = useParams();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const recordId     = Number(params?.id);
  const runIdParam   = searchParams.get("run_id");

  const [detail, setDetail]               = useState<RowDetail | null>(null);
  const [loading, setLoading]             = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError]     = useState("");
  const [remittanceCollapsed, setRemittanceCollapsed] = useState(true);

  // ── Manual invoice mapping state ────────────────────────────────────────────
  const [mappingOptions, setMappingOptions]             = useState<MappingOptionsResponse | null>(null);
  const [mappingOptionsLoading, setMappingOptionsLoading] = useState(false);
  const [mappingOptionsError, setMappingOptionsError]   = useState("");
  const [selectedCustomerForMapping, setSelectedCustomerForMapping] = useState("");
  const [customerInvoiceOptions, setCustomerInvoiceOptions]         = useState<MappingInvoiceOption[]>([]);
  const [selectedInvoiceNumbers, setSelectedInvoiceNumbers]         = useState<Set<string>>(new Set());
  const [mappingPreview, setMappingPreview]             = useState<MappingPreviewResponse | null>(null);
  const [mappingPreviewError, setMappingPreviewError]   = useState("");
  const [mappingPreviewLoading, setMappingPreviewLoading] = useState(false);
  const [confirmMappingLoading, setConfirmMappingLoading] = useState(false);
  const [confirmMappingError, setConfirmMappingError]   = useState("");
  // PATCH: whether the invoice picker is expanded even though this row is
  // already manually mapped. Starts collapsed — see the "already mapped"
  // summary block in CARD 2.5 below, which is the fix for the picker
  // re-appearing blank after a successful confirm with no indication
  // anything had happened.
  const [showRemapPicker, setShowRemapPicker] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    try { const res = await getRowDetail(recordId); setDetail(res.data); }
    catch { setDetail(null); }
    setLoading(false);
  }, [recordId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);
  useEffect(() => { setShowRemapPicker(false); }, [recordId]);

  // Auto-open remittance panel when one was found
  useEffect(() => { if (detail?.remittance) setRemittanceCollapsed(false); }, [detail?.remittance]);

  // Whether this row is even eligible for manual mapping — anything NOT
  // already ready_for_oracle or processed. Computed early so both the
  // fetch effect and the render below can use it.
  const canManuallyMap = !!detail
    && detail.category !== "ready_for_oracle"
    && detail.category !== "processed";

  const fetchMappingOptions = useCallback(async () => {
    if (!recordId) return;
    setMappingOptionsLoading(true);
    setMappingOptionsError("");
    setSelectedCustomerForMapping("");
    setSelectedInvoiceNumbers(new Set());
    setMappingPreview(null);
    try {
      const res = await getMappingOptions(recordId);
      setMappingOptions(res.data);
      setCustomerInvoiceOptions(res.data.customer_identified ? (res.data.invoices || []) : []);
    } catch (e: any) {
      setMappingOptionsError(formatApiError(e, "Could not load invoice mapping options."));
    }
    setMappingOptionsLoading(false);
  }, [recordId]);

  // Fetch mapping options once the row is loaded and known to be eligible.
  useEffect(() => {
    if (canManuallyMap) fetchMappingOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, detail?.category]);

  const handleSelectCustomerForMapping = async (customerName: string) => {
    setSelectedCustomerForMapping(customerName);
    setSelectedInvoiceNumbers(new Set());
    setMappingPreview(null);
    setMappingOptionsError("");
    if (!customerName) { setCustomerInvoiceOptions([]); return; }
    try {
      const res = await getInvoicesForCustomer(recordId, customerName);
      setCustomerInvoiceOptions(res.data.invoices || []);
    } catch (e: any) {
      setMappingOptionsError(formatApiError(e, "Could not load invoices for that customer."));
    }
  };

  const toggleInvoiceForMapping = (invoiceNumber: string) => {
    setSelectedInvoiceNumbers(prev => {
      const next = new Set(prev);
      if (next.has(invoiceNumber)) next.delete(invoiceNumber); else next.add(invoiceNumber);
      return next;
    });
  };

  // Re-run the qualification preview every time the selection changes.
  useEffect(() => {
    if (selectedInvoiceNumbers.size === 0) { setMappingPreview(null); setMappingPreviewError(""); return; }
    let cancelled = false;
    setMappingPreviewLoading(true);
    setMappingPreviewError("");
    previewManualMapping(recordId, Array.from(selectedInvoiceNumbers))
      .then(res => { if (!cancelled) setMappingPreview(res.data); })
      .catch((e: any) => { if (!cancelled) { setMappingPreview(null); setMappingPreviewError(formatApiError(e, "Could not evaluate this selection.")); } })
      .finally(() => { if (!cancelled) setMappingPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selectedInvoiceNumbers, recordId]);

  const handleConfirmMapping = async () => {
    if (selectedInvoiceNumbers.size === 0 || !mappingPreview?.qualifies) return;
    setConfirmMappingLoading(true);
    setConfirmMappingError("");
    try {
      await confirmManualMapping(recordId, Array.from(selectedInvoiceNumbers));
      setSelectedInvoiceNumbers(new Set());
      setMappingPreview(null);
      setMappingOptions(null);
      // PATCH: was "row's category should now be ready_for_oracle — this
      // card disappears" — true for a fresh unidentified/needs_remittance/
      // conflict_exception row, but NOT for a post_failed/rejected row
      // being re-mapped: bff/metrics.py's _category_for_row() lets a
      // terminal reference_status ("failed"/rejected hitl_status) override
      // rule_id permanently, so category stays post_failed/rejected even
      // after a valid re-map. This card now stays mounted either way and
      // shows the "already mapped" summary below instead — see
      // alreadyMapped/showRemapPicker.
      setShowRemapPicker(false);
      await fetchDetail();
    } catch (e: any) {
      setConfirmMappingError(formatApiError(e, "Could not confirm this mapping."));
    }
    setConfirmMappingLoading(false);
  };

  const goBack = () => {
    if (runIdParam) router.push(`/analysis-history?run_id=${runIdParam}`);
    else router.back();
  };

  const handleApprove = async () => {
    if (!detail) return;
    setActionLoading(true); setActionError("");
    try { await approveEntry(recordId); await fetchDetail(); }
    catch (e: any) { setActionError(formatApiError(e)); }
    setActionLoading(false);
  };

  const handleReject = async () => {
    if (!detail) return;
    setActionLoading(true); setActionError("");
    try { await rejectEntry(recordId); await fetchDetail(); }
    catch (e: any) { setActionError(formatApiError(e)); }
    setActionLoading(false);
  };

  const handleRetry = async () => {
    if (!detail) return;
    setActionLoading(true); setActionError("");
    try {
      const res = await retryOracle(recordId);
      // retry_oracle_post() returns {error: "..."} (200 OK) rather than
      // throwing when the row isn't eligible — surface that too.
      if (res.data?.error) setActionError(res.data.error);
      await fetchDetail();
    } catch (e: any) { setActionError(formatApiError(e, "Retry failed.")); }
    setActionLoading(false);
  };

  // Manual counterpart to the periodic remittance_recheck_worker — lets a
  // SPOC re-check THIS row on demand ("the customer just told me they
  // sent it") instead of waiting for the next scheduled sweep. Only ever
  // does anything for a needs_remittance row; the backend itself is the
  // real gate (see rule_engine/remittance_recheck.py), this is just the
  // UI trigger for it.
  const [recheckLoading, setRecheckLoading] = useState(false);
  const handleRecheckRemittance = async () => {
    if (!detail) return;
    setRecheckLoading(true); setActionError("");
    try {
      const res = await recheckRemittance(recordId);
      if (!res.data?.changed) {
        setActionError(res.data?.reason || "No matching remittance found yet.");
      }
      await fetchDetail();
    } catch (e: any) { setActionError(formatApiError(e, "Recheck failed.")); }
    setRecheckLoading(false);
  };

  // ── Loading / not-found ─────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 size={20} className="text-gray-400 animate-spin mr-3" />
      <span className="text-sm text-gray-500 font-medium">Loading…</span>
    </div>
  );

  if (!detail) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
      <AlertTriangle size={28} className="text-red-400" />
      <p className="text-sm text-gray-600 font-medium">Record not found.</p>
      <button onClick={goBack} className="flex items-center gap-2 text-xs font-bold text-[#222222] cursor-pointer">
        <ArrowLeft size={13} /> Back
      </button>
    </div>
  );

  // ── Derived values ──────────────────────────────────────────────────────────

  const { bank_statement: bs, extraction: ex, confirmed_invoices,
          sum_outstanding, credit_amount, oracle, remittance } = detail;

  const status       = deriveStatus(oracle);
  const isProcessed  = status === "processed";
  const isPostFailed = status === "post_failed";

  // PATCH: whether this row already has a valid SPOC-confirmed mapping —
  // used by CARD 2.5 below to show a clear "already mapped" summary
  // instead of re-presenting a blank invoice picker. Requires both the
  // persistent manually_mapped flag (db/models.py) AND an actual
  // confirmed invoice to show (belt-and-suspenders — manually_mapped
  // should never be true with zero confirmed_invoices, but don't render
  // a summary with nothing in it if that ever happens).
  const alreadyMapped = !!detail.manually_mapped && confirmed_invoices.length > 0;

  // Approve: only for ready_for_oracle rows that haven't been acted on
  // Primary gate: category from backend (_category_for_row in metrics.py).
  // Fallback: row_type on extraction — covers older API responses where
  // category/run_id weren't yet returned by build_row_detail().
  const isReadyForOracle = detail.category === "ready_for_oracle"
    || (!detail.category && (
        ex.row_type === "EXACT_MATCH" || ex.row_type === "ACCEPTABLE_SHORT_PAYMENT"
      ));

  const canApprove = ex.is_matched
    && isReadyForOracle
    && oracle.hitl_status !== "approved"
    && oracle.hitl_status !== "rejected"
    && oracle.post_status !== "success";

  // Reject: any non-terminal identified row
  const canReject = ex.is_matched
    && oracle.hitl_status !== "rejected"
    && oracle.post_status !== "success";

  // Retry: row was approved and Oracle POST failed (e.g. network/DNS/config
  // issue) — re-attempts the exact same payload via retry_oracle_post(),
  // which server-side only proceeds if oracle_post_status is still "failed".
  const canRetry = isPostFailed;

  // Recheck Remittance: only meaningful for a row still actually waiting
  // on one (category === "needs_remittance") — the backend itself only
  // ever acts on rule_id === "R7" rows regardless of what this shows, but
  // hiding it otherwise avoids a button that would just always no-op.
  const canRecheckRemittance = detail.category === "needs_remittance";

  const reasonConfig = getReasonConfig(ex.row_type || oracle.remittance_scenario);

  const TONE_STYLE = {
    ok:    "bg-emerald-50 border-emerald-200 text-emerald-800",
    warn:  "bg-amber-50  border-amber-200  text-amber-800",
    error: "bg-red-50    border-red-200    text-red-800",
    info:  "bg-blue-50   border-blue-200   text-blue-800",
  };
  const TONE_ICON = {
    ok:    <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />,
    warn:  <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />,
    error: <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />,
    info:  <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />,
  };

  const payloadRefs: any[] = oracle.payload?.remittanceReferences || [];
  const sumRefs = payloadRefs.reduce((s: number, r: any) => s + Number(r.ReferenceAmount || 0), 0);
  const hasOraclePayload = Object.keys(oracle.payload || {}).filter(k => !k.startsWith("_")).length > 0;

  // ── Special flags ───────────────────────────────────────────────────────────
  // Derive from LineItem flags (preferred) with fallbacks from payload/reason code

  const isAcceptableShort = ex.row_type === "ACCEPTABLE_SHORT_PAYMENT";

  const isCrossCurrency = detail.is_cross_currency
    ?? (oracle.payload?.ConversionRate != null && oracle.payload?.Currency !== undefined);

  const isCrossLedger = detail.is_cross_ledger
    ?? (!isCrossCurrency && oracle.payload?.ConversionRate != null);

  const isCrossOU = detail.is_cross_ou
    ?? (ex.row_type === "WRONG_OU_PAYMENT" || ex.row_type === "WRONG_OU_SPLIT_REQUIRED");

  interface SpecialFlag { label: string; desc: string; bg: string; border: string; text: string; icon: React.ReactNode }
  const specialFlags: SpecialFlag[] = [];

  if (isAcceptableShort) specialFlags.push({
    label: "Acceptable Short Payment",
    desc:  "This payment is below the invoice outstanding but falls within the accepted tolerance. Posting is permitted without further action.",
    bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-800",
    icon: <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />,
  });
  if (isCrossCurrency) specialFlags.push({
    label: "Cross Currency",
    desc:  `Payment received in ${bs.currency} and applied against an invoice in ${confirmed_invoices[0]?.currency || "a different currency"}. An FX conversion rate was applied (Leg 1).`,
    bg: "bg-violet-50", border: "border-violet-300", text: "text-violet-800",
    icon: <ArrowRightLeft size={14} className="text-violet-500 shrink-0 mt-0.5" />,
  });
  if (isCrossLedger && !isCrossCurrency) specialFlags.push({
    label: "Cross Ledger Currency",
    desc:  "Invoice currency differs from the OU functional currency. Oracle will apply a ConversionRate when booking this receipt into the ledger.",
    bg: "bg-indigo-50", border: "border-indigo-300", text: "text-indigo-800",
    icon: <Layers size={14} className="text-indigo-500 shrink-0 mt-0.5" />,
  });
  if (isCrossOU) specialFlags.push({
    label: "Cross Entity Payment",
    desc:  `Received into ${bs.ou_display_name || `${bs.business_unit} [${bs.ou_number}]`}, but the customer's invoice${confirmed_invoices.length > 1 ? "s belong" : " belongs"} to ${confirmed_invoices[0]?.ou_display_name || confirmed_invoices[0]?.ou_number || "a different entity"}. Manual re-routing is required before posting.`,
    bg: "bg-red-50", border: "border-red-300", text: "text-red-800",
    icon: <GitBranch size={14} className="text-red-500 shrink-0 mt-0.5" />,
  });

  // Oracle card visibility
  const showOracleCard = hasOraclePayload
    || isReadyForOracle
    || status === "processed"
    || status === "post_failed";

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex flex-col">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="bg-[#222222] px-5 py-0 flex items-stretch flex-shrink-0 shadow-md">

        {/* Back */}
        <button onClick={goBack}
          className="flex items-center gap-2 hover:bg-white/10 px-4 transition-colors cursor-pointer border-r border-white/10 mr-4">
          <ArrowLeft size={14} className="text-white/70" />
          <span className="text-[10px] font-black text-white/70 uppercase tracking-wider">Back</span>
        </button>

        {/* Breadcrumb: Statement date · Run ID · Category · Row ID */}
        <div className="flex items-center gap-2 py-3.5 flex-1 min-w-0 flex-wrap">
          {bs.statement_date && (
            <span className="text-[11px] font-bold text-white/60 font-mono">{fmtDate(bs.statement_date)}</span>
          )}
          {bs.statement_date && <span className="text-white/20">·</span>}
          {detail.run_id && (
            <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">Run #{detail.run_id}</span>
          )}
          {detail.run_id && <span className="text-white/20">·</span>}
          <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-xs border ${STATUS_CHIP[status] || STATUS_CHIP.pending}`}>
            {detail.category_label || STATUS_LABEL[status] || status}
          </span>
          <span className="text-white/20">·</span>
          <span className="text-[10px] font-bold text-white/40 font-mono">ID {recordId}</span>
        </div>

        {/* Action buttons — only applicable ones render */}
        <div className="flex items-center gap-2 pl-4 border-l border-white/10">
          {canApprove && (
            <button disabled={actionLoading} onClick={handleApprove}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-2 text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 transition-colors">
              <Check size={12} className="stroke-[3]" /> Approve &amp; Post
            </button>
          )}
          {canRetry && (
            <button disabled={actionLoading} onClick={handleRetry}
              className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 transition-colors">
              <RefreshCw size={12} className={`stroke-[3] ${actionLoading ? "animate-spin" : ""}`} /> Retry Post
            </button>
          )}
          {canRecheckRemittance && (
            <button disabled={recheckLoading} onClick={handleRecheckRemittance}
              title="Check whether a remittance has arrived since this row landed here"
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-4 py-2 text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 transition-colors">
              <Mail size={12} className={`stroke-[3] ${recheckLoading ? "animate-pulse" : ""}`} />
              {recheckLoading ? "Checking…" : "Recheck Remittance"}
            </button>
          )}
          {canReject && (
            <button disabled={actionLoading} onClick={handleReject}
              className="flex items-center gap-1.5 bg-red-500 hover:bg-red-400 text-white px-4 py-2 text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 transition-colors">
              <X size={12} className="stroke-[3]" /> Reject
            </button>
          )}
        </div>
      </div>

      {/* Error strip */}
      {actionError && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 flex items-center gap-2 text-[11px] font-bold text-red-700 flex-shrink-0">
          <AlertTriangle size={12} className="shrink-0" /> {actionError}
          <button onClick={() => setActionError("")} className="ml-auto cursor-pointer"><X size={12} /></button>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left — scrollable cards */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-5 py-5 space-y-4">

            {/* ── Processed banner ─────────────────────────────────────────────── */}
            {isProcessed && (
              <div className="bg-emerald-600 text-white rounded-sm px-5 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <CheckCircle2 size={18} className="shrink-0" />
                  <span className="text-sm font-black uppercase tracking-wider">Posted to Oracle Fusion AR</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-emerald-700/30 rounded-xs p-3">
                  {[
                    ["Receipt Number",      oracle.oracle_ref_no],
                    ["Standard Receipt ID", oracle.standard_receipt_id],
                    ["Status Code",         oracle.oracle_status_code],
                    ["Posted At",           fmtDate(oracle.oracle_posted_at)],
                    ["Amount",              `${fmt(credit_amount)} ${bs.currency}`],
                    ["Business Unit",       bs.business_unit],
                  ].map(([label, val]) => val ? (
                    <div key={label as string}>
                      <div className="text-[9px] text-emerald-200 font-bold uppercase tracking-wider mb-0.5">{label}</div>
                      <div className="text-[11px] font-mono font-black break-all">{val}</div>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}

            {/* ── Post-failed banner ───────────────────────────────────────────── */}
            {isPostFailed && (
              <div className="bg-red-600 text-white rounded-sm px-5 py-3.5 flex items-start gap-3">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-black uppercase tracking-wider">Oracle Post Failed</div>
                  {oracle.post_message && (
                    <div className="text-[10px] font-mono bg-red-700/40 rounded-xs p-2 mt-2 break-all">{oracle.post_message}</div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════
                SPECIAL FLAGS BANNER
                Shown above Card 1 when any flag applies.
            ══════════════════════════════════════════════ */}
            {specialFlags.length > 0 && (
              <div className="flex flex-col gap-2">
                {specialFlags.map(flag => (
                  <div key={flag.label}
                    className={`flex items-start gap-3 px-4 py-3 rounded-sm border ${flag.bg} ${flag.border}`}>
                    {flag.icon}
                    <div className="flex-1 min-w-0">
                      <span className={`inline-block text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-xs border mb-1 ${flag.bg} ${flag.border} ${flag.text}`}>
                        {flag.label}
                      </span>
                      <p className={`text-[11px] font-semibold leading-relaxed ${flag.text}`}>{flag.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ══════════════════════════════════════════════
                CARD 1 — Payment Received
            ══════════════════════════════════════════════ */}
            <CardShell>
              <CardHead icon={<Banknote size={13} />} title="Payment Received" />
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                <div className="px-5 py-1">
                  <DataRow label="Bank"            value={bs.bank_name} />
                  <DataRow label="Account"         value={bs.bank_account_number} mono />
                  <DataRow label="Transaction ref" value={bs.bank_reference} mono />
                  <DataRow label="Statement date"  value={fmtDate(bs.statement_date)} />
                </div>
                <div className="px-5 py-1">
                  <DataRow label="Business unit"   value={`${bs.business_unit} [${bs.ou_number}]`} />
                  {/* Amount — prominently sized */}
                  <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">Amount credited</span>
                    <span className="font-mono font-black text-[#222222]" style={{ fontSize: "22px", letterSpacing: "-0.02em" }}>
                      {fmt(bs.credit_amount)}
                      <span className="text-sm font-bold text-gray-400 ml-2">{bs.currency}</span>
                    </span>
                  </div>
                  <DataRow label="Description"     value={bs.narrative} />
                </div>
              </div>
            </CardShell>

            {/* ══════════════════════════════════════════════
                CARD 2 — What was identified
            ══════════════════════════════════════════════ */}
            <CardShell>
              <CardHead
                icon={<ZapIcon size={13} />}
                title="What was identified"
                right={
                  // PATCH: was ONLY shown inside CARD 2.5 (Manual Invoice
                  // Mapping), which unmounts entirely once category becomes
                  // ready_for_oracle/processed — the normal, EXPECTED
                  // outcome of a successful manual mapping for any row that
                  // wasn't already stuck post_failed/rejected. That made the
                  // badge and SPOC name disappear at exactly the moment
                  // they became true. Shown here instead, gated only on
                  // detail.manually_mapped — persists for the row's entire
                  // lifecycle, including after it's fully Processed.
                  detail.manually_mapped ? (
                    <span
                      className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-100 uppercase tracking-wider px-2 py-1 rounded-xs"
                      title={
                        detail.manually_mapped_by
                          ? `Mapped by ${detail.manually_mapped_by}${detail.manually_mapped_at ? ` on ${fmtDate(detail.manually_mapped_at)}` : ""}`
                          : "Manually mapped"
                      }
                    >
                      <CheckCircle2 size={10} /> Manually Mapped
                      {detail.manually_mapped_by ? ` · ${detail.manually_mapped_by}` : ""}
                    </span>
                  ) : undefined
                }
              />
              {detail.manually_mapped && detail.manually_mapped_at && (
                <div className="px-5 pt-3 -mb-1">
                  <p className="text-[10px] text-gray-400">
                    Manually mapped by <span className="font-bold text-gray-500">{detail.manually_mapped_by || "unknown"}</span> on {fmtDate(detail.manually_mapped_at)}.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">

                {/* Customer side */}
                <div className="px-5 py-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <User size={10} className="text-gray-400" />
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Customer</span>
                  </div>
                  {ex.extracted_customer ? (
                    <>
                      <div className="text-[15px] font-black text-[#222222] mb-2.5 leading-snug">{ex.extracted_customer}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        {ex.method && (
                          <span className="text-[9px] font-black bg-gray-100 text-gray-600 px-2 py-1 rounded-xs uppercase tracking-wider">{ex.method}</span>
                        )}
                        {ex.confidence_score != null && (
                          <span className={`text-[9px] font-black px-2 py-1 rounded-xs text-white ${ex.confidence_score >= 0.8 ? "bg-emerald-600" : "bg-amber-500"}`}>
                            {(ex.confidence_score * 100).toFixed(0)}% confidence
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-[12px] text-gray-400 italic">
                      {ex.method && ex.method !== "none"
                        ? "No customer identified in narrative"
                        : "Customer extraction not attempted"}
                    </p>
                  )}
                </div>

                {/* Invoices side */}
                <div className="px-5 py-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Hash size={10} className="text-gray-400" />
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Invoice numbers</span>
                  </div>
                  {(ex.all_invoice_numbers || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {ex.all_invoice_numbers.map(inv => (
                        <span key={inv}
                          className="font-mono text-[11px] font-black bg-[#222222]/5 text-[#222222] border border-[#222222]/15 px-2.5 py-1 rounded-xs">
                          {inv}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-gray-400 italic">
                      {ex.extracted_customer && !ex.primary_invoice
                        ? "Matched by customer name — no invoice number in narrative"
                        : ex.method && ex.method !== "none"
                        ? "No invoice number found in narrative"
                        : "—"}
                    </p>
                  )}
                </div>
              </div>
            </CardShell>

            {/* ══════════════════════════════════════════════
                CARD 2.5 — Manual Invoice Mapping (NEW)
                Shown for any row NOT already ready_for_oracle/processed.
                Amounts are ALWAYS auto-loaded from the aging report —
                never typed by the SPOC.
            ══════════════════════════════════════════════ */}
            {canManuallyMap && (
              <CardShell>
                <CardHead
                  icon={<Hash size={13} />}
                  title="Manual Invoice Mapping"
                  right={
                    alreadyMapped ? (
                      <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-100 uppercase tracking-wider px-2 py-1 rounded-xs">
                        <CheckCircle2 size={10} /> Manually Mapped
                      </span>
                    ) : (
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Optional — from aging report</span>
                    )
                  }
                />
                <div className="px-5 py-5 space-y-4">
                  {alreadyMapped && !showRemapPicker ? (
                    // ══════════════════════════════════════════════
                    // "ALREADY MAPPED" SUMMARY — the fix. Previously this
                    // card always rendered the blank picker below, even
                    // right after a successful Confirm Mapping, making it
                    // look like nothing had happened (the row's category
                    // can stay post_failed/rejected even after a valid
                    // re-map — see handleConfirmMapping's comment above).
                    // ══════════════════════════════════════════════
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 px-4 py-3 rounded-xs border bg-emerald-50 border-emerald-200">
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-emerald-800">
                            This row is manually mapped to {confirmed_invoices.length === 1 ? "invoice" : "invoice(s)"}{" "}
                            {confirmed_invoices.map((inv, i) => (
                              <span key={inv.invoice_number} className="font-mono">
                                {i > 0 && ", "}{inv.invoice_number}
                              </span>
                            ))}.
                          </p>
                          <p className="text-[11px] text-emerald-700 mt-1">
                            {isPostFailed
                              ? <>The Oracle post failed before — click <span className="font-bold">Retry Post</span> above to send this mapping to Oracle. No need to map it again.</>
                              : detail.category === "rejected"
                              ? <>This row was rejected. Reject is terminal — a new run or an admin action is needed before this mapping can be posted.</>
                              : <>Use <span className="font-bold">Approve &amp; Post</span> above to send this mapping to Oracle.</>}
                          </p>
                          {detail.manually_mapped_by && (
                            <p className="text-[10px] text-emerald-600/80 mt-1.5">
                              Mapped by {detail.manually_mapped_by}
                              {detail.manually_mapped_at ? ` on ${fmtDate(detail.manually_mapped_at)}` : ""}.
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => { setShowRemapPicker(true); fetchMappingOptions(); }}
                        className="text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-[#222222] cursor-pointer"
                      >
                        Map to a different invoice instead →
                      </button>
                    </div>
                  ) : mappingOptionsLoading ? (
                    <div className="flex items-center gap-2 text-gray-400 text-[12px]">
                      <Loader2 size={14} className="animate-spin" /> Loading aging report options…
                    </div>
                  ) : mappingOptionsError ? (
                    <p className="text-[12px] text-red-600 font-semibold">{mappingOptionsError}</p>
                  ) : mappingOptions ? (
                    <>
                      {alreadyMapped && (
                        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xs border border-amber-200 bg-amber-50">
                          <p className="text-[11px] text-amber-800 font-semibold">
                            Picking new invoice(s) below will replace the current mapping.
                          </p>
                          <button
                            onClick={() => setShowRemapPicker(false)}
                            className="text-[10px] font-black uppercase tracking-wider text-amber-700 hover:text-amber-900 cursor-pointer shrink-0"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      {!mappingOptions.customer_identified ? (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Select Customer</label>
                          <select
                            value={selectedCustomerForMapping}
                            onChange={(e) => handleSelectCustomerForMapping(e.target.value)}
                            className="w-full text-xs border border-gray-300 rounded-sm px-3 py-2 focus:outline-none focus:border-[#222222] cursor-pointer"
                          >
                            <option value="">— choose a customer —</option>
                            {(mappingOptions.customers || []).map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      ) : (
                        <p className="text-[12px] text-gray-600">
                          Customer already identified: <span className="font-black text-[#222222]">{mappingOptions.customer_name}</span>
                        </p>
                      )}

                      {customerInvoiceOptions.length > 0 ? (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                            Select Invoice(s) — amounts auto-loaded from aging report
                          </label>
                          <div className="border border-gray-200 rounded-xs overflow-hidden">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="bg-[#222222] text-white">
                                  <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider w-8"></th>
                                  <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">Invoice #</th>
                                  <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider">Outstanding</th>
                                  <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">Currency</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {customerInvoiceOptions.map((inv) => (
                                  <tr key={inv.invoice_number}
                                    className="hover:bg-blue-50/30 cursor-pointer"
                                    onClick={() => toggleInvoiceForMapping(inv.invoice_number)}>
                                    <td className="px-3 py-2">
                                      <input type="checkbox"
                                        checked={selectedInvoiceNumbers.has(inv.invoice_number)}
                                        onChange={() => toggleInvoiceForMapping(inv.invoice_number)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="cursor-pointer" />
                                    </td>
                                    <td className="px-3 py-2 font-mono font-bold text-[#222222]">{inv.invoice_number}</td>
                                    <td className="px-3 py-2 font-mono font-bold text-right text-[#222222]">{fmt(inv.outstanding_amount)}</td>
                                    <td className="px-3 py-2 text-gray-400 font-mono">{inv.currency || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : mappingOptions.customer_identified ? (
                        <p className="text-[12px] text-gray-400 italic">No open invoices found for this customer in the loaded aging report.</p>
                      ) : selectedCustomerForMapping ? (
                        <p className="text-[12px] text-gray-400 italic">No open invoices found for this customer.</p>
                      ) : null}

                      {/* Live qualification feedback */}
                      {selectedInvoiceNumbers.size > 0 && (
                        <div className={`px-4 py-3 rounded-xs border flex items-start gap-3 ${
                          mappingPreviewLoading ? "bg-gray-50 border-gray-200" :
                          mappingPreview?.qualifies ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
                        }`}>
                          {mappingPreviewLoading ? (
                            <Loader2 size={14} className="animate-spin text-gray-400 shrink-0 mt-0.5" />
                          ) : mappingPreview?.qualifies ? (
                            <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            {mappingPreviewLoading ? (
                              <p className="text-[11px] text-gray-500 font-semibold">Checking against business rules…</p>
                            ) : mappingPreviewError ? (
                              <p className="text-[11px] text-red-600 font-bold">{mappingPreviewError}</p>
                            ) : mappingPreview ? (
                              <>
                                <p className={`text-[12px] font-bold ${mappingPreview.qualifies ? "text-emerald-800" : "text-amber-800"}`}>
                                  {mappingPreview.message}
                                </p>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[10px] font-mono text-gray-500">
                                  <span>Received: {fmt(mappingPreview.received_total)}</span>
                                  <span>Selected total: {fmt(mappingPreview.target_total)}</span>
                                  <span>Shortfall: {mappingPreview.shortfall_pct}%</span>
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>
                      )}

                      {confirmMappingError && (
                        <p className="text-[11px] text-red-600 font-bold">{confirmMappingError}</p>
                      )}

                      <div className="flex items-center gap-3">
                        <button
                          disabled={!mappingPreview?.qualifies || confirmMappingLoading}
                          onClick={handleConfirmMapping}
                          className="flex items-center gap-2 bg-[#222222] hover:bg-[#222222] disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2.5 text-[11px] font-black uppercase tracking-wider rounded-sm cursor-pointer transition-colors"
                        >
                          {confirmMappingLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="stroke-[3]" />}
                          Confirm Mapping
                        </button>
                        <p className="text-[10px] text-gray-400 leading-snug">
                          Moves this row to <span className="font-bold text-gray-500">Ready for Oracle</span> — does not post.
                          Use Approve &amp; Post afterward.
                        </p>
                      </div>
                    </>
                  ) : null}
                </div>
              </CardShell>
            )}

            {/* ══════════════════════════════════════════════
                CARD 3 — Aging snapshot
                Only renders when invoices were matched.
            ══════════════════════════════════════════════ */}
            {confirmed_invoices.length > 0 && (
              <CardShell>
                <CardHead
                  icon={<FileText size={13} />}
                  title="Aging snapshot"
                  right={
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">
                      {confirmed_invoices.length} invoice{confirmed_invoices.length !== 1 ? "s" : ""}
                    </span>
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-[#222222] text-white">
                        {["Invoice #", "Customer", "Invoice Date", "Outstanding", "Currency", "OU", "Allocated"].map(h => (
                          <th key={h} className={`px-4 py-3 text-[9px] font-black uppercase tracking-wider ${h === "Outstanding" || h === "Allocated" ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {confirmed_invoices.map((inv, i) => {
                        const allocated = inv.remittance_amount ?? inv.computed_amount;
                        return (
                          <tr key={i} className="hover:bg-blue-50/20 transition-colors">
                            <td className="px-4 py-3 font-mono font-bold text-[#222222]">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                                {inv.invoice_number}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{inv.customer_name || "—"}</td>
                            <td className="px-4 py-3 font-mono text-gray-500">{fmtDate(inv.invoice_date)}</td>
                            <td className="px-4 py-3 font-mono font-bold text-right text-[#222222]">{fmt(inv.outstanding_amount)}</td>
                            <td className="px-4 py-3 text-gray-400 font-mono">{inv.currency || "—"}</td>
                            <td className="px-4 py-3 text-gray-400">{inv.ou_number || "—"}</td>
                            <td className="px-4 py-3 font-mono font-bold text-right text-emerald-700">{fmt(allocated)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {confirmed_invoices.length > 1 && (
                      <tfoot className="border-t-2 border-gray-200">
                        <tr className="bg-gray-50">
                          <td colSpan={3} className="px-4 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-wider">Total</td>
                          <td className="px-4 py-2.5 font-mono font-black text-right text-[#222222]">{fmt(sum_outstanding)}</td>
                          <td colSpan={2} />
                          <td className={`px-4 py-2.5 font-mono font-black text-right ${Math.abs(sumRefs - credit_amount) < 0.02 ? "text-emerald-700" : "text-red-600"}`}>
                            {fmt(sumRefs)}
                            {Math.abs(sumRefs - credit_amount) >= 0.02 && <span className="ml-1.5 text-[9px]">⚠ mismatch</span>}
                          </td>
                        </tr>
                        <tr className="bg-blue-50/50">
                          <td colSpan={3} className="px-4 py-2 text-[9px] font-black text-[#222222] uppercase tracking-wider">Bank credit amount</td>
                          <td colSpan={4} className="px-4 py-2 font-mono font-black text-right text-[#222222]">{fmt(credit_amount)} {bs.currency}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </CardShell>
            )}

            {/* ══════════════════════════════════════════════
                CARD 4 — Why this status
                Reason sentence + amount comparison block.
            ══════════════════════════════════════════════ */}
            <CardShell>
              <CardHead icon={<Info size={13} />} title="Why this status" />
              <div className="px-5 py-5 space-y-4">
                {/* Reason sentence */}
                <div className={`flex items-start gap-3 px-4 py-4 rounded-xs border ${TONE_STYLE[reasonConfig.tone]}`}>
                  {TONE_ICON[reasonConfig.tone]}
                  <p className="text-[13px] font-semibold leading-relaxed">{reasonConfig.text}</p>
                </div>

                {/* Cross-OU comparison — which entity received the payment vs which
                    entity the customer's invoice(s) actually belong to. */}
                {isCrossOU && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 border border-gray-200 rounded-xs px-4 py-3">
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Received Into (Bank's OU)</div>
                      <div className="font-black text-[#222222] text-[14px] leading-snug">
                        {bs.ou_display_name || bs.business_unit || "—"}
                      </div>
                      {bs.ou_number && <div className="text-[10px] text-gray-400 font-mono font-bold mt-1">OU {bs.ou_number}</div>}
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xs px-4 py-3">
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Customer's OU (Invoice)</div>
                      <div className="font-black text-[#222222] text-[14px] leading-snug">
                        {confirmed_invoices[0]?.ou_display_name || confirmed_invoices[0]?.ou_number || "—"}
                      </div>
                      {confirmed_invoices[0]?.ou_number && <div className="text-[10px] text-gray-400 font-mono font-bold mt-1">OU {confirmed_invoices[0].ou_number}</div>}
                    </div>
                    <div className="col-span-2 flex items-center gap-2 px-4 py-2.5 rounded-xs border bg-red-50 border-red-200">
                      <GitBranch size={13} className="text-red-500 shrink-0" />
                      <span className="text-[10px] font-black text-red-700 uppercase tracking-wider">Entity mismatch — must be re-routed before posting</span>
                    </div>
                  </div>
                )}

                {/* Amount comparison — only when both amounts are meaningful */}
                {sum_outstanding > 0 && credit_amount > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 border border-gray-200 rounded-xs px-4 py-3">
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Amount Received</div>
                      <div className="font-mono font-black text-[#222222] text-[18px] leading-none">{fmt(credit_amount)}</div>
                      <div className="text-[10px] text-gray-400 font-bold mt-1">{bs.currency}</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xs px-4 py-3">
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Invoice Outstanding</div>
                      <div className="font-mono font-black text-[#222222] text-[18px] leading-none">{fmt(sum_outstanding)}</div>
                      <div className="text-[10px] text-gray-400 font-bold mt-1">{confirmed_invoices[0]?.currency || bs.currency}</div>
                    </div>

                    {/* Difference row */}
                    {Math.abs(sum_outstanding - credit_amount) > 0.01 ? (
                      <div className={`col-span-2 flex items-center justify-between px-4 py-2.5 rounded-xs border ${credit_amount < sum_outstanding ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
                        <span className={`text-[10px] font-black uppercase tracking-wider ${credit_amount < sum_outstanding ? "text-amber-700" : "text-red-700"}`}>
                          {credit_amount < sum_outstanding ? "Short by" : "Over by"}
                        </span>
                        <span className={`font-mono font-black text-[14px] ${credit_amount < sum_outstanding ? "text-amber-700" : "text-red-700"}`}>
                          {fmt(Math.abs(sum_outstanding - credit_amount))}
                          <span className="ml-2 text-[10px] font-bold opacity-70">
                            ({((Math.abs(sum_outstanding - credit_amount) / sum_outstanding) * 100).toFixed(1)}%)
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div className="col-span-2 flex items-center gap-2 px-4 py-2.5 rounded-xs border bg-emerald-50 border-emerald-200">
                        <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Amounts match exactly</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardShell>

            {/* ══════════════════════════════════════════════
                CARD 5 — Oracle Fusion Payload
                Visible for: ready_for_oracle, processed, post_failed.
                Shows "not yet generated" empty state for other categories.
            ══════════════════════════════════════════════ */}
            {showOracleCard && (
              <CardShell>
                <CardHead
                  icon={<Building2 size={13} />}
                  title="Oracle Fusion Payload"
                  right={
                    // PATCH: "Ready" used to just mean hasOraclePayload —
                    // i.e. "a payload object exists at all". Since receipt
                    // creation now runs for EVERY row regardless of
                    // category (see rule_engine/orchestrator.py's Step
                    // 4.5), that was true almost universally and told you
                    // nothing about whether this row was actually done.
                    // These are two separate, real states — show both.
                    <div className="flex items-center gap-2">
                      {oracle.receipt_creation_status === "success" ? (
                        <span className="text-[9px] font-black text-blue-600 uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 size={10} /> Receipt Created
                        </span>
                      ) : oracle.receipt_creation_status === "failed" ? (
                        <span className="text-[9px] font-black text-red-500 uppercase tracking-wider flex items-center gap-1">
                          <X size={10} /> Receipt Failed
                        </span>
                      ) : (
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Receipt Not Yet Created</span>
                      )}
                      {oracle.post_status === "success" ? (
                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 size={10} /> Invoice Mapped
                        </span>
                      ) : oracle.post_status === "failed" ? (
                        <span className="text-[9px] font-black text-red-500 uppercase tracking-wider flex items-center gap-1">
                          <X size={10} /> Mapping Failed
                        </span>
                      ) : (
                        <span className="text-[9px] font-black text-gray-300 uppercase tracking-wider">Not Yet Mapped</span>
                      )}
                    </div>
                  }
                />
                {hasOraclePayload ? (
                  <div className="px-5 py-5 space-y-4">
                    <OraclePayloadTable payload={oracle.payload} creditAmount={credit_amount} />
                    {/* Actual Oracle response bodies — separate from the outbound
                        payload above. Only present once the corresponding step
                        has actually run. */}
                    <RawResponseViewer title="Receipt Created Output (Oracle response)" data={oracle.receipt_response_raw} />
                    <RawResponseViewer title="Invoice Mapping Output (Oracle response)" data={oracle.reference_response_raw} />
                  </div>
                ) : (
                  <div className="px-5 py-8 text-center">
                    <p className="text-[11px] text-gray-400 font-medium">
                      Oracle payload will be generated once this row reaches the approval step.
                    </p>
                  </div>
                )}
              </CardShell>
            )}

            <div className="h-6" />
          </div>
        </div>

        {/* Right — Remittance panel (collapsed by default, auto-opens when found) */}
        <RemittancePanel
          remittance={remittance}
          allInvoiceNumbers={ex.all_invoice_numbers || []}
          remittanceStatus={oracle.remittance_status}
          collapsed={remittanceCollapsed}
          onToggle={() => setRemittanceCollapsed(v => !v)}
        />
      </div>
    </div>
  );
}