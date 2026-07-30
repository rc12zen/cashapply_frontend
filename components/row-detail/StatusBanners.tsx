"use client";

/**
 * components/row-detail/StatusBanners.tsx
 * =====================================================
 * The two full-width banners shown at the top of the Row Detail body:
 * "Posted to Oracle Fusion AR" (processed) and "Oracle Post Failed"
 * (post_failed). Extracted verbatim from
 * app/analysis-history/row/[id]/page.tsx — pure presentational, no
 * behavior of its own.
 */
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { fmt, fmtDate, RowDetail } from "@/components/row-detail/types";

export default function StatusBanners({
  isProcessed, isPostFailed, oracle, creditAmount, currency, businessUnit,
}: {
  isProcessed: boolean;
  isPostFailed: boolean;
  oracle: RowDetail["oracle"];
  creditAmount: number;
  currency: string;
  businessUnit: string;
}) {
  return (
    <>
      {isProcessed && (
        <div className="bg-emerald-600 text-white rounded-sm px-5 py-4">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle2 size={18} className="shrink-0" />
            <span className="text-sm font-black uppercase tracking-wider">Posted to Oracle Fusion AR</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-emerald-700/30 rounded-xs p-3">
            {[
              ["Receipt Number",      oracle.oracle_ref_no],
              ["Standard Receipt ID", oracle.standard_receipt_id],
              ["Status Code",         oracle.oracle_status_code],
              ["Posted At",           fmtDate(oracle.oracle_posted_at)],
              ["Amount",              `${fmt(creditAmount)} ${currency}`],
              ["Business Unit",       businessUnit],
            ].map(([label, val]) => val ? (
              <div key={label as string}>
                <div className="text-[9px] text-emerald-200 font-bold uppercase tracking-wider mb-0.5">{label}</div>
                <div className="text-[11px] font-mono font-black break-all">{val}</div>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {isPostFailed && (
        <div className="bg-red-600 text-white rounded-sm px-5 py-3.5 flex items-start gap-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-black uppercase tracking-wider">Oracle Post Failed</div>
            {oracle.post_message && (
              <div className="text-[10px] font-mono bg-red-700/40 rounded-xs p-2 mt-2 break-all">{oracle.post_message}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
