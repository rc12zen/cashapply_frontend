"use client";
/**
 * components/row-detail/CrossOUEvidencePanel.tsx
 * ==================================================
 * The "show your receipts" panel for a cross-OU decision. Previously the
 * page just showed a verdict (bank's OU vs. the FIRST matched invoice's
 * OU) -- this shows every OU the customer was actually found in, the
 * exact matched name + fuzzy match confidence for each, and how much is
 * outstanding there -- backed by LineItem.ou_evidence (persisted at
 * evaluation time, not recomputed live -- see rule_engine/ou_resolver.py).
 */
import { GitBranch, Info } from "lucide-react";

export interface OuEvidenceCustomerDetail {
  ou_number: string;
  matched_customer_name: string;
  match_score: number;
  invoice_count: number;
  total_outstanding: number;
}

export interface OuEvidence {
  bank_ou_numbers: string[];
  customer_ou_details: OuEvidenceCustomerDetail[];
}

function matchConfidenceStyle(score: number): string {
  if (score >= 90) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 75) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

export default function CrossOUEvidencePanel({
  evidence,
  extractedCustomerName,
}: {
  evidence: OuEvidence;
  extractedCustomerName: string | null;
}) {
  const bankOus = evidence.bank_ou_numbers || [];
  const details = evidence.customer_ou_details || [];
  const isMultiBu = bankOus.length > 1;

  return (
    <div className="space-y-3">
      {isMultiBu && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xs border bg-blue-50 border-blue-200">
          <Info size={13} className="text-blue-500 shrink-0 mt-0.5" />
          <span className="text-[11px] text-gray-700">
            This bank account is linked to <strong>{bankOus.length} Business Units</strong> (OU{" "}
            {bankOus.join(", ")}) — a match against any of them counts as same-OU, not cross-OU.
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 px-1">
        <GitBranch size={12} className="text-gray-400" />
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
          Where &ldquo;{extractedCustomerName || "this customer"}&rdquo; was actually found in aging
        </span>
      </div>

      {details.length === 0 ? (
        <p className="text-[11px] text-gray-400 px-1">
          Not found in any OU&apos;s aging report — no supporting data available.
        </p>
      ) : (
        <div className="border border-gray-200 rounded-xs overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 text-[9px] font-black text-gray-400 uppercase tracking-wider">
                <th className="text-left px-3 py-1.5">OU</th>
                <th className="text-left px-3 py-1.5">Matched Name in Aging</th>
                <th className="text-left px-3 py-1.5">Match Confidence</th>
                <th className="text-right px-3 py-1.5">Open Invoices</th>
                <th className="text-right px-3 py-1.5">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {details.map((d) => {
                const isBankOu = bankOus.includes(d.ou_number);
                return (
                  <tr key={d.ou_number} className={isBankOu ? "bg-emerald-50/40" : ""}>
                    <td className="px-3 py-2 font-mono font-bold text-primary">
                      {d.ou_number}
                      {isBankOu && (
                        <span className="ml-1.5 text-[8px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded-xs">
                          bank&apos;s OU
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{d.matched_customer_name}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-xs border ${matchConfidenceStyle(d.match_score)}`}>
                        {d.match_score}% match
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gray-600">{d.invoice_count}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-primary">
                      {d.total_outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
