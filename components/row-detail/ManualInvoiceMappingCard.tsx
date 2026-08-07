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
import { useCallback, useEffect, useState } from "react";
import {
  getMappingOptions, getInvoicesForCustomer, previewManualMapping, confirmManualMapping,
} from "@/lib/api";
import { CardShell, CardHead } from "@/components/row-detail/SharedCardPieces";
import SearchableSelect from "@/components/row-detail/SearchableSelect";
import {
  RowDetail, MappingInvoiceOption, MappingOptionsResponse, MappingPreviewResponse,
  fmt, fmtDate, formatApiError,
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
  const [selectedInvoiceNumbers, setSelectedInvoiceNumbers]         = useState<Set<string>>(new Set());
  const [invoiceQuery, setInvoiceQuery]                 = useState("");
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

  useEffect(() => { setShowRemapPicker(false); }, [recordId]);

  const fetchMappingOptions = useCallback(async () => {
    if (!recordId) return;
    setMappingOptionsLoading(true);
    setMappingOptionsError("");
    setSelectedCustomerForMapping("");
    setSelectedInvoiceNumbers(new Set());
    setInvoiceQuery("");
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
    setInvoiceQuery("");
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
      await onMapped();
    } catch (e: any) {
      setConfirmMappingError(formatApiError(e, "Could not confirm this mapping."));
    }
    setConfirmMappingLoading(false);
  };

  const visibleInvoices = invoiceQuery
    ? customerInvoiceOptions.filter((inv) => inv.invoice_number.toLowerCase().includes(invoiceQuery.toLowerCase()))
    : customerInvoiceOptions;

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
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Select Invoice(s) — amounts auto-loaded from aging report
                    </label>
                    {selectedInvoiceNumbers.size > 0 && (
                      <span className="text-[10px] font-black text-emerald-700 shrink-0">
                        {selectedInvoiceNumbers.size} selected
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={invoiceQuery}
                      onChange={(e) => setInvoiceQuery(e.target.value)}
                      placeholder="Search invoices…"
                      className="w-full text-[11px] font-medium border border-gray-300 rounded-xs pl-7 pr-7 py-1.5 outline-none focus:border-[#222222]"
                    />
                    {invoiceQuery && (
                      <button type="button" onClick={() => setInvoiceQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 cursor-pointer">
                        <X size={11} />
                      </button>
                    )}
                  </div>
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
                        {visibleInvoices.length === 0 ? (
                          <tr><td colSpan={4} className="px-3 py-3 text-[11px] text-gray-400 italic">No invoice matches your search.</td></tr>
                        ) : visibleInvoices.map((inv) => (
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
    </div>
  );
}
