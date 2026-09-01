"use client";

/**
 * components/row-detail/CustomerCreditsPanel.tsx
 * =================================================
 * The NEGATIVE half of the aging report, shown inside Manual Invoice
 * Mapping: credit memos and unapplied receipts belonging to the same
 * customer / OU / currency as the invoices above.
 *
 * Until 2026-08 these rows were deleted the moment the aging file was
 * loaded (aging/aging_map.py's is_payable), so a SPOC looking at a short
 * payment had no way to see that the customer was holding a credit memo
 * that explained it. The payment was accepted silently under the 12%
 * tolerance and the credit memo stayed open in Oracle, claimable a second
 * time. This panel is the "you can see it now" half of that fix.
 *
 * INFORMATIONAL ONLY — deliberately. Nothing here is a checkbox and
 * nothing here changes the amounts in the preview below. Reducing what we
 * expect would mean the credit memo has actually been APPLIED in Oracle,
 * and nothing in this system applies one (per BRD Scenario 4(a) that is
 * the Revenue Assurance SPOC's action, not ours). A selectable control
 * that changed the arithmetic without the matching Oracle transaction
 * would post a receipt claiming the invoice is settled when Oracle still
 * shows it short. So: show the evidence, let the human act on it outside
 * the app, don't fake the accounting.
 *
 * The suggestion is a SINGLE exact amount match and never a combination.
 * Assurant carries 164 open credit memos in one OU — some subset of 164
 * numbers fits almost any shortfall, so combination search would produce a
 * confident wrong answer that somebody then approves.
 *
 * Backend: hitl/manual_mapping.py's _credit_context().
 */
import { Info, Search, TicketPercent, Wallet, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  MappingCreditOption, MappingCreditContext, fmt, LIST_SEARCH_THRESHOLD,
} from "@/components/row-detail/types";

