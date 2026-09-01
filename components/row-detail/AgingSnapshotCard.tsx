"use client";

/**
 * components/row-detail/AgingSnapshotCard.tsx
 * =====================================================
 * Row Detail's CARD 3 — the matched invoice(s) as they stood in the aging
 * report, with the totals footer comparing summed outstanding / summed
 * Oracle remittance references against the actual bank credit. Only
 * rendered when at least one invoice was matched (caller decides that).
 * Pure presentational, extracted verbatim from
 * app/analysis-history/row/[id]/page.tsx.
 */
import { CheckCircle2, FileText, Loader2, Undo2 } from "lucide-react";
import { CardShell, CardHead } from "@/components/row-detail/SharedCardPieces";
import { ConfirmedInvoice, FxView, fmt, fmtDate } from "@/components/row-detail/types";

export default function AgingSnapshotCard({
  confirmedInvoices, sumOutstanding, creditAmount, bankCurrency, sumRefs, fx,
  canReverse, reversingInvoice, onReverse,
}: {
  confirmedInvoices: ConfirmedInvoice[];
  sumOutstanding: number;
  creditAmount: number;
  bankCurrency: string;
  sumRefs: number;
  fx?: FxView;
  // Receipt reversal — see hitl/service.py::reverse_receipt_invoice().
  // canReverse mirrors the server-computed "reverse_receipt" action being
  // in available_actions (row has an active application to unapply);
  // rendered per-invoice here rather than as a single row-level
  // ActionBar button, since only ONE invoice is unapplied per call. All
  // three optional so this card still works standalone wherever it's
  // used without receipt-reversal context (e.g. distribution entries).
  canReverse?: boolean;
  reversingInvoice?: string | null;
  onReverse?: (invoiceNumber: string) => void;
}) {
  // sumRefs (allocated) and sumOutstanding are in invoice currency, so the
  // "balanced?" check must compare against the credited amount CONVERTED to
  // invoice currency — not the raw creditAmount, which is in credited
  // currency and would flag a false mismatch on any cross-currency row.
  const creditInInvoiceCcy = fx ? fx.credit_amount_invoice_ccy : creditAmount;

  // PATCH: the footer used to print the `sumRefs` prop, which the page derives
  // from oracle.payload.remittanceReferences. But
  // build_receipt_creation_payload() NEVER emits remittanceReferences — those
  // are a separate POST made after approval (see its docstring). So before a
  // row is posted that sum is always 0, and the footer read
  // "0.00 ⚠ mismatch" while the Allocated column right above it showed real
  // per-invoice figures. Two different sources for one number.
  //
  // The footer now totals exactly what its own rows display. Post-posting the
  // reference payload agrees with these anyway, so this is the same number
  // when the payload exists and a correct one when it doesn't. `sumRefs` is
  // still accepted (and preferred once genuinely populated) so nothing else
  // that passes it changes behaviour.
  const sumAllocated = confirmedInvoices.reduce(
    (s, inv) => s + Number(inv.remittance_amount ?? inv.computed_amount ?? 0), 0,
  );
  const allocatedTotal = sumRefs > 0 ? sumRefs : sumAllocated;
  const balanced = Math.abs(allocatedTotal - creditInInvoiceCcy) < 0.02;
  const showConversion = !!(fx && fx.is_cross_currency && fx.fx_credit_to_invoice);
  const invoiceCcy = fx?.invoice_currency || confirmedInvoices[0]?.currency || bankCurrency;
  return (
    <CardShell>
      <CardHead
        icon={<FileText size={13} />}
        title="Aging snapshot"
        right={
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">
            {confirmedInvoices.length} invoice{confirmedInvoices.length !== 1 ? "s" : ""}
          </span>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-[#222222] text-white">
              {["Invoice #", "Customer", "Invoice Date", "Outstanding", "Currency", "OU", "Allocated", ...(canReverse ? ["Action"] : [])].map(h => (
                <th key={h} className={`px-4 py-3 text-[9px] font-black uppercase tracking-wider ${h === "Outstanding" || h === "Allocated" ? "text-right" : h === "Action" ? "text-center" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {confirmedInvoices.map((inv, i) => {
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
                  {canReverse && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => onReverse?.(inv.invoice_number)}
                        disabled={reversingInvoice === inv.invoice_number}
                        title="Unapply this invoice from the receipt (SOAP processUnapplyReceipt) — the receipt itself stays live for reuse"
                        className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-xs cursor-pointer disabled:opacity-40"
                      >
                        {reversingInvoice === inv.invoice_number
                          ? <Loader2 size={10} className="animate-spin" />
                          : <Undo2 size={10} />}
                        Reverse
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {confirmedInvoices.length > 1 && (
            <tfoot className="border-t-2 border-gray-200">
              <tr className="bg-gray-50">
                <td colSpan={3} className="px-4 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-wider">Total</td>
                <td className="px-4 py-2.5 font-mono font-black text-right text-[#222222]">{fmt(sumOutstanding)}</td>
                <td colSpan={2} />
                <td className={`px-4 py-2.5 font-mono font-black text-right ${balanced ? "text-emerald-700" : "text-red-600"}`}>
                  {fmt(allocatedTotal)}
                  {!balanced && <span className="ml-1.5 text-[9px]">⚠ mismatch</span>}
                </td>
                {canReverse && <td />}
              </tr>
              <tr className="bg-blue-50/50">
                <td colSpan={3} className="px-4 py-2 text-[9px] font-black text-[#222222] uppercase tracking-wider">Bank credit amount</td>
                <td colSpan={canReverse ? 5 : 4} className="px-4 py-2 font-mono font-black text-right text-[#222222]">
                  {fmt(creditAmount)} {bankCurrency}
                  {/* Cross-currency: the allocated total above is in invoice
                      currency, so show the credited amount's invoice-currency
                      equivalent to make the comparison legible. */}
                  {showConversion && (
                    <span className="ml-1.5 text-[10px] font-bold text-gray-500">
                      (= {fmt(creditInInvoiceCcy)} {invoiceCcy} @ {fmt(fx!.fx_credit_to_invoice, 4)})
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </CardShell>
  );
}
