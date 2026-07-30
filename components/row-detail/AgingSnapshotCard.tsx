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
import { CheckCircle2, FileText } from "lucide-react";
import { CardShell, CardHead } from "@/components/row-detail/SharedCardPieces";
import { ConfirmedInvoice, fmt, fmtDate } from "@/components/row-detail/types";

export default function AgingSnapshotCard({
  confirmedInvoices, sumOutstanding, creditAmount, bankCurrency, sumRefs,
}: {
  confirmedInvoices: ConfirmedInvoice[];
  sumOutstanding: number;
  creditAmount: number;
  bankCurrency: string;
  sumRefs: number;
}) {
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
              {["Invoice #", "Customer", "Invoice Date", "Outstanding", "Currency", "OU", "Allocated"].map(h => (
                <th key={h} className={`px-4 py-3 text-[9px] font-black uppercase tracking-wider ${h === "Outstanding" || h === "Allocated" ? "text-right" : "text-left"}`}>{h}</th>
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
                <td className={`px-4 py-2.5 font-mono font-black text-right ${Math.abs(sumRefs - creditAmount) < 0.02 ? "text-emerald-700" : "text-red-600"}`}>
                  {fmt(sumRefs)}
                  {Math.abs(sumRefs - creditAmount) >= 0.02 && <span className="ml-1.5 text-[9px]">⚠ mismatch</span>}
                </td>
              </tr>
              <tr className="bg-blue-50/50">
                <td colSpan={3} className="px-4 py-2 text-[9px] font-black text-[#222222] uppercase tracking-wider">Bank credit amount</td>
                <td colSpan={4} className="px-4 py-2 font-mono font-black text-right text-[#222222]">{fmt(creditAmount)} {bankCurrency}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </CardShell>
  );
}