function CreditTable({ rows, suggested, muted }: {
  rows: MappingCreditOption[];
  suggested?: string | null;
  muted?: boolean;
}) {
  const [query, setQuery] = useState("");

  // Filter only -- never a re-sort, matching the invoice picker above. The
  // aging report's own row order is what finance reads elsewhere.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.document_number.toLowerCase().includes(q) ||
        (c.currency || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const searchVisible = rows.length > LIST_SEARCH_THRESHOLD;
  const headCls = muted ? "bg-gray-500" : "bg-[#222222]";

  return (
    <>
      {searchVisible && (
        <div className="flex items-center gap-2 mb-1.5">
          <div className="relative flex-1">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by document number, currency or description…"
              className="w-full text-[11px] font-medium border border-gray-300 rounded-xs pl-7 pr-7 py-1.5 outline-none focus:border-[#222222] transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 cursor-pointer"
                aria-label="Clear filter"
              >
                <X size={11} />
              </button>
            )}
          </div>
          <span className="text-[10px] font-bold text-gray-400 tabular-nums shrink-0">
            {visible.length === rows.length ? `${rows.length} rows` : `${visible.length} of ${rows.length}`}
          </span>
        </div>
      )}

      {/* Height-capped with internal scroll: Assurant alone carries 164 open
          credit memos in one OU (see this file's docstring), which unbounded
          would bury everything rendered below the panel. max-h, so short
          lists size to content and never gain a scrollbar. Literal Tailwind
          class -- an inline style="" would be blocked by the app's CSP, and a
          class built from a JS constant is invisible to Tailwind's scanner. */}
      <div className="border border-gray-200 rounded-xs overflow-hidden">
        <div className="max-h-[320px] overflow-auto">
          <table className="w-full text-[11px]">
            <thead>
              {/* sticky on the cells, not the <tr>/<thead> -- those are
                  unreliable targets for position:sticky. The background has
                  to be repeated per-cell or rows show through underneath. */}
              <tr className={`${headCls} text-white`}>
                <th className={`sticky top-0 z-10 ${headCls} px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider`}>Document #</th>
                <th className={`sticky top-0 z-10 ${headCls} px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider`}>Amount</th>
                <th className={`sticky top-0 z-10 ${headCls} px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider`}>Currency</th>
                <th className={`sticky top-0 z-10 ${headCls} px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider`}>Date</th>
                <th className={`sticky top-0 z-10 ${headCls} px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider`}>Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-[11px] text-gray-400 italic text-center">
                    No row matches “{query}”.
                  </td>
                </tr>
              )}
              {visible.map((c) => {
                const isSuggested = !!suggested && c.document_number === suggested;
                return (
                  <tr
                    key={`${c.document_number}-${c.amount}`}
                    className={isSuggested ? "bg-emerald-50" : undefined}
                  >
                    <td className="px-3 py-2 font-mono font-bold text-[#222222] whitespace-nowrap">
                      {c.document_number}
                      {isSuggested && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded-xs bg-emerald-600 text-white text-[8px] font-black uppercase tracking-wider align-middle">
                          Matches shortfall
                        </span>
                      )}
                    </td>
                    {/* Shown with a leading minus: the source row is negative
                        and this REDUCES what the customer owes. The backend
                        hands over a positive magnitude, so the sign is
                        presentational. */}
                    <td className="px-3 py-2 font-mono font-bold text-right text-amber-700 whitespace-nowrap">
                      −{fmt(c.amount)}
                    </td>
                    <td className="px-3 py-2 text-gray-400 font-mono">{c.currency || "—"}</td>
                    <td className="px-3 py-2 text-gray-400 font-mono whitespace-nowrap">{c.document_date || "—"}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-[22rem] truncate" title={c.description || ""}>
                      {c.description || <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default function CustomerCreditsPanel({ creditMemos, unappliedReceipts, context }: {
  creditMemos?: MappingCreditOption[];
  unappliedReceipts?: MappingCreditOption[];
  context?: MappingCreditContext;
}) {
  const memos = creditMemos || [];
  const receipts = unappliedReceipts || [];
  if (!context || (memos.length === 0 && receipts.length === 0)) return null;

  const { situation, shortfall_amount, credit_memo_total, suggested_document_number } = context;

  // One sentence naming the situation, so the SPOC isn't left to infer it
  // from a table. These are the three states the backend distinguishes.
  let headline: string;
  let tone: "good" | "warn" | "plain";
  if (situation === "exact_match") {
    headline = `Short by ${fmt(shortfall_amount)} — credit memo ${suggested_document_number} is for exactly that amount.`;
    tone = "good";
  } else if (situation === "ambiguous_match") {
    headline = `Short by ${fmt(shortfall_amount)} — more than one credit memo is for exactly that amount, so none is suggested.`;
    tone = "warn";
  } else if (shortfall_amount != null && memos.length > 0) {
    headline = `Short by ${fmt(shortfall_amount)} — no single credit memo matches, but this customer holds ${memos.length} open totalling ${fmt(credit_memo_total)}.`;
    tone = "warn";
  } else if (memos.length > 0) {
    headline = `This customer holds ${memos.length} open credit memo(s) totalling ${fmt(credit_memo_total)}.`;
    tone = "plain";
  } else {
    headline = `This customer has unapplied receipts on account.`;
    tone = "plain";
  }

  const toneCls =
    tone === "good" ? "bg-emerald-50 border-emerald-200 text-emerald-900"
    : tone === "warn" ? "bg-amber-50 border-amber-200 text-amber-900"
    : "bg-blue-50 border-blue-200 text-blue-900";

  return (
    <div className="space-y-3 pt-1">
      <div className={`px-4 py-3 rounded-xs border flex items-start gap-3 ${toneCls}`}>
        <Info size={14} className="shrink-0 mt-0.5 opacity-70" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold">{headline}</p>
          <p className="text-[10px] mt-1 leading-snug opacity-80">
            Shown for your judgement — selecting invoices above does not apply a
            credit memo. Applying one in Oracle is a separate action.
            {context.aging_filename && (
              <> Source: <span className="font-mono">{context.aging_filename}</span>, which is replaced daily.</>
            )}
          </p>
        </div>
      </div>

      {memos.length > 0 && (
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
            <TicketPercent size={11} />
            Open Credit Memos — reduce what this customer owes
          </label>
          <CreditTable rows={memos} suggested={suggested_document_number} />
        </div>
      )}

      {receipts.length > 0 && (
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
            <Wallet size={11} />
            Unapplied Receipts — cash already on account
          </label>
          {/* Never suggested and never netted. Per Finance these are real
              money sitting on the customer's account, but there is no way
              to know when the customer will come back to one, so they must
              not drive a decision. Some are also receipts this system
              created and has not applied yet (oracle/receipt_creation.py
              makes a bare receipt for every row in a completed run). */}
          <CreditTable rows={receipts} muted />
        </div>
      )}
    </div>
  );
}
