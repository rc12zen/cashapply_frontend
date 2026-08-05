"use client";
/**
 * components/row-detail/DistributedSummaryCard.tsx
 * =====================================================
 * Shown instead of ManualInvoiceMappingCard when a row's category is
 * "distributed" -- this row was the ORIGINAL consolidated bank line
 * (credit card / cheque / third-party) and a SPOC already ran Split & Map
 * on it. PATCH (confirmed direction change): there are NO child rows at
 * all anymore -- every entry's amount/customer/invoice/FX/Oracle state
 * lives directly on THIS row's distribution_breakdown, and every action
 * (Approve & Post / Reject / Edit GL Rate) happens INLINE, right here,
 * against one entry at a time -- no navigating to a separate row-detail
 * page for any of it. See hitl/distribution_actions.py for the backend
 * side of each action.
 */
import { useState } from "react";
import {
  CheckCircle2, ChevronDown, ChevronUp, Loader2, AlertTriangle,
  X, Split, Settings2, RefreshCw, Code2,
} from "lucide-react";
import type { RowDetail } from "@/components/row-detail/types";
import {
  approveDistributionEntry, rejectDistributionEntry, editDistributionEntryGlRate,
} from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import EditGlRateModal from "@/components/row-detail/EditGlRateModal";

type Entry = NonNullable<RowDetail["distribution_breakdown"]>[number];

function statusPill(entry: Entry) {
  if (entry.hitl_status === "rejected") {
    return <span className="text-[10px] font-black uppercase tracking-wider text-red-600">Rejected</span>;
  }
  if (entry.hitl_status === "approved" && entry.reference_status === "success") {
    return <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Posted</span>;
  }
  if (entry.oracle_post_status === "failed") {
    return <span className="text-[10px] font-black uppercase tracking-wider text-red-500">Receipt Failed</span>;
  }
  if (entry.oracle_post_status === "success" && entry.reference_status === "failed") {
    return <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">Mapping Failed</span>;
  }
  if (!entry.passed_validation) {
    return <span className="text-[10px] font-black uppercase tracking-wider text-red-600">Needs Re-Routing</span>;
  }
  return <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Awaiting Review</span>;
}

