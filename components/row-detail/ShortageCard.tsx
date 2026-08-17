"use client";

/**
 * components/row-detail/ShortageCard.tsx
 * =====================================================
 * Row Detail card for a SHORT payment (R9c). The mirror of
 * OverpaymentCard.tsx, and built to the same rule: show the arithmetic,
 * name the likely cause, and show the working behind it — never present a
 * derived suggestion as a finding.
 *
 * Two different rows arrive here and the difference matters:
 *
 *   OVER TOLERANCE   the shortfall broke the 12% rule. Always came here.
 *
 *   WITHIN TOLERANCE the shortfall did NOT break the rule, but the
 *                    customer holds open credit memos, so it is no longer
 *                    auto-accepted. Until 2026-08 this row was passed
 *                    silently, nobody saw it, and the credit memo stayed
 *                    open in Oracle where the customer could deduct it
 *                    again next month. A SPOC seeing one of these for the
 *                    first time needs telling why it is in front of them,
 *                    which is what the banner does.
 *
 * The credit-memo list is evidence, not an instruction. Nothing here
 * applies a credit memo — per BRD Scenario 4(a) that is the Revenue
 * Assurance SPOC's action in Oracle, and this system does not perform it.
 */
import { AlertTriangle, Copy, FileMinus, Receipt, TicketPercent, TrendingDown } from "lucide-react";
import { CardShell, CardHead } from "@/components/row-detail/SharedCardPieces";
import { ShortageView, fmt } from "@/components/row-detail/types";
import { SHORTAGE_REASON_LABEL, SHORTAGE_REASON_DETAIL } from "@/lib/constants";

const REASON_ICON: Record<string, React.ReactNode> = {
  CREDIT_MEMO_EXACT_MATCH: <TicketPercent size={16} className="text-emerald-500 shrink-0 mt-0.5" />,
  CREDIT_MEMO_AMBIGUOUS:   <Copy size={16} className="text-amber-500 shrink-0 mt-0.5" />,
  CREDIT_MEMO_AVAILABLE:   <FileMinus size={16} className="text-amber-500 shrink-0 mt-0.5" />,
  DEDUCTION_STATED:        <Receipt size={16} className="text-blue-500 shrink-0 mt-0.5" />,
  SHORTAGE_UNEXPLAINED:    <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />,
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className={`text-[12px] font-mono ${strong ? "font-bold text-gray-900" : "text-gray-700"}`}>
        {value}
      </span>
    </div>
  );
}

export default function ShortageCard({ sh }: { sh: ShortageView }) {
  const ccy = sh.invoice_currency || "";
  const ev = sh.evidence || {};
  const reason = sh.reason || "SHORTAGE_UNEXPLAINED";
  const memos: any[] = ev.credit_memos || [];
  const matched: string | undefined = ev.matched_document_number;

  const toneCls =
    reason === "SHORTAGE_UNEXPLAINED" ? "bg-red-50 border-red-200 text-red-800"
    : reason === "CREDIT_MEMO_EXACT_MATCH" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : reason === "DEDUCTION_STATED" ? "bg-blue-50 border-blue-200 text-blue-800"
    : "bg-amber-50 border-amber-200 text-amber-800";

  return (
    <CardShell>
      <CardHead icon={<TrendingDown size={13} />} title="Short payment" />

      {/* ── The arithmetic, always ─────────────────────────────────────── */}
      <div className="px-3 pb-2 divide-y divide-gray-100">
        <Row label="Received" value={`${fmt(sh.received_total)} ${ccy}`} />
        <Row label="Matched invoices total" value={`${fmt(sh.target_total)} ${ccy}`} />
        <Row
          label="Short by"
          value={`${fmt(sh.shortfall_amount)} ${ccy} (${sh.shortfall_pct}%)`}
          strong
        />
      </div>

      <div className="px-3 pb-3">
        {/* Why this row is here at all, when it would once have passed
            silently. Only shown for the within-tolerance case — on an
            over-tolerance row it would just restate the obvious. */}
        {sh.within_tolerance && (
          <div className="mb-2 rounded border border-slate-200 bg-slate-50 p-2.5">
            <p className="text-[11px] text-slate-700 leading-snug">
              This shortfall is <span className="font-semibold">within the {sh.tolerance_pct}% tolerance</span> and
              would normally be accepted without review. It was held back because this
              customer holds open credit memos — accepting it silently would leave the
              credit memo open in Oracle, where it can be deducted a second time.
            </p>
          </div>
        )}

        {/* ── The computed cause ───────────────────────────────────────── */}
        <div className={`flex gap-2 items-start rounded border p-2.5 ${toneCls}`}>
          {REASON_ICON[reason]}
          <div className="min-w-0">
            <p className="text-[12px] font-semibold">
              {SHORTAGE_REASON_LABEL[reason] || reason}
            </p>
            <p className="text-[11px] mt-0.5 leading-snug opacity-90">
              {SHORTAGE_REASON_DETAIL[reason]}
            </p>
          </div>
        </div>

        {/* ── The working: which credit memos this customer holds ──────── */}
        {memos.length > 0 && (
          <div className="mt-2 border border-gray-200 rounded overflow-hidden">
            <div className="px-2.5 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
                Open credit memos
              </span>
              <span className="text-[10px] font-mono text-gray-600">
                {fmt(ev.credit_memo_total)} {ccy} available vs {fmt(sh.shortfall_amount)} {ccy} short
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <tbody className="divide-y divide-gray-100">
                  {memos.map((c: any) => (
                    <tr key={c.document_number} className={c.document_number === matched ? "bg-emerald-50" : undefined}>
                      <td className="px-2.5 py-1.5 font-mono text-gray-700 whitespace-nowrap">
                        {c.document_number}
                        {c.document_number === matched && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 rounded-xs bg-emerald-600 text-white text-[8px] font-black uppercase tracking-wider align-middle">
                            Exact
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-gray-500 whitespace-nowrap">{c.document_date || "—"}</td>
                      <td className="px-2.5 py-1.5 text-gray-600 max-w-[18rem] truncate" title={c.description || ""}>
                        {c.description || "—"}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-amber-700 whitespace-nowrap">
                        −{fmt(c.amount)} {c.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* The evidence blob is capped so it cannot grow without bound on
                the row — say so rather than quietly showing a partial list. */}
            {ev.credit_memos_truncated && (
              <div className="px-2.5 py-1.5 bg-gray-50 border-t border-gray-200">
                <span className="text-[10px] text-gray-500">
                  Showing 25 of {ev.credit_memo_count}. The full list is on the Manual
                  Invoice Mapping card.
                </span>
              </div>
            )}
          </div>
        )}

        {/* A stated deduction that did NOT account for the gap is still worth
            surfacing — it tells the SPOC part of the answer is known. */}
        {ev.stated_deduction_total != null && reason !== "DEDUCTION_STATED" && (
          <p className="mt-2 text-[11px] text-gray-500">
            The remittance declared a deduction of {fmt(ev.stated_deduction_total)} {ccy},
            which does not account for the {fmt(sh.shortfall_amount)} {ccy} shortfall.
          </p>
        )}

        {/* Provenance. The aging export is fully replaced daily with no
            history, so everything above is a snapshot of one file — a credit
            memo listed here may already have been applied. */}
        {ev.aging_snapshot?.filename && (
          <p className="mt-2 text-[10px] text-gray-400 leading-snug">
            From <span className="font-mono">{ev.aging_snapshot.filename}</span>, the aging
            report loaded at analysis time. It is replaced daily, so a credit memo listed
            here may since have been applied.
          </p>
        )}
      </div>
    </CardShell>
  );
}
