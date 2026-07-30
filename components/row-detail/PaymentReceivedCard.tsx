"use client";

/**
 * components/row-detail/PaymentReceivedCard.tsx
 * =====================================================
 * Row Detail's CARD 1 — bank statement fields + the prominent "Amount
 * credited" figure. Pure presentational, extracted verbatim from
 * app/analysis-history/row/[id]/page.tsx.
 */
import { Banknote } from "lucide-react";
import { DataRow, CardShell, CardHead } from "@/components/row-detail/SharedCardPieces";
import { fmt, fmtDate, RowDetail } from "@/components/row-detail/types";

export default function PaymentReceivedCard({ bs }: { bs: RowDetail["bank_statement"] }) {
  return (
    <CardShell>
      <CardHead icon={<Banknote size={13} />} title="Payment Received" />
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        <div className="px-5 py-1">
          <DataRow label="Bank"            value={bs.bank_name} />
          <DataRow label="Account"         value={bs.bank_account_number} mono />
          <DataRow label="Transaction ref" value={bs.bank_reference} mono />
          <DataRow label="Statement date"  value={fmtDate(bs.statement_date)} />
        </div>
        <div className="px-5 py-1">
          <DataRow label="Business unit"   value={`${bs.business_unit} [${bs.ou_number}]`} />
          {/* Amount — prominently sized */}
          <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">Amount credited</span>
            <span className="font-mono font-black text-[#222222]" style={{ fontSize: "22px", letterSpacing: "-0.02em" }}>
              {fmt(bs.credit_amount)}
              <span className="text-sm font-bold text-gray-400 ml-2">{bs.currency}</span>
            </span>
          </div>
          <DataRow label="Description"     value={bs.narrative} />
        </div>
      </div>
    </CardShell>
  );
}
