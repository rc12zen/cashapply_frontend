"use client";

/**
 * components/row-detail/IdentifiedCard.tsx
 * =====================================================
 * Row Detail's CARD 2 — "What was identified": the customer side (with
 * inline correction via a searchable dropdown sourced from the aging
 * report) and the invoice-numbers side. Extracted from
 * app/analysis-history/row/[id]/page.tsx, including all of the
 * customer-name-correction state/handlers that used to live in the page
 * component — this card is now fully self-contained; the page only needs
 * to pass the row's `detail` and a callback to refresh it after a
 * successful correction.
 *
 * Eligibility (canCorrectCustomerName) is computed here from `detail`
 * itself — mirrors rule_engine/customer_name_correction.py's
 * _is_correctable() guard exactly: only for unidentified/needs_remittance/
 * conflict_exception (categories where the AI's own customer guess could
 * plausibly be the actual problem), AND never on a row that already has a
 * SPOC decision recorded (oracle.hitl_status) or an existing manual
 * invoice mapping — re-running matching underneath either would silently
 * overturn a human decision, which the backend refuses outright anyway.
 */
import { CheckCircle2, Hash, Loader2, Pencil, User, ZapIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { correctCustomerName, getCustomerNameOptions } from "@/lib/api";
import { CardShell, CardHead } from "@/components/row-detail/SharedCardPieces";
import SearchableSelect from "@/components/row-detail/SearchableSelect";
import { RowDetail, fmtDate, formatApiError } from "@/components/row-detail/types";

const CUSTOMER_NAME_CORRECTABLE_CATEGORIES = new Set([
  "unidentified", "needs_remittance", "conflict_exception",
]);

export default function IdentifiedCard({ recordId, detail, onCorrected }: {
  recordId: number;
  detail: RowDetail;
  onCorrected: () => Promise<void>;
}) {
  const ex = detail.extraction;

  const canCorrectCustomerName =
    CUSTOMER_NAME_CORRECTABLE_CATEGORIES.has(detail.category || "")
    && !detail.manually_mapped
    && !detail.oracle?.hitl_status;

  // ── Customer name correction ────────────────────────────────────────────────
  const [correctingCustomerName, setCorrectingCustomerName] = useState(false);
  const [customerNameInput, setCustomerNameInput]           = useState("");
  const [customerNameLoading, setCustomerNameLoading]       = useState(false);
  const [customerNameError, setCustomerNameError]           = useState("");
  const [customerNameOptions, setCustomerNameOptions]             = useState<string[]>([]);
  const [customerNameOptionsLoading, setCustomerNameOptionsLoading] = useState(false);
  const [customerNameOptionsError, setCustomerNameOptionsError]   = useState("");

  useEffect(() => {
    setCorrectingCustomerName(false);
    setCustomerNameError("");
    setCustomerNameOptions([]);
    setCustomerNameOptionsError("");
  }, [recordId]);

  const openCorrectCustomerName = async () => {
    setCustomerNameError("");
    setCorrectingCustomerName(true);
    setCustomerNameOptionsLoading(true);
    setCustomerNameOptionsError("");
    try {
      const res = await getCustomerNameOptions(recordId);
      const options: string[] = res.data.customers || [];
      setCustomerNameOptions(options);
      // Pre-select the current AI guess ONLY if it happens to already be
      // a real name in this list -- otherwise leave the picker blank so
      // the SPOC has to actively choose a real one, rather than silently
      // keeping an unmatched guess pre-filled.
      const current = ex.extracted_customer || "";
      setCustomerNameInput(options.includes(current) ? current : "");
    } catch (e: any) {
      setCustomerNameOptionsError(formatApiError(e, "Could not load customer options from the aging report."));
      setCustomerNameOptions([]);
      setCustomerNameInput("");
    }
    setCustomerNameOptionsLoading(false);
  };

  const handleCorrectCustomerName = async () => {
    const chosen = customerNameInput.trim();
    if (!chosen) { setCustomerNameError("Select a customer from the list."); return; }
    setCustomerNameLoading(true);
    setCustomerNameError("");
    try {
      await correctCustomerName(recordId, chosen);
      setCorrectingCustomerName(false);
      await onCorrected();
    } catch (e: any) {
      setCustomerNameError(formatApiError(e, "Could not correct customer name."));
    }
    setCustomerNameLoading(false);
  };

  return (
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
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <User size={10} className="text-gray-400" />
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Customer</span>
            </div>
            {canCorrectCustomerName && !correctingCustomerName && (
              <button
                onClick={openCorrectCustomerName}
                className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-gray-400 hover:text-primary cursor-pointer px-1.5 py-0.5 rounded-xs"
              >
                <Pencil size={9} /> {ex.extracted_customer ? "Correct" : "Add"}
              </button>
            )}
          </div>

          {correctingCustomerName ? (
            <div className="space-y-2">
              {/* PATCH: searchable dropdown sourced from the aging
                  report (aging_map.customers_for_ou()) — replaces
                  the old free-text <input>. Mirrors the Manual
                  Invoice Mapping card's customer picker (both use
                  SearchableSelect). */}
              {customerNameOptionsLoading ? (
                <div className="flex items-center gap-2 text-gray-400 text-[11px] py-1">
                  <Loader2 size={12} className="animate-spin" /> Loading customers from aging report…
                </div>
              ) : customerNameOptionsError ? (
                <p className="text-[11px] text-red-600 font-semibold">{customerNameOptionsError}</p>
              ) : customerNameOptions.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">
                  No customers found for this row's OU in the currently-loaded aging report.
                </p>
              ) : (
                <SearchableSelect
                  autoFocus
                  value={customerNameInput}
                  onChange={setCustomerNameInput}
                  options={customerNameOptions}
                  placeholder="— choose a customer —"
                  searchPlaceholder="Search customers…"
                  emptyMessage="No customer matches your search."
                />
              )}
              <p className="text-[10px] text-gray-400">
                Picked from the currently-loaded aging report — re-runs matching against
                this name once saved; the row may move to a different category (e.g.
                Ready for Oracle, or a different exception).
              </p>
              {customerNameError && (
                <p className="text-[11px] font-semibold text-red-600">{customerNameError}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCorrectCustomerName}
                  disabled={customerNameLoading || !customerNameInput.trim() || customerNameOptionsLoading}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider bg-[#222222] hover:bg-black text-white px-3 py-1.5 rounded-sm cursor-pointer disabled:opacity-50"
                >
                  {customerNameLoading && <Loader2 size={11} className="animate-spin" />}
                  {customerNameLoading ? "Saving…" : "Save & Re-evaluate"}
                </button>
                <button
                  onClick={() => { setCorrectingCustomerName(false); setCustomerNameError(""); }}
                  disabled={customerNameLoading}
                  className="text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-primary px-2 py-1.5 rounded-sm cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : ex.extracted_customer ? (
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
                {ex.customer_name_corrected && (
                  <span
                    className="text-[9px] font-black bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-xs uppercase tracking-wider"
                    title={
                      ex.customer_name_corrected_by
                        ? `Corrected by ${ex.customer_name_corrected_by}${ex.customer_name_corrected_at ? ` on ${fmtDate(ex.customer_name_corrected_at)}` : ""}`
                        : "Corrected by a SPOC"
                    }
                  >
                    <Pencil size={9} className="inline mr-1 -mt-0.5" />
                    Corrected{ex.ai_extracted_customer_name ? ` from "${ex.ai_extracted_customer_name}"` : ""}
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
  );
}
