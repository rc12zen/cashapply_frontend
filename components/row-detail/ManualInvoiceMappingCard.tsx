"use client";

/**
 * components/row-detail/ManualInvoiceMappingCard.tsx
 * =====================================================
 * Row Detail's CARD 2.5 — Manual Invoice Mapping. Lets a SPOC hand-pick
 * invoice(s) from the currently-loaded aging report for any row that
 * isn't already ready_for_oracle/processed; amounts are ALWAYS auto-loaded
 * from the aging report, never typed. Confirming a qualifying selection
 * only RE-CLASSIFIES the row into ready_for_oracle — it does NOT post to
 * Oracle (the existing Approve & Post action does that once the row shows
 * up there — same two-gate model as an automatic match).
 * Backend: hitl/manual_mapping.py via /api/hitl/{id}/mapping-*.
 *
 * Extracted from app/analysis-history/row/[id]/page.tsx, including all of
 * the mapping state/handlers that used to live in the page component —
 * this card is now fully self-contained, including its own eligibility
 * check (renders nothing when the row isn't eligible). The page only
 * needs to render it unconditionally and pass a callback to refresh the
 * row after a successful mapping.
 */
import { AlertTriangle, Check, CheckCircle2, Hash, Loader2, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMappingOptions, getInvoicesForCustomer, previewManualMapping, confirmManualMapping,
} from "@/lib/api";
import { CardShell, CardHead } from "@/components/row-detail/SharedCardPieces";
import SearchableSelect from "@/components/row-detail/SearchableSelect";
import CustomerCreditsPanel from "@/components/row-detail/CustomerCreditsPanel";
import {
  RowDetail, MappingInvoiceOption, MappingOptionsResponse, MappingPreviewResponse,
  MappingCreditOption, MappingCreditContext,
  fmt, fmtDate, formatApiError, LIST_SEARCH_THRESHOLD,
} from "@/components/row-detail/types";

