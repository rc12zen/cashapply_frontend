"use client";

/**
 * components/row-detail/RemittancePanel.tsx
 * ============================================
 * Right-side remittance email panel on the Row Detail page. Extracted
 * from app/analysis-history/row/[id]/page.tsx -- see that file for the
 * page-level state (collapsed/onToggle) this receives as props.
 */
import { ChevronLeft, Download, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { downloadStorageFile } from "@/lib/api";
import { RowDetail, fmt, fmtDate } from "./types";
import { DataRow } from "./SharedCardPieces";
export function RemittancePanel({ remittance, allInvoiceNumbers, remittanceStatus, collapsed, onToggle }: {
  remittance: RowDetail["remittance"];
  allInvoiceNumbers: string[];
  remittanceStatus: string | null | undefined;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [tab, setTab] = useState<"parsed" | "raw">("parsed");
  const [downloading, setDownloading] = useState(false);
  const hasRemittance = !!remittance;

  const handleDownloadOriginal = async () => {
    if (!remittance?.download_url || downloading) return;
    setDownloading(true);
    try {
      const res = await downloadStorageFile(remittance.download_url);
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = remittance.filename || "remittance-email";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Best-effort — the panel doesn't have its own error banner, so this
      // fails silently rather than crashing the row-detail page. Retriable
      // by clicking again.
    }
    setDownloading(false);
  };

  return (
    <div className={`flex flex-col h-full border-l border-gray-200 bg-white transition-all duration-200 flex-shrink-0 ${collapsed ? "w-11" : "w-[320px]"}`}>
      {/* Toggle header */}
      <button onClick={onToggle}
        className="flex items-center justify-center gap-2 px-3 py-3.5 bg-[#222222] hover:bg-[#222222] transition-colors cursor-pointer flex-shrink-0 w-full">
        {collapsed ? (
          <Mail size={14} className={hasRemittance ? "text-emerald-400" : "text-white/40"} />
        ) : (
          <>
            <Mail size={12} className={hasRemittance ? "text-emerald-400" : "text-white/40"} />
            <span className="text-[9px] font-black text-white uppercase tracking-widest flex-1 text-left">Remittance</span>
            {hasRemittance && <span className="bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">Found</span>}
            <ChevronLeft size={12} className="text-white/50" />
          </>
        )}
      </button>

      {!collapsed && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {!remittance ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10 gap-4">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <Mail size={20} className="text-gray-300" />
              </div>
              <div>
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-1">No Remittance Email</p>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  {remittanceStatus === "not_checked"
                    ? "Remittance check skipped — no invoice was matched."
                    : "No matching email found for this payment."}
                </p>
              </div>
              {allInvoiceNumbers.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xs px-3 py-2.5 text-left w-full">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-2">Searched for</p>
                  {allInvoiceNumbers.map(inv => <p key={inv} className="font-mono text-[10px] text-gray-600">{inv}</p>)}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 bg-gray-50 space-y-2">
                <div className="flex gap-1 bg-white border border-gray-200 rounded-xs p-0.5">
                  {(["parsed", "raw"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                      className={`flex-1 py-1 text-[9px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${tab === t ? "bg-[#222222] text-white" : "text-gray-500 hover:text-[#222222]"}`}>
                      {t}
                    </button>
                  ))}
                </div>
                {remittance.download_url && (
                  <button
                    onClick={handleDownloadOriginal}
                    disabled={downloading}
                    className="w-full flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[#222222] hover:text-[#222222] border border-gray-200 hover:border-[#222222] rounded-xs py-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {downloading ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                    {downloading ? "Downloading…" : "Download Original Email"}
                  </button>
                )}
              </div>
              {tab === "parsed" ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="bg-blue-50/60 border border-blue-100 rounded-xs px-3">
                    <DataRow label="Subject"   value={remittance.subject} />
                    <DataRow label="From"      value={remittance.sender || remittance.payer} />
                    <DataRow label="Customer"  value={remittance.customer_name || remittance.payer} />
                    <DataRow label="Date"      value={fmtDate(remittance.payment_date)} mono />
                    <DataRow label="Reference" value={remittance.payment_reference} mono />
                    <DataRow label="Amount"
                      value={remittance.payment_amount != null ? `${fmt(remittance.payment_amount)} ${remittance.payment_currency || ""}` : null}
                      mono />
                  </div>
                  {(remittance.invoices || []).length > 0 && (
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-2">
                        Invoices in email — {remittance.invoices!.length}
                      </p>
                      <div className="border border-gray-200 rounded-xs overflow-hidden">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="bg-[#222222] text-white">
                              <th className="px-2.5 py-2 text-left text-[9px] font-black uppercase tracking-wider">Invoice #</th>
                              <th className="px-2.5 py-2 text-right text-[9px] font-black uppercase tracking-wider">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {remittance.invoices!.map((inv: any, i: number) => {
                              const isThis = allInvoiceNumbers.includes(inv.invoice_number);
                              return (
                                <tr key={i} className={isThis ? "bg-blue-50" : "hover:bg-gray-50"}>
                                  <td className="px-2.5 py-2 font-mono font-bold text-[#222222]">
                                    {inv.invoice_number}
                                    {isThis && <span className="ml-1 text-[8px] bg-blue-100 text-blue-700 font-black px-1 py-0.5 rounded-xs">this row</span>}
                                  </td>
                                  <td className="px-2.5 py-2 font-mono text-right text-emerald-700 font-bold">
                                    {inv.amount_paid != null ? fmt(inv.amount_paid) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4">
                  <pre className="text-[9px] font-mono text-gray-600 leading-relaxed whitespace-pre-wrap break-words bg-gray-50 border border-gray-200 rounded-xs p-3">
                    {remittance.raw_body || "No body content."}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

