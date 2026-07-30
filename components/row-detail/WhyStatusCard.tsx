"use client";

/**
 * components/row-detail/WhyStatusCard.tsx
 * =====================================================
 * Row Detail's CARD 4 — "Why this status": the plain-English reason
 * sentence (from getReasonConfig), the cross-OU received-vs-invoice-OU
 * comparison (only for cross-OU rows), and the amount-received-vs-
 * outstanding comparison. Pure presentational, extracted verbatim from
 * app/analysis-history/row/[id]/page.tsx.
 */
import { AlertTriangle, CheckCircle2, GitBranch, Info } from "lucide-react";
import { CardShell, CardHead } from "@/components/row-detail/SharedCardPieces";
import CrossOUEvidencePanel from "@/components/row-detail/CrossOUEvidencePanel";
import { ConfirmedInvoice, OuEvidence, fmt } from "@/components/row-detail/types";

const TONE_STYLE = {
  ok:    "bg-emerald-50 border-emerald-200 text-emerald-800",
  warn:  "bg-amber-50  border-amber-200  text-amber-800",
  error: "bg-red-50    border-red-200    text-red-800",
  info:  "bg-blue-50   border-blue-200   text-blue-800",
};
const TONE_ICON = {
  ok:    <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />,
  warn:  <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />,
  error: <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />,
  info:  <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />,
};

export default function WhyStatusCard({
  reasonConfig, isCrossOU, ouEvidence, extractedCustomerName,
  bankOuDisplayName, bankBusinessUnit, bankOuNumber,
  confirmedInvoices, sumOutstanding, creditAmount, bankCurrency,
}: {
  reasonConfig: { text: string; tone: "ok" | "warn" | "error" | "info" };
  isCrossOU: boolean;
  ouEvidence?: OuEvidence | null;
  extractedCustomerName: string | null;
  bankOuDisplayName?: string | null;
  bankBusinessUnit: string;
  bankOuNumber: string;
  confirmedInvoices: ConfirmedInvoice[];
  sumOutstanding: number;
  creditAmount: number;
  bankCurrency: string;
}) {
  return (
    <CardShell>
      <CardHead icon={<Info size={13} />} title="Why this status" />
      <div className="px-5 py-5 space-y-4">
        {/* Reason sentence */}
        <div className={`flex items-start gap-3 px-4 py-4 rounded-xs border ${TONE_STYLE[reasonConfig.tone]}`}>
          {TONE_ICON[reasonConfig.tone]}
          <p className="text-[13px] font-semibold leading-relaxed">{reasonConfig.text}</p>
        </div>

        {/* Cross-OU comparison — which entity received the payment vs which
            entity the customer's invoice(s) actually belong to. */}
        {isCrossOU && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-xs px-4 py-3">
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Received Into (Bank's OU)</div>
                <div className="font-black text-[#222222] text-[14px] leading-snug">
                  {bankOuDisplayName || bankBusinessUnit || "—"}
                </div>
                {bankOuNumber && <div className="text-[10px] text-gray-400 font-mono font-bold mt-1">OU {bankOuNumber}</div>}
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xs px-4 py-3">
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Customer's OU (Invoice)</div>
                <div className="font-black text-[#222222] text-[14px] leading-snug">
                  {confirmedInvoices[0]?.ou_display_name || confirmedInvoices[0]?.ou_number || "—"}
                </div>
                {confirmedInvoices[0]?.ou_number && <div className="text-[10px] text-gray-400 font-mono font-bold mt-1">OU {confirmedInvoices[0].ou_number}</div>}
              </div>
              <div className="col-span-2 flex items-center gap-2 px-4 py-2.5 rounded-xs border bg-red-50 border-red-200">
                <GitBranch size={13} className="text-red-500 shrink-0" />
                <span className="text-[10px] font-black text-red-700 uppercase tracking-wider">Entity mismatch — must be re-routed before posting</span>
              </div>
            </div>

            {/* Supporting evidence — every OU actually checked, not
                just the one that mattered for the verdict above. */}
            {ouEvidence && (
              <CrossOUEvidencePanel
                evidence={ouEvidence}
                extractedCustomerName={extractedCustomerName}
              />
            )}
          </div>
        )}

        {/* Amount comparison — only when both amounts are meaningful */}
        {sumOutstanding > 0 && creditAmount > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-xs px-4 py-3">
              <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Amount Received</div>
              <div className="font-mono font-black text-[#222222] text-[18px] leading-none">{fmt(creditAmount)}</div>
              <div className="text-[10px] text-gray-400 font-bold mt-1">{bankCurrency}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xs px-4 py-3">
              <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5">Invoice Outstanding</div>
              <div className="font-mono font-black text-[#222222] text-[18px] leading-none">{fmt(sumOutstanding)}</div>
              <div className="text-[10px] text-gray-400 font-bold mt-1">{confirmedInvoices[0]?.currency || bankCurrency}</div>
            </div>

            {/* Difference row */}
            {Math.abs(sumOutstanding - creditAmount) > 0.01 ? (
              <div className={`col-span-2 flex items-center justify-between px-4 py-2.5 rounded-xs border ${creditAmount < sumOutstanding ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
                <span className={`text-[10px] font-black uppercase tracking-wider ${creditAmount < sumOutstanding ? "text-amber-700" : "text-red-700"}`}>
                  {creditAmount < sumOutstanding ? "Short by" : "Over by"}
                </span>
                <span className={`font-mono font-black text-[14px] ${creditAmount < sumOutstanding ? "text-amber-700" : "text-red-700"}`}>
                  {fmt(Math.abs(sumOutstanding - creditAmount))}
                  <span className="ml-2 text-[10px] font-bold opacity-70">
                    ({((Math.abs(sumOutstanding - creditAmount) / sumOutstanding) * 100).toFixed(1)}%)
                  </span>
                </span>
              </div>
            ) : (
              <div className="col-span-2 flex items-center gap-2 px-4 py-2.5 rounded-xs border bg-emerald-50 border-emerald-200">
                <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Amounts match exactly</span>
              </div>
            )}
          </div>
        )}
      </div>
    </CardShell>
  );
}
