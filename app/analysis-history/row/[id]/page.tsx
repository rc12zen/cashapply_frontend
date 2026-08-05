"use client";
/**
 * Row Detail — /app/analysis-history/row/[id]/page.tsx
 *
 * PATCH: this page used to be ~1,265 lines with every card's markup,
 * state, and handlers inlined directly here. It's now an orchestrator:
 * fetches the row, derives a handful of shared values (status, reason
 * sentence, special flags), and composes the extracted card components
 * below it. Each card that has meaningful state/behavior of its own
 * (customer-name correction, manual invoice mapping) now OWNS that
 * state internally — this page only passes it `detail` and a callback
 * to refresh the row afterward. See components/row-detail/ for all of it:
 *   - RowDetailHeader        — top bar: back, breadcrumb, ActionBar, error strip
 *   - StatusBanners          — "Posted to Oracle" / "Oracle Post Failed" banners
 *   - specialFlags.tsx       — SpecialFlagsBanner + deriveSpecialFlags/deriveCrossFlags
 *   - PaymentReceivedCard    — Card 1
 *   - IdentifiedCard         — Card 2 (+ self-contained customer-name correction)
 *   - ManualInvoiceMappingCard — Card 2.5 (fully self-contained; renders
 *                                nothing when the row isn't eligible)
 *   - AgingSnapshotCard      — Card 3
 *   - WhyStatusCard          — Card 4 (reason sentence, cross-OU comparison,
 *                                amount comparison)
 *   - OracleFusionCard       — Card 5
 *   - RemittancePanel        — right-side panel (already extracted previously)
 *
 * Changes from base version (unchanged behavior, just relocated):
 *  - Header: breadcrumb (Date · Run ID · Category · Row ID), no narrative
 *  - Special flags banner: Acceptable Short Payment / Invoice currency !=
 *    Credited Currency / Cross Ledger / Cross Entity — shown above Card 1
 *    when applicable
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
 *  - Manual Invoice Mapping card — shown for any row that is NOT already
 *    ready_for_oracle or processed (unidentified, needs_remittance,
 *    conflict_exception, post_failed, rejected). Lets a SPOC hand-pick
 *    invoice(s) from the currently-loaded aging report; amounts are
 *    ALWAYS auto-loaded from the aging report, never typed. Confirming a
 *    qualifying selection only RE-CLASSIFIES the row into ready_for_oracle
 *    — it does NOT post to Oracle. The existing Approve & Post button
 *    is what actually posts, once the row shows up there — same two-gate
 *    model as an automatic match.
 *    Backend: hitl/manual_mapping.py via /api/hitl/{id}/mapping-*.
 *
 *  - Customer-name correction uses a searchable dropdown sourced from the
 *    currently-loaded aging report (aging_map.customers_for_ou()), exactly
 *    mirroring the Manual Invoice Mapping card's customer picker — not a
 *    free-text box. Backend: rule_engine/customer_name_correction.py's
 *    get_customer_name_options() + server-side validation in
 *    correct_customer_name() (rejects anything not a real aging-report
 *    name, regardless of what's sent).
 */
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { approveEntry, rejectEntry, retryOracle, getRowDetail, recheckRemittance, markEligible, discardEntry, editGlRate, settlementOverride } from "@/lib/api";

import { usePageGuard } from "@/lib/usePageGuard";
import PageAccessDenied from "@/components/PageAccessDenied";

