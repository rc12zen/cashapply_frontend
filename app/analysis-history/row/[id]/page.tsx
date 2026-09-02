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
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { approveEntry, rejectEntry, retryOracle, getRowDetail, recheckRemittance, markEligible, discardEntry, editGlRate, editReceiptFields, settlementOverride, parkOverpayment, reverseReceiptInvoice, deleteReceipt } from "@/lib/api";

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
import DistributedSummaryCard from "@/components/row-detail/DistributedSummaryCard";
import AgingSnapshotCard from "@/components/row-detail/AgingSnapshotCard";
import WhyStatusCard from "@/components/row-detail/WhyStatusCard";
import OverpaymentCard from "@/components/row-detail/OverpaymentCard";
import ShortageCard from "@/components/row-detail/ShortageCard";
import HandleOverpaymentModal from "@/components/row-detail/HandleOverpaymentModal";
import OracleFusionCard from "@/components/row-detail/OracleFusionCard";
import EditGlRateModal from "@/components/row-detail/EditGlRateModal";
import EditReceiptModal from "@/components/row-detail/EditReceiptModal";
import RejectRowModal from "@/components/row-detail/RejectRowModal";
import ReopenAndReviewModal from "@/components/row-detail/ReopenAndReviewModal";
import ReverseReceiptModal from "@/components/row-detail/ReverseReceiptModal";
import DeleteReceiptModal from "@/components/row-detail/DeleteReceiptModal";
import DeleteReceiptChoiceModal from "@/components/row-detail/DeleteReceiptChoiceModal";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RowDetailPage() {
  const { allowed, checking } = usePageGuard("run:view");
  const params       = useParams();
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

  // BUGFIX (2026-09-02): returning to /analysis-history from here via
  // `router.push` — a soft, client-side App Router navigation — is the
  // actual root cause of "clicking a group tab does nothing after coming
  // back from a row". Next's App Router keeps a client-side Router Cache
  // per route+search-params combo so back/forward feels instant; landing
  // back on `/analysis-history?run_id=...` (a URL/segment it has already
  // rendered once, right before we navigated away to this row) can reuse
  // that cached render instead of doing a genuine fresh mount. The list
  // page's OWN data (tab counts) still refreshes correctly, because that
  // comes from its own effect re-fetching on the `run_id` search-param
  // change — but the tab BUTTONS' click wiring is tied to whatever
  // instance Next decided to reuse, which is why clicks can silently stop
  // doing anything even though the numbers look fresh. A real hard reload
  // (F5) or a full round trip through the plain run list — both of which
  // never hit that cached, same-URL case — reliably "fixed" it, which is
  // the same clue in reverse. So instead of a soft `router.push` back to
  // the exact URL Next has already cached, force a real full-page
  // navigation here (same effect as a hard refresh): this always produces
  // a brand-new mount with correctly wired click handlers, at the cost of
  // one real page load instead of an instant client transition.
  const goBack = () => {
    if (runIdParam) window.location.assign(`/analysis-history?run_id=${runIdParam}`);
    else window.location.assign("/analysis-history");
  };

  const handleApprove = async () => {
    if (!detail) return;
    setActionLoading(true); setActionError("");
    try { await approveEntry(recordId); await fetchDetail(); }
    catch (e: any) { setActionError(formatApiError(e)); }
    setActionLoading(false);
  };

  // Reject now collects a REASON first (RejectRowModal). The backend always
  // accepted one; nothing ever sent it, so every rejection was reasonless —
  // which left the reopen screen with nothing to explain itself with.
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectBusy, setRejectBusy]           = useState(false);
  const [rejectError, setRejectError]         = useState("");

  const handleReject = () => { setRejectError(""); setRejectModalOpen(true); };

  const submitReject = async (comment: string) => {
    setRejectBusy(true); setRejectError("");
    try {
      await rejectEntry(recordId, comment || undefined);
      setRejectModalOpen(false);
      await fetchDetail();
    } catch (e: any) {
      setRejectError(formatApiError(e, "Could not reject this row."));
    }
    setRejectBusy(false);
  };

  // Reopen opens the Reopen & Review modal rather than firing immediately.
  // Reject never rewrites rule_id, and the bucket derives FROM rule_id, so the
  // old one-click undo always handed the row back in the bucket it was rejected
  // from with the same mapping. The modal is what lets the SPOC change something
  // and have the bucket recompute — see hitl/reopen_with_edits.py.
  const [reopenModalOpen, setReopenModalOpen] = useState(false);

  const handleReopen = () => setReopenModalOpen(true);

  // An overpaid row has ONE entry point — see HandleOverpaymentModal. The dialog
  // owns the choice; this component only executes whichever outcome came back.
  const [parkModalOpen, setParkModalOpen] = useState(false);
  const [parkBusy, setParkBusy]           = useState(false);
  const [parkError, setParkError]         = useState<string | null>(null);

  // "Apply & Post" — no state change here. The invoice picker is where the
  // amounts (and the reason for whatever stays unapplied) are actually decided,
  // so this just closes the dialog and puts the SPOC in front of it.
  const handleApplyRoute = () => {
    setParkModalOpen(false);
    document.getElementById("manual-mapping-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // "Explain & Close" — records the reason and takes the row out of the queue.
  // No Oracle call. Errors stay inside the dialog so the SPOC can adjust rather
  // than losing what they typed.
  const handleExplainAndClose = async (disposition: string, comment: string) => {
    setParkBusy(true); setParkError(null);
    try {
      await parkOverpayment(recordId, disposition, comment);
      setParkModalOpen(false);
      await fetchDetail();
    } catch (e: any) {
      setParkError(formatApiError(e, "Could not close this row."));
    }
    setParkBusy(false);
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

  // Unified "Edit Receipt" modal -- account number / OU / receipt method /
  // rate / dates. See hitl/service.py's edit_receipt_fields().
  const [editReceiptModalOpen, setEditReceiptModalOpen] = useState(false);
  const [editReceiptSaving, setEditReceiptSaving] = useState(false);
  const [editReceiptError, setEditReceiptError] = useState("");

  const handleEditReceiptFields = async (data: Parameters<typeof editReceiptFields>[1]) => {
    setEditReceiptSaving(true); setEditReceiptError("");
    try {
      const res = await editReceiptFields(recordId, data);
      if (res.data?.validation_warning) {
        // Non-blocking per the "warn but allow" policy -- still closes the
        // modal and refreshes, but leaves the warning visible via the
        // general action-error strip rather than silently dropping it.
        setActionError(`Saved with a warning: ${res.data.validation_warning}`);
      }
      setEditReceiptModalOpen(false);
      await fetchDetail();
    } catch (e: any) { setEditReceiptError(formatApiError(e, "Could not update the receipt fields.")); }
    setEditReceiptSaving(false);
  };

  // Reverse (per-invoice SOAP unapply) — opened from a specific invoice
  // row in AgingSnapshotCard, not from the row-level ActionBar (see that
  // component's ICON_MAP comment). reverseInvoiceNumber doubles as "which
  // invoice is this modal open for" and "which invoice's inline button
  // shows a spinner".
  const [reverseInvoiceNumber, setReverseInvoiceNumber] = useState<string | null>(null);
  const [reverseBusy, setReverseBusy]   = useState(false);
  const [reverseError, setReverseError] = useState("");

  const handleOpenReverse = (invoiceNumber: string) => {
    setReverseError("");
    setReverseInvoiceNumber(invoiceNumber);
  };

  const submitReverse = async (comment: string) => {
    if (!reverseInvoiceNumber) return;
    setReverseBusy(true); setReverseError("");
    try {
      await reverseReceiptInvoice(recordId, reverseInvoiceNumber, comment || undefined);
      setReverseInvoiceNumber(null);
      await fetchDetail();
    } catch (e: any) {
      setReverseError(formatApiError(e, "Could not reverse this invoice."));
    }
    setReverseBusy(false);
  };

  // Delete Receipt — a confirm-with-reason modal, then (on success) the
  // Create-New-vs-Discard follow-up. See hitl/service.py::delete_receipt().
  const [deleteReceiptModalOpen, setDeleteReceiptModalOpen] = useState(false);
  const [deleteReceiptBusy, setDeleteReceiptBusy]           = useState(false);
  const [deleteReceiptError, setDeleteReceiptError]         = useState("");
  const [deleteChoiceOpen, setDeleteChoiceOpen]             = useState(false);
  const [deletedReceiptNumber, setDeletedReceiptNumber]     = useState<string | null>(null);
  const [discardBusy, setDiscardBusy]                       = useState(false);
  const [discardError, setDiscardError]                     = useState("");

  const submitDeleteReceipt = async (comment: string) => {
    setDeleteReceiptBusy(true); setDeleteReceiptError("");
    try {
      const res = await deleteReceipt(recordId, comment || undefined);
      setDeletedReceiptNumber(res.data?.deleted_receipt_number || null);
      setDeleteReceiptModalOpen(false);
      setDeleteChoiceOpen(true);
      await fetchDetail();
    } catch (e: any) {
      setDeleteReceiptError(formatApiError(e, "Could not delete this receipt."));
    }
    setDeleteReceiptBusy(false);
  };

  const handleCreateNewAfterDelete = () => {
    // No special call — the row's server-recomputed category/
    // available_actions already reflect the reset (receipt fields
    // cleared) state from delete_receipt(); the normal Create Receipts /
    // Approve flow picks it up from here like any other row.
    setDeleteChoiceOpen(false);
  };

  const handleDiscardAfterDelete = async (comment: string) => {
    setDiscardBusy(true); setDiscardError("");
    try {
      await discardEntry(recordId, comment || undefined);
      setDeleteChoiceOpen(false);
      await fetchDetail();
    } catch (e: any) {
      setDiscardError(formatApiError(e, "Could not discard this row."));
    }
    setDiscardBusy(false);
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
      else if (code === "reopen") await handleReopen();
      else if (code === "retry_oracle") await handleRetry();
      else if (code === "recheck_remittance") await handleRecheckRemittance();
      else if (code === "mark_eligible") await handleMarkEligible();
      else if (code === "discard") await handleDiscard();
      else if (code === "settlement_override") await handleSettlementOverride();
      else if (code === "edit_gl_rate") setGlRateModalOpen(true);
      else if (code === "edit_receipt") setEditReceiptModalOpen(true);
      else if (code === "delete_receipt") { setDeleteReceiptError(""); setDeleteReceiptModalOpen(true); }
      else if (code === "handle_overpayment") { setParkError(null); setParkModalOpen(true); }
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
        // "reverse_receipt" is filtered out here — it's per-invoice
        // (rendered inline in AgingSnapshotCard below via canReverse/
        // onReverse), not a single row-level button, since a row can have
        // more than one applied invoice and this action needs to know
        // WHICH one. See ActionBar.tsx's ICON_MAP comment.
        availableActions={(detail.available_actions || []).filter((a) => a.code !== "reverse_receipt")}
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

            <PaymentReceivedCard recordId={recordId} bs={bs} />

            <IdentifiedCard recordId={recordId} detail={detail} onCorrected={fetchDetail} />

            {detail.category === "needs_distribution" ? (
              <PaymentDistributionCard recordId={recordId} onDistributed={fetchDetail} />
            ) : detail.category === "distributed" ? (
              <DistributedSummaryCard detail={detail} onChanged={fetchDetail} />
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
                fx={detail.fx}
                canReverse={(detail.available_actions || []).some((a) => a.code === "reverse_receipt")}
                reversingInvoice={reverseBusy ? reverseInvoiceNumber : null}
                onReverse={handleOpenReverse}
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
              fx={detail.fx}
            />

            {/* Only rendered for a row that is, was, or resolved an overpayment
                — the backend returns null for everything else. Sits directly
                below "Why this status" because it IS the why for these rows. */}
            {detail.overpayment && <OverpaymentCard op={detail.overpayment} />}

            {/* Same contract, opposite sign — null for anything that isn't a
                short payment. A row is never both, so these two never render
                together. */}
            {detail.shortage && <ShortageCard sh={detail.shortage} />}

            {showOracleCard && (
              <OracleFusionCard oracle={oracle} creditAmount={credit_amount} hasOraclePayload={hasOraclePayload} fx={detail.fx} />
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

      {editReceiptModalOpen && (
        <EditReceiptModal
          recordId={recordId}
          currentAccountNumber={oracle.payload?.RemittanceBankAccountNumber ?? null}
          currentOuNumber={bs.ou_number ?? null}
          currentReceiptMethod={oracle.payload?.ReceiptMethod ?? null}
          currentRate={oracle.payload?.ConversionRate ?? null}
          isCrossLedger={!!detail.is_cross_ledger}
          currentReceiptDate={oracle.payload?.ReceiptDate ?? bs.statement_date ?? null}
          currentAccountingDate={oracle.payload?.AccountingDate ?? null}
          standardReceiptId={oracle.standard_receipt_id}
          saving={editReceiptSaving}
          error={editReceiptError}
          onCancel={() => { setEditReceiptModalOpen(false); setEditReceiptError(""); }}
          onSubmit={handleEditReceiptFields}
        />
      )}

      {detail.overpayment && (
        <HandleOverpaymentModal
          open={parkModalOpen}
          onClose={() => { setParkModalOpen(false); setParkError(null); }}
          onApply={handleApplyRoute}
          onExplain={handleExplainAndClose}
          receivedTotal={detail.overpayment.received_total}
          targetTotal={detail.overpayment.target_total}
          excessAmount={detail.overpayment.excess_amount}
          currency={detail.overpayment.invoice_currency}
          options={detail.overpayment.disposition_options}
          busy={parkBusy}
          error={parkError}
        />
      )}

      {rejectModalOpen && (
        <RejectRowModal
          saving={rejectBusy}
          error={rejectError}
          onCancel={() => { setRejectModalOpen(false); setRejectError(""); }}
          onSubmit={submitReject}
        />
      )}

      {reopenModalOpen && (
        <ReopenAndReviewModal
          recordId={recordId}
          onCancel={() => setReopenModalOpen(false)}
          onDone={fetchDetail}
        />
      )}

      {reverseInvoiceNumber && (
        <ReverseReceiptModal
          invoiceNumber={reverseInvoiceNumber}
          saving={reverseBusy}
          error={reverseError}
          onCancel={() => { setReverseInvoiceNumber(null); setReverseError(""); }}
          onSubmit={submitReverse}
        />
      )}

      {deleteReceiptModalOpen && (
        <DeleteReceiptModal
          saving={deleteReceiptBusy}
          error={deleteReceiptError}
          onCancel={() => { setDeleteReceiptModalOpen(false); setDeleteReceiptError(""); }}
          onSubmit={submitDeleteReceipt}
        />
      )}

      {deleteChoiceOpen && (
        <DeleteReceiptChoiceModal
          deletedReceiptNumber={deletedReceiptNumber}
          saving={discardBusy}
          error={discardError}
          onClose={() => { setDeleteChoiceOpen(false); setDiscardError(""); }}
          onCreateNew={handleCreateNewAfterDelete}
          onDiscard={handleDiscardAfterDelete}
        />
      )}
    </div>
  );
}