function EntryRow({
  entry, recordId, onChanged,
}: {
  entry: Entry;
  recordId: number;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [showGlRateModal, setShowGlRateModal] = useState(false);
  const [glRateSaving, setGlRateSaving] = useState(false);
  const [glRateError, setGlRateError] = useState("");

  const isFinal = entry.hitl_status === "approved" || entry.hitl_status === "rejected";
  const canApprove = entry.hitl_status === "pending" && entry.passed_validation;
  const canReject = entry.hitl_status === "pending";
  const canEditGlRate = entry.is_cross_ledger && entry.reference_status !== "success";
  const hadFailedAttempt = entry.oracle_post_status === "failed" || entry.reference_status === "failed";

  const handleApprove = async () => {
    setBusy("approve"); setError("");
    try {
      await approveDistributionEntry(recordId, entry.entry_id);
      onChanged();
    } catch (e: any) {
      setError(getErrorMessage(e, "Could not approve & post this entry."));
    }
    setBusy(null);
  };

  const handleReject = async () => {
    setBusy("reject"); setError("");
    try {
      await rejectDistributionEntry(recordId, entry.entry_id);
      onChanged();
    } catch (e: any) {
      setError(getErrorMessage(e, "Could not reject this entry."));
    }
    setBusy(null);
  };

  const handleGlRateSubmit = async (data: { new_rate: number; reason: string }) => {
    setGlRateSaving(true); setGlRateError("");
    try {
      await editDistributionEntryGlRate(recordId, entry.entry_id, data.new_rate, data.reason || undefined);
      setShowGlRateModal(false);
      onChanged();
    } catch (e: any) {
      setGlRateError(getErrorMessage(e, "Could not update the GL rate."));
    }
    setGlRateSaving(false);
  };

  return (
    <div className={`border rounded-sm ${isFinal ? "border-gray-100" : "border-gray-200"}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
        >
          {expanded ? <ChevronUp size={13} className="text-gray-400 shrink-0" /> : <ChevronDown size={13} className="text-gray-400 shrink-0" />}
          <Split size={11} className="text-indigo-400 shrink-0" />
          <span className="font-semibold text-primary text-[11px] truncate">{entry.customer_name || "—"}</span>
          <span className="font-mono text-gray-400 text-[11px] shrink-0">{entry.invoice_number || "—"}</span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[11px] text-gray-600">
            {entry.amount != null ? entry.amount.toLocaleString() : "—"} {entry.currency || ""}
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
            {entry.reason_code}
          </span>
          {statusPill(entry)}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-3 py-3 space-y-3 bg-gray-50/50">
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-0.5">Rule</div>
              <div className="font-mono text-gray-700">{entry.rule_id} — {entry.reason_code}</div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-0.5">Match Confidence</div>
              <div className="font-mono text-gray-700">
                {entry.customer_match_pct != null ? `${entry.customer_match_pct.toFixed(0)}%` : "—"}
              </div>
            </div>
            {entry.is_cross_ledger && (
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-0.5">GL Conversion Rate</div>
                <div className="font-mono text-gray-700">{entry.fx_invoice_to_functional ?? "—"}</div>
              </div>
            )}
            {entry.standard_receipt_id && (
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-0.5">Standard Receipt Id</div>
                <div className="font-mono text-gray-700">{entry.standard_receipt_id}</div>
              </div>
            )}
          </div>

          {entry.hitl_status === "rejected" && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-700">
                Rejected{entry.rejected_by ? ` by ${entry.rejected_by}` : ""}
                {entry.rejected_reason ? ` — ${entry.rejected_reason}` : ""}
              </p>
            </div>
          )}

          {(entry.post_message || entry.reference_message) && entry.hitl_status !== "rejected" && (
            <div className={`text-[11px] px-3 py-2 rounded-sm border ${
              entry.oracle_post_status === "failed" || entry.reference_status === "failed"
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}>
              {entry.reference_message || entry.post_message}
            </div>
          )}

          {entry.oracle_payload && (
            <div>
              <button
                onClick={() => setShowPayload((v) => !v)}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-indigo-600 cursor-pointer"
              >
                <Code2 size={11} />
                {showPayload ? "Hide" : "Show"} Oracle Payload
                {entry.oracle_status_code ? ` (status ${entry.oracle_status_code})` : ""}
              </button>
              {showPayload && (
                <pre className="mt-1.5 text-[10px] font-mono bg-gray-900 text-gray-100 rounded-sm p-2.5 overflow-x-auto max-h-64 overflow-y-auto">
                  {JSON.stringify(entry.oracle_payload, null, 2)}
                </pre>
              )}
            </div>
          )}

          {!entry.passed_validation && entry.hitl_status === "pending" && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-700">
                This entry is rule {entry.rule_id} ({entry.reason_code}) — needs re-routing before it can be approved.
              </p>
            </div>
          )}

          {error && (
            <div className="text-[11px] text-red-600 font-semibold bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          {!isFinal && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleApprove}
                disabled={!canApprove || busy !== null}
                className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-sm bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 cursor-pointer"
              >
                {busy === "approve" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : hadFailedAttempt ? (
                  <RefreshCw size={12} />
                ) : (
                  <CheckCircle2 size={12} />
                )}
                {hadFailedAttempt ? "Retry Approve & Post" : "Approve & Post"}
              </button>
              <button
                onClick={handleReject}
                disabled={!canReject || busy !== null}
                className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-sm border border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-600 disabled:opacity-40 cursor-pointer"
              >
                {busy === "reject" ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                Reject
              </button>
              {canEditGlRate && (
                <button
                  onClick={() => setShowGlRateModal(true)}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-sm border border-gray-300 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40 cursor-pointer ml-auto"
                >
                  <Settings2 size={12} />
                  Edit GL Rate
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showGlRateModal && (
        <EditGlRateModal
          currentRate={entry.fx_invoice_to_functional}
          standardReceiptId={entry.standard_receipt_id}
          saving={glRateSaving}
          error={glRateError}
          onCancel={() => setShowGlRateModal(false)}
          onSubmit={handleGlRateSubmit}
        />
      )}
    </div>
  );
}

export default function DistributedSummaryCard({
  detail,
  onChanged,
}: {
  detail: RowDetail;
  onChanged: () => void;
}) {
  const entries = detail.distribution_breakdown || [];
  const approvedCount = entries.filter((e) => e.hitl_status === "approved").length;
  const rejectedCount = entries.filter((e) => e.hitl_status === "rejected").length;
  const pendingCount = entries.length - approvedCount - rejectedCount;

  return (
    <div className="bg-white border border-gray-200 rounded-sm">
      <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-2.5 flex items-center gap-2">
        <CheckCircle2 size={14} className="text-indigo-600" />
        <h2 className="text-xs font-black text-indigo-800 uppercase tracking-wider">Distributed</h2>
        <span className="text-[11px] text-indigo-400 ml-auto">
          {approvedCount} posted · {pendingCount} pending{rejectedCount > 0 ? ` · ${rejectedCount} rejected` : ""}
        </span>
      </div>

      <div className="p-4 space-y-2">
        <p className="text-[11px] text-gray-500">
          This bank line was broken up via Split &amp; Map. It never gets a receipt of its own — each
          customer/invoice below is approved, rejected, or has its GL rate corrected independently, right here.
        </p>

        {entries.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic">
            No breakdown found on this row — if this looks wrong, check that Split &amp; Map actually
            completed for this row.
          </p>
        ) : (
          <div className="space-y-1.5">
            {entries.map((entry) => (
              <EntryRow key={entry.entry_id} entry={entry} recordId={detail.id} onChanged={onChanged} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}