import { RowDetail, formatApiError, getReasonConfig, deriveStatus } from "@/components/row-detail/types";
import { RemittancePanel } from "@/components/row-detail/RemittancePanel";
import RowDetailHeader from "@/components/row-detail/RowDetailHeader";
import StatusBanners from "@/components/row-detail/StatusBanners";
import { SpecialFlagsBanner, deriveSpecialFlags, deriveCrossFlags } from "@/components/row-detail/specialFlags";
import PaymentReceivedCard from "@/components/row-detail/PaymentReceivedCard";
import IdentifiedCard from "@/components/row-detail/IdentifiedCard";
import ManualInvoiceMappingCard from "@/components/row-detail/ManualInvoiceMappingCard";
import PaymentDistributionCard from "@/components/row-detail/PaymentDistributionCard";
import AgingSnapshotCard from "@/components/row-detail/AgingSnapshotCard";
import WhyStatusCard from "@/components/row-detail/WhyStatusCard";
import OracleFusionCard from "@/components/row-detail/OracleFusionCard";
import EditGlRateModal from "@/components/row-detail/EditGlRateModal";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RowDetailPage() {
  const { allowed, checking } = usePageGuard("run:view");
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

  const fetchDetail = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    try { const res = await getRowDetail(recordId); setDetail(res.data); }
    catch { setDetail(null); }
    setLoading(false);
  }, [recordId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // Auto-open remittance panel when one was found
  useEffect(() => { if (detail?.remittance) setRemittanceCollapsed(false); }, [detail?.remittance]);

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

  const handleMarkEligible = async () => {
    if (!detail) return;
    setActionLoading(true); setActionError("");
    try { await markEligible(recordId); await fetchDetail(); }
    catch (e: any) { setActionError(formatApiError(e, "Could not mark this row eligible.")); }
    setActionLoading(false);
  };

  const handleDiscard = async () => {
    if (!detail) return;
    const comment = window.prompt("Reason for discarding this row (optional):") || undefined;
    setActionLoading(true); setActionError("");
    try { await discardEntry(recordId, comment); await fetchDetail(); }
    catch (e: any) { setActionError(formatApiError(e, "Could not discard this row.")); }
    setActionLoading(false);
  };

  const handleSettlementOverride = async () => {
    if (!detail) return;
    setActionLoading(true); setActionError("");
    try { await settlementOverride(recordId); await fetchDetail(); }
    catch (e: any) { setActionError(formatApiError(e, "Could not move this row to the customer-payment bucket.")); }
    setActionLoading(false);
  };

  const [glRateModalOpen, setGlRateModalOpen] = useState(false);
  const [glRateSaving, setGlRateSaving] = useState(false);
  const [glRateError, setGlRateError] = useState("");

  const handleEditGlRate = async (data: { new_rate: number; reason: string }) => {
    setGlRateSaving(true); setGlRateError("");
    try {
      await editGlRate(recordId, data.new_rate, data.reason || undefined);
      setGlRateModalOpen(false);
      await fetchDetail();
    } catch (e: any) { setGlRateError(formatApiError(e, "Could not update the GL rate.")); }
    setGlRateSaving(false);
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

  // Dispatches a code from `available_actions` (server-computed -- see
  // hitl/actions_registry.py) to the actual handler. "map_invoice" isn't a
  // one-click API call -- it just scrolls to/reveals the Manual Invoice
  // Mapping card below, which already has its own picker UI.
  const [busyActionCode, setBusyActionCode] = useState<string | null>(null);
  const handleAction = async (code: string) => {
    setBusyActionCode(code);
    try {
      if (code === "approve") await handleApprove();
      else if (code === "reject") await handleReject();
      else if (code === "retry_oracle") await handleRetry();
      else if (code === "recheck_remittance") await handleRecheckRemittance();
      else if (code === "mark_eligible") await handleMarkEligible();
      else if (code === "discard") await handleDiscard();
      else if (code === "settlement_override") await handleSettlementOverride();
      else if (code === "edit_gl_rate") setGlRateModalOpen(true);
      else if (code === "map_invoice") {
        document.getElementById("manual-mapping-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } finally {
      setBusyActionCode(null);
    }
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

  // Approve: only for ready_for_oracle rows that haven't been acted on
  // Primary gate: category from backend (_category_for_row in metrics.py).
  // Fallback: row_type on extraction — covers older API responses where
  // category/run_id weren't yet returned by build_row_detail().
  const isReadyForOracle = detail.category === "ready_for_oracle"
    || (!detail.category && (
        ex.row_type === "EXACT_MATCH" || ex.row_type === "ACCEPTABLE_SHORT_PAYMENT"
      ));

  const reasonConfig = getReasonConfig(ex.row_type || oracle.remittance_scenario);

  const payloadRefs: any[] = oracle.payload?.remittanceReferences || [];
  const sumRefs = payloadRefs.reduce((s: number, r: any) => s + Number(r.ReferenceAmount || 0), 0);
  const hasOraclePayload = Object.keys(oracle.payload || {}).filter(k => !k.startsWith("_")).length > 0;

  const { isCrossOU } = deriveCrossFlags(detail);
  const specialFlags = deriveSpecialFlags(detail);

  // Oracle card visibility
  const showOracleCard = hasOraclePayload
    || isReadyForOracle
    || status === "processed"
    || status === "post_failed";

  if (checking) return null;
  if (!allowed) return <PageAccessDenied />;

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex flex-col">

      <RowDetailHeader
        statementDate={bs.statement_date}
        runId={detail.run_id}
        status={status}
        categoryLabel={detail.category_label}
        recordId={recordId}
        availableActions={detail.available_actions || []}
        onAction={handleAction}
        busyCode={actionLoading || recheckLoading ? busyActionCode : null}
        actionError={actionError}
        onClearError={() => setActionError("")}
        onBack={goBack}
      />

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left — scrollable cards */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-5 py-5 space-y-4">

            <StatusBanners
              isProcessed={isProcessed}
              isPostFailed={isPostFailed}
              oracle={oracle}
              creditAmount={credit_amount}
              currency={bs.currency}
              businessUnit={bs.business_unit}
            />

            <SpecialFlagsBanner flags={specialFlags} />

            <PaymentReceivedCard bs={bs} />

            <IdentifiedCard recordId={recordId} detail={detail} onCorrected={fetchDetail} />

            {detail.category === "needs_distribution" ? (
              <PaymentDistributionCard recordId={recordId} onDistributed={fetchDetail} />
            ) : (
              <ManualInvoiceMappingCard recordId={recordId} detail={detail} onMapped={fetchDetail} />
            )}

            {confirmed_invoices.length > 0 && (
              <AgingSnapshotCard
                confirmedInvoices={confirmed_invoices}
                sumOutstanding={sum_outstanding}
                creditAmount={credit_amount}
                bankCurrency={bs.currency}
                sumRefs={sumRefs}
              />
            )}

            <WhyStatusCard
              reasonConfig={reasonConfig}
              isCrossOU={isCrossOU}
              ouEvidence={detail.ou_evidence}
              extractedCustomerName={ex.extracted_customer}
              bankOuDisplayName={bs.ou_display_name}
              bankBusinessUnit={bs.business_unit}
              bankOuNumber={bs.ou_number}
              confirmedInvoices={confirmed_invoices}
              sumOutstanding={sum_outstanding}
              creditAmount={credit_amount}
              bankCurrency={bs.currency}
            />

            {showOracleCard && (
              <OracleFusionCard oracle={oracle} creditAmount={credit_amount} hasOraclePayload={hasOraclePayload} />
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

      {glRateModalOpen && (
        <EditGlRateModal
          currentRate={oracle.payload?.ConversionRate ?? null}
          standardReceiptId={oracle.standard_receipt_id}
          saving={glRateSaving}
          error={glRateError}
          onCancel={() => { setGlRateModalOpen(false); setGlRateError(""); }}
          onSubmit={handleEditGlRate}
        />
      )}
    </div>
  );
}