export default function ManualInvoiceMappingCard({ recordId, detail, onMapped }: {
  recordId: number;
  detail: RowDetail;
  onMapped: () => Promise<void>;
}) {
  const { confirmed_invoices } = detail;

  // Whether this row is even eligible for manual mapping.
  // PATCH: this used to ONLY check category !== "ready_for_oracle" &&
  // category !== "processed" -- which meant an APPROVED row that later
  // landed in post_failed (receipt creation failed AFTER approval), or
  // any other category besides exactly "processed", still showed the
  // Manual Invoice Mapping card. category and "has a SPOC decision been
  // made" are two different things -- hitl_status is set the instant a
  // row is approved/rejected (see hitl/service.py's approve_row()),
  // regardless of what category it's sitting in afterward. Once a row
  // has been approved (or rejected), mapping should never be offered
  // again, in ANY category -- re-mapping underneath an already-made human
  // decision would be nonsensical (the backend's confirm_manual_mapping()
  // doesn't specifically guard this today, so this is currently the ONLY
  // place enforcing it -- worth confirming the backend also refuses it).
  const canManuallyMap = detail.category !== "ready_for_oracle"
    && detail.category !== "processed"
    // NEW: a Needs Distribution row (credit card / cheque / third-party —
    // see specialFlags.tsx's badges) is a CONSOLIDATED multi-customer bank
    // line by design — single-customer Manual Invoice Mapping doesn't
    // make sense on it until a SPOC explicitly says "treat this one as a
    // direct customer payment instead" (settlement_override_at set — see
    // hitl/service.py's override_settlement_as_customer_payment()). Once
    // overridden, the row's category itself falls back to "unidentified"
    // server-side (bff/metrics.py's _category_for_row), so this condition
    // naturally stops excluding it — no separate override flag needed here.
    && detail.category !== "needs_distribution"
    && !detail.manually_mapped
    && !detail.oracle?.hitl_status;

  // PATCH: whether this row already has a valid SPOC-confirmed mapping —
  // used below to show a clear "already mapped" summary instead of
  // re-presenting a blank invoice picker. Requires both the persistent
  // manually_mapped flag (db/models.py) AND an actual confirmed invoice to
  // show (belt-and-suspenders — manually_mapped should never be true with
  // zero confirmed_invoices, but don't render a summary with nothing in it
  // if that ever happens).
  const alreadyMapped = !!detail.manually_mapped && confirmed_invoices.length > 0;
  const isPostFailed = detail.oracle?.post_status === "failed";

  const [mappingOptions, setMappingOptions]             = useState<MappingOptionsResponse | null>(null);
  const [mappingOptionsLoading, setMappingOptionsLoading] = useState(false);
  const [mappingOptionsError, setMappingOptionsError]   = useState("");
  const [selectedCustomerForMapping, setSelectedCustomerForMapping] = useState("");
  const [customerInvoiceOptions, setCustomerInvoiceOptions]         = useState<MappingInvoiceOption[]>([]);
  // The negative half of the aging report for whichever customer is
  // currently in play. Held separately from mappingOptions because it also
  // has to refresh on the step-2 path, where the SPOC picks a customer by
  // hand and a second request returns that customer's rows.
  const [creditMemos, setCreditMemos]           = useState<MappingCreditOption[]>([]);
  const [unappliedReceipts, setUnappliedReceipts] = useState<MappingCreditOption[]>([]);
  const [creditContext, setCreditContext]       = useState<MappingCreditContext | undefined>(undefined);
  const [selectedInvoiceNumbers, setSelectedInvoiceNumbers]         = useState<Set<string>>(new Set());
  const [mappingPreview, setMappingPreview]             = useState<MappingPreviewResponse | null>(null);
  const [mappingPreviewError, setMappingPreviewError]   = useState("");
  const [mappingPreviewLoading, setMappingPreviewLoading] = useState(false);
  const [confirmMappingLoading, setConfirmMappingLoading] = useState(false);
  const [confirmMappingError, setConfirmMappingError]   = useState("");
  // PATCH: whether the invoice picker is expanded even though this row is
  // already manually mapped. Starts collapsed — see the "already mapped"
  // summary block below, which is the fix for the picker re-appearing
  // blank after a successful confirm with no indication anything had
  // happened.
  const [showRemapPicker, setShowRemapPicker] = useState(false);
  // Free-text filter over the invoice list. Only surfaced once the list is
  // long enough to need it (see LIST_SEARCH_THRESHOLD) -- the median
  // customer in the aging report has 3 open invoices, and putting a search
  // box above three rows is friction, not help.
  const [invoiceQuery, setInvoiceQuery] = useState("");

  useEffect(() => { setShowRemapPicker(false); }, [recordId]);

  // Filter only -- deliberately NOT a re-sort. The aging report's own row
  // order is preserved so the list reads the same here as it does in the
  // source finance works from.
  const visibleInvoiceOptions = useMemo(() => {
    const q = invoiceQuery.trim().toLowerCase();
    if (!q) return customerInvoiceOptions;
    return customerInvoiceOptions.filter(
      (inv) =>
        inv.invoice_number.toLowerCase().includes(q) ||
        (inv.currency || "").toLowerCase().includes(q),
    );
  }, [customerInvoiceOptions, invoiceQuery]);

  const invoiceSearchVisible = customerInvoiceOptions.length > LIST_SEARCH_THRESHOLD;

  const fetchMappingOptions = useCallback(async () => {
    if (!recordId) return;
    setMappingOptionsLoading(true);
    setMappingOptionsError("");
    setSelectedCustomerForMapping("");
    setSelectedInvoiceNumbers(new Set());
    setMappingPreview(null);
    setInvoiceQuery("");
    try {
      const res = await getMappingOptions(recordId);
      setMappingOptions(res.data);
      setCustomerInvoiceOptions(res.data.customer_identified ? (res.data.invoices || []) : []);
      setCreditMemos(res.data.credit_memos || []);
      setUnappliedReceipts(res.data.unapplied_receipts || []);
      setCreditContext(res.data.credit_context);
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
    // A filter left over from the previous customer would silently hide the
    // new one's invoices -- and with the search box only appearing above the
    // threshold, a short list could end up looking empty with no visible
    // control explaining why.
    setInvoiceQuery("");
    if (!customerName) {
      setCustomerInvoiceOptions([]);
      // Clear the credits too — they were scoped to the previous customer,
      // and leaving them up would attribute one customer's credit memos to
      // whoever is picked next.
      setCreditMemos([]); setUnappliedReceipts([]); setCreditContext(undefined);
      return;
    }
    try {
      const res = await getInvoicesForCustomer(recordId, customerName);
      setCustomerInvoiceOptions(res.data.invoices || []);
      setCreditMemos(res.data.credit_memos || []);
      setUnappliedReceipts(res.data.unapplied_receipts || []);
      setCreditContext(res.data.credit_context);
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

  // When the selection OVERPAYS, the backend classifies it R9e and refuses to
  // confirm without a recorded reason for the excess (see hitl/manual_mapping.py).
  // Collected here, in the same step as the invoice picking, because that is the
  // moment the SPOC actually knows what the excess is.
  const isOverpaidSelection = mappingPreview?.rule_id === "R9e";
  const [overpaymentDisposition, setOverpaymentDisposition] = useState("");
  const [overpaymentComment, setOverpaymentComment]         = useState("");
  const overpaymentCommentRequired = overpaymentDisposition === "other";
  const overpaymentReady =
    !isOverpaidSelection ||
    (!!overpaymentDisposition &&
      (!overpaymentCommentRequired || overpaymentComment.trim().length > 0));

  const handleConfirmMapping = async () => {
    if (selectedInvoiceNumbers.size === 0 || !mappingPreview?.qualifies) return;
    if (!overpaymentReady) return;
    setConfirmMappingLoading(true);
    setConfirmMappingError("");
    try {
      await confirmManualMapping(
        recordId,
        Array.from(selectedInvoiceNumbers),
        isOverpaidSelection ? overpaymentDisposition : undefined,
        isOverpaidSelection ? overpaymentComment : undefined,
      );
      setOverpaymentDisposition("");
      setOverpaymentComment("");
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
      await onMapped();
    } catch (e: any) {
      setConfirmMappingError(formatApiError(e, "Could not confirm this mapping."));
    }
    setConfirmMappingLoading(false);
  };

  if (!canManuallyMap) return null;

  return (
    <div id="manual-mapping-card">
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
                  <SearchableSelect
                    value={selectedCustomerForMapping}
                    onChange={handleSelectCustomerForMapping}
                    options={mappingOptions.customers || []}
                    placeholder="— choose a customer —"
                    searchPlaceholder="Search customers…"
                    emptyMessage="No customer matches your search."
                  />
                </div>
              ) : (
                <p className="text-[12px] text-gray-600">
                  Customer already identified: <span className="font-black text-[#222222]">{mappingOptions.customer_name}</span>
                </p>
              )}

              {customerInvoiceOptions.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Select Invoice(s) — amounts auto-loaded from aging report
                    </label>
                    {/* Only meaningful once the list is long enough to be
                        filtered or scrolled past. The selected count matters
                        most exactly then: a filter can hide rows the SPOC has
                        already ticked, and selections deliberately survive
                        filtering, so the tally is the only way to see them. */}
                    {invoiceSearchVisible && (
                      <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                        {visibleInvoiceOptions.length === customerInvoiceOptions.length
                          ? `${customerInvoiceOptions.length} invoices`
                          : `${visibleInvoiceOptions.length} of ${customerInvoiceOptions.length}`}
                        {selectedInvoiceNumbers.size > 0 && (
                          <span className="text-emerald-600"> · {selectedInvoiceNumbers.size} selected</span>
                        )}
                      </span>
                    )}
                  </div>

                  {invoiceSearchVisible && (
                    <div className="relative">
                      <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={invoiceQuery}
                        onChange={(e) => setInvoiceQuery(e.target.value)}
                        placeholder="Filter by invoice number or currency…"
                        className="w-full text-[11px] font-medium border border-gray-300 rounded-xs pl-7 pr-7 py-1.5 outline-none focus:border-[#222222] transition-colors"
                      />
                      {invoiceQuery && (
                        <button
                          type="button"
                          onClick={() => setInvoiceQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 cursor-pointer"
                          aria-label="Clear invoice filter"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Height-capped with internal scroll so a 1,159-invoice
                      customer can't push the credits panel, the qualification
                      feedback and the confirm button off the page. The cap is
                      a max-height, so short lists still size to their content
                      and never gain a scrollbar. */}
                  <div className="border border-gray-200 rounded-xs overflow-hidden">
                    {/* max-h is a STATIC Tailwind class on purpose: it compiles
                        into the stylesheet (governed by style-src 'self')
                        rather than becoming a style="" attribute, which the
                        app's CSP blocks outright. Keep it literal -- a value
                        interpolated from a JS constant would not be seen by
                        Tailwind's scanner and would silently not exist. */}
                    <div className="max-h-[320px] overflow-y-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          {/* sticky on the cells, not the <tr>/<thead> -- those
                              are unreliable targets for position:sticky. */}
                          <tr className="bg-[#222222] text-white">
                            <th className="sticky top-0 z-10 bg-[#222222] px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider w-8"></th>
                            <th className="sticky top-0 z-10 bg-[#222222] px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">Invoice #</th>
                            <th className="sticky top-0 z-10 bg-[#222222] px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider">Outstanding</th>
                            <th className="sticky top-0 z-10 bg-[#222222] px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider">Currency</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {visibleInvoiceOptions.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-4 text-[11px] text-gray-400 italic text-center">
                                No invoice matches “{invoiceQuery}”.
                              </td>
                            </tr>
                          )}
                          {visibleInvoiceOptions.map((inv) => (
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
                </div>
              ) : mappingOptions.customer_identified ? (
                <p className="text-[12px] text-gray-400 italic">No open invoices found for this customer in the loaded aging report.</p>
              ) : selectedCustomerForMapping ? (
                <p className="text-[12px] text-gray-400 italic">No open invoices found for this customer.</p>
              ) : null}

              {/* The negative half of the aging report for this customer.
                  Renders nothing when there is none, so rows for customers
                  with no credit memos look exactly as they did before.
                  Informational — see the component's own docstring for why
                  these are not selectable. */}
              <CustomerCreditsPanel
                creditMemos={creditMemos}
                unappliedReceipts={unappliedReceipts}
                context={creditContext}
              />

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
                          {mappingPreview.excess_amount != null && (
                            <span className="text-amber-700 font-bold">
                              Unapplied: {fmt(mappingPreview.excess_amount)}
                            </span>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Overpaid selection — each invoice will be applied capped at its
                  own outstanding and the difference left unapplied on the
                  receipt, so the reason for the excess is recorded here before
                  the mapping can be confirmed. */}
              {isOverpaidSelection && (
                <div className="px-4 py-3 rounded-xs border border-amber-200 bg-amber-50/50">
                  <p className="text-[11px] font-black uppercase tracking-wider text-amber-800">
                    Why will {fmt(mappingPreview?.excess_amount)} stay unapplied?
                  </p>
                  <p className="text-[10px] text-amber-700 mt-1 leading-snug">
                    {fmt(mappingPreview?.target_total)} will post across the selected
                    invoice(s), each applied at its own outstanding amount.{" "}
                    {fmt(mappingPreview?.excess_amount)} stays unapplied on the receipt in
                    Oracle. A reason is required before you can confirm.
                  </p>
                  <div className="mt-2 space-y-1">
                    {[
                      { code: "duplicate_payment", label: "Duplicate payment" },
                      { code: "cross_ou",          label: "Belongs to another entity" },
                      { code: "advance_payment",   label: "Paid in advance" },
                      { code: "other",             label: "Other (comment required)" },
                    ].map((o) => (
                      <label key={o.code} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="mapping-overpayment-disposition"
                          value={o.code}
                          checked={overpaymentDisposition === o.code}
                          onChange={() => setOverpaymentDisposition(o.code)}
                          className="accent-[#222222]"
                        />
                        <span className="text-[11px] text-gray-700">{o.label}</span>
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={overpaymentComment}
                    onChange={(e) => setOverpaymentComment(e.target.value)}
                    rows={2}
                    placeholder={overpaymentCommentRequired ? "Required — explain the excess" : "Optional note"}
                    className="mt-2 w-full text-[11px] border border-amber-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-[#222222]"
                  />
                </div>
              )}

              {confirmMappingError && (
                <p className="text-[11px] text-red-600 font-bold">{confirmMappingError}</p>
              )}

              <div className="flex items-center gap-3">
                <button
                  disabled={!mappingPreview?.qualifies || confirmMappingLoading || !overpaymentReady}
                  onClick={handleConfirmMapping}
                  className="flex items-center gap-2 bg-[#222222] hover:bg-[#222222] disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2.5 text-[11px] font-black uppercase tracking-wider rounded-sm cursor-pointer transition-colors"
                >
                  {confirmMappingLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="stroke-[3]" />}
                  Confirm Mapping
                </button>
                <p className="text-[10px] text-gray-400 leading-snug">
                  Moves this row to{" "}
                  <span className="font-bold text-gray-500">
                    {isOverpaidSelection ? "Overpayment — Ready to Post" : "Ready for Oracle"}
                  </span>{" "}
                  — does not post. Use Approve &amp; Post afterward.
                </p>
              </div>
            </>
          ) : null}
        </div>
      </CardShell>
    </div>
  );
}
