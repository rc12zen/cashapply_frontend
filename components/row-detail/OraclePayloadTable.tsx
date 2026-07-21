"use client";

/**
 * components/row-detail/OraclePayloadTable.tsx
 * ===============================================
 * Renders the Oracle receipt-creation payload as a table. Extracted
 * from app/analysis-history/row/[id]/page.tsx.
 */
import { fmt } from "./types";
export function OraclePayloadTable({ payload, creditAmount }: { payload: Record<string, any>; creditAmount: number }) {
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

