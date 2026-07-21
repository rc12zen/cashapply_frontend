"use client";
/**
 * BreakupModal.tsx
 *
 * Shown when SPOC clicks Approve on a multi-invoice row that either:
 *  - has no remittance per-invoice amounts, OR
 *  - has TDS outside 8–12% and needs manual confirmation
 *
 * Logic:
 *  - Shows each invoice's outstanding amount from aging
 *  - Suggests a proportional distribution of the credit_amount
 *  - "Apply 10% TDS" button recomputes: ref_amount = outstanding * 0.90
 *  - SPOC can override each reference amount manually
 *  - Validates: sum of reference amounts must equal credit_amount (within 1%)
 *  - On confirm → calls approve with invoice_breakup payload
 */

import { AlertTriangle, Check, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

interface BreakupInvoice {
  invoice_number:             string;
  outstanding:                number | null;
  suggested_reference_amount: number | null;
}

interface BreakupAnalysis {
  needs_breakup:   boolean;
  reason:          string;
  invoices:        BreakupInvoice[];
  credit_amount:   number;
  tds_pct:         number | null;
  auto_approved:   boolean;
  breakup_source:  string;
}

interface BreakupItem {
  invoice_number:   string;
  reference_amount: number;
}

interface Props {
  analysis:       BreakupAnalysis;
  onConfirm:      (breakup: BreakupItem[]) => void;
  onCancel:       () => void;
  isPosting:      boolean;
}

export default function BreakupModal({ analysis, onConfirm, onCancel, isPosting }: Props) {
  const { invoices, credit_amount, tds_pct } = analysis;

  // Editable reference amounts — initialised from suggestions
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const inv of invoices) {
      init[inv.invoice_number] = inv.suggested_reference_amount != null
        ? String(inv.suggested_reference_amount)
        : "";
    }
    return init;
  });

  // Recompute when invoices prop changes
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const inv of invoices) {
      init[inv.invoice_number] = inv.suggested_reference_amount != null
        ? String(inv.suggested_reference_amount)
        : "";
    }
    setAmounts(init);
  }, [invoices]);

  const totalOutstanding = invoices.reduce((s, inv) => s + (inv.outstanding || 0), 0);
  const sumAmounts       = Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const diff             = Math.abs(sumAmounts - credit_amount);
  const tolerance        = credit_amount * 0.01;   // 1%
  const isValid          = diff <= tolerance;

  // Apply 10% TDS: each invoice gets outstanding * 0.90
  const applyTds = () => {
    const newAmounts: Record<string, string> = {};
    let allocated = 0;
    invoices.forEach((inv, i) => {
      const outstanding = inv.outstanding || 0;
      const isLast      = i === invoices.length - 1;
      if (isLast) {
        newAmounts[inv.invoice_number] = String(round2(credit_amount - allocated));
      } else {
        const amt = round2(outstanding * 0.90);
        newAmounts[inv.invoice_number] = String(amt);
        allocated += amt;
      }
    });
    setAmounts(newAmounts);
  };

  // Apply proportional distribution
  const applyProportional = () => {
    const newAmounts: Record<string, string> = {};
    let allocated = 0;
    invoices.forEach((inv, i) => {
      const outstanding = inv.outstanding || 0;
      const isLast      = i === invoices.length - 1;
      if (isLast) {
        newAmounts[inv.invoice_number] = String(round2(credit_amount - allocated));
      } else {
        const amt = totalOutstanding > 0
          ? round2(credit_amount * outstanding / totalOutstanding)
          : round2(credit_amount / invoices.length);
        newAmounts[inv.invoice_number] = String(amt);
        allocated += amt;
      }
    });
    setAmounts(newAmounts);
  };

  const handleConfirm = () => {
    if (!isValid) return;
    const breakup: BreakupItem[] = invoices.map((inv) => ({
      invoice_number:   inv.invoice_number,
      reference_amount: parseFloat(amounts[inv.invoice_number] || "0"),
    }));
    onConfirm(breakup);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-lg shadow-2xl flex flex-col overflow-hidden mx-4">

        {/* Header */}
        <div className="bg-[#222222] text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider">Invoice Breakup Required</h2>
            <p className="text-[10px] text-gray-300 mt-0.5">
              Confirm how the credit of{" "}
              <span className="font-mono font-black text-white">
                {credit_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>{" "}
              is distributed across {invoices.length} invoices
            </p>
          </div>
          <button onClick={onCancel} className="hover:bg-white/10 p-1.5 rounded-sm cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* TDS info banner */}
          {tds_pct != null && (
            <div className={`flex items-center gap-3 px-4 py-2.5 rounded-sm border text-[11px] font-bold ${
              tds_pct >= 8 && tds_pct <= 12
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-amber-50 border-amber-200 text-amber-700"
            }`}>
              <AlertTriangle size={13} className="shrink-0" />
              <span>
                Computed TDS: <span className="font-mono">{tds_pct.toFixed(2)}%</span>
                {tds_pct >= 8 && tds_pct <= 12
                  ? " — within 8–12% range. Proportional distribution applied."
                  : " — outside expected range. Please confirm amounts manually."}
              </span>
            </div>
          )}

          {/* Quick-apply buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyTds}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider bg-[#222222] hover:bg-[#222222] text-white px-3 py-1.5 rounded-xs transition-colors cursor-pointer"
            >
              <RefreshCw size={11} /> Apply 10% TDS (× 0.90)
            </button>
            <button
              type="button"
              onClick={applyProportional}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-xs transition-colors cursor-pointer"
            >
              <RefreshCw size={11} /> Proportional
            </button>
          </div>

          {/* Invoice table */}
          <div className="border border-gray-200 rounded-sm overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-[#222222] text-white">
                  <th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-wider">Invoice #</th>
                  <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-wider">Outstanding (Aging)</th>
                  <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-wider">TDS Est. (10%)</th>
                  <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-wider">Reference Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => {
                  const tdsEst = inv.outstanding != null ? round2(inv.outstanding * 0.10) : null;
                  const refVal = amounts[inv.invoice_number] || "";
                  const refNum = parseFloat(refVal) || 0;
                  const pctOfCredit = credit_amount > 0 ? round2(refNum / credit_amount * 100) : 0;

                  return (
                    <tr key={inv.invoice_number} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-bold text-primary">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">
                        {inv.outstanding != null
                          ? inv.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-amber-600">
                        {tdsEst != null
                          ? tdsEst.toLocaleString(undefined, { minimumFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-[9px] text-gray-400">{pctOfCredit}%</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={refVal}
                            onChange={(e) =>
                              setAmounts((p) => ({ ...p, [inv.invoice_number]: e.target.value }))
                            }
                            className="w-32 text-right font-mono font-bold text-primary border border-gray-300 rounded-xs px-2 py-1 text-[11px] outline-none focus:border-[#222222] focus:ring-1 focus:ring-[#222222]/30"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                <tr>
                  <td className="px-4 py-2.5 text-[9px] font-black text-gray-500 uppercase tracking-wider">Total</td>
                  <td className="px-4 py-2.5 text-right font-mono font-black text-primary">
                    {totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-black text-amber-600">
                    {round2(totalOutstanding * 0.10).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-black">
                    <span className={isValid ? "text-emerald-600" : "text-red-600"}>
                      {sumAmounts.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] text-gray-400 ml-1">
                      / {credit_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Validation message */}
          {!isValid && sumAmounts > 0 && (
            <div className="flex items-center gap-2 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-sm px-4 py-2.5">
              <AlertTriangle size={13} className="shrink-0" />
              <span>
                Sum ({sumAmounts.toLocaleString(undefined, { minimumFractionDigits: 2 })}) must equal
                credit amount ({credit_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                within 1%.
                Difference: {diff.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-primary transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || isPosting}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 text-[10px] font-black uppercase tracking-wider rounded-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
          >
            {isPosting
              ? <><RefreshCw size={12} className="animate-spin" /> Posting…</>
              : <><Check size={12} className="stroke-[3]" /> Confirm & Post to Oracle</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}