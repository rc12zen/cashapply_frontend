"use client";

/**
 * components/row-detail/OverpaymentCard.tsx
 * =====================================================
 * Row Detail card for an overpaid row.
 *
 * Before this existed, an overpayment reached the SPOC as the single word
 * "Overpayment" — R11 was the only rule in the engine that produced no
 * explanation at all — and the only action that could actually complete the
 * row was Reject, which recorded something that had not happened.
 *
 * This card covers all three points in the lifecycle:
 *   OPEN     the arithmetic, the computed cause, the evidence behind it, and
 *            the two ways out (Map Invoice, or Resolve)
 *   PARKED   the recorded disposition, who made it and when, plus a badge if
 *            remittance advice has since arrived
 *   CAPPED   what settled and how much was deliberately left unapplied
 *
 * The cause is a SUGGESTION, never a decision — it is deliberately worded and
 * styled as "may", because it is derived from amounts lining up, not from the
 * customer telling us anything.
 */
import { AlertTriangle, Archive, ArrowRight, Building2, CheckCircle2, Copy, Mail, TrendingUp } from "lucide-react";
import { CardShell, CardHead } from "@/components/row-detail/SharedCardPieces";
import { OverpaymentView, fmt } from "@/components/row-detail/types";
import {
  OVERPAYMENT_REASON_LABEL,
  OVERPAYMENT_REASON_DETAIL,
  OVERPAYMENT_DISPOSITION_LABEL,
} from "@/lib/constants";

const REASON_ICON: Record<string, React.ReactNode> = {
  DUPLICATE_SUSPECT:        <Copy size={16} className="text-amber-500 shrink-0 mt-0.5" />,
  CROSS_OU_CANDIDATE:       <Building2 size={16} className="text-amber-500 shrink-0 mt-0.5" />,
  UNMATCHED_INVOICES_EXIST: <ArrowRight size={16} className="text-amber-500 shrink-0 mt-0.5" />,
  FX_DIFFERENCE:            <TrendingUp size={16} className="text-blue-500 shrink-0 mt-0.5" />,
  UNEXPLAINED:              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />,
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

export default function OverpaymentCard({ op }: { op: OverpaymentView }) {
  const ccy = op.invoice_currency || "";
  const ev = op.evidence || {};
  const reason = op.reason || "UNEXPLAINED";

  const candidates: any[] =
    ev.cross_ou_candidates || ev.unmatched_candidates || [];
  const candidateTotal: number | undefined =
    ev.cross_ou_candidate_total ?? ev.unmatched_candidate_total;

  return (
    <CardShell>
      <CardHead
        icon={<TrendingUp size={13} />}
        title={
          op.is_capped ? "Overpayment — ready to post"
            : op.is_parked ? "Overpayment — parked"
            : "Overpayment"
        }
      />

      {/* ── The arithmetic, always ─────────────────────────────────────── */}
      <div className="px-3 pb-2 divide-y divide-gray-100">
        <Row label="Received" value={`${fmt(op.received_total)} ${ccy}`} />
        <Row label="Matched invoices total" value={`${fmt(op.target_total)} ${ccy}`} />
        <Row
          // "Unapplied" is Oracle's own word and the BRD's, so a SPOC
          // cross-checking against Oracle sees the same term on both screens.
          // The tense changes with the row's state: on an open or ready-to-post
          // row nothing has posted yet.
          label={op.is_parked ? "Held unapplied" : "Would stay unapplied"}
          value={`${fmt(op.excess_amount)} ${ccy}`}
          strong
        />
      </div>

      {/* ── OPEN: the computed cause + evidence ───────────────────────── */}
      {op.is_open_overpayment && (
        <div className="px-3 pb-3">
          <div className={`flex gap-2 items-start rounded border p-2.5 ${
            reason === "UNEXPLAINED"
              ? "bg-red-50 border-red-200 text-red-800"
              : reason === "FX_DIFFERENCE"
              ? "bg-blue-50 border-blue-200 text-blue-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            {REASON_ICON[reason]}
            <div className="min-w-0">
              <p className="text-[12px] font-semibold">
                {OVERPAYMENT_REASON_LABEL[reason] || reason}
              </p>
              <p className="text-[11px] mt-0.5 leading-snug opacity-90">
                {OVERPAYMENT_REASON_DETAIL[reason]}
              </p>
            </div>
          </div>

          {/* Candidate invoices behind a CROSS_OU / UNMATCHED verdict. Shown
              as evidence the SPOC can check, not as a conclusion. */}
          {candidates.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded overflow-hidden">
              <div className="px-2.5 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
                  {reason === "CROSS_OU_CANDIDATE"
                    ? `Open in ${(ev.cross_ou_numbers || []).length > 1 ? "other entities" : `entity ${(ev.cross_ou_numbers || [])[0] ?? ""}`}`
                    : "Other open invoices for this customer"}
                </span>
                {candidateTotal !== undefined && (
                  <span className="text-[10px] font-mono text-gray-600">
                    {fmt(candidateTotal)} {ccy} vs {fmt(op.excess_amount)} {ccy} unapplied
                  </span>
                )}
              </div>
              <table className="w-full text-[11px]">
                <tbody className="divide-y divide-gray-100">
                  {candidates.map((c) => (
                    <tr key={`${c.ou_number}-${c.invoice_number}`}>
                      <td className="px-2.5 py-1.5 font-mono text-gray-700">{c.invoice_number}</td>
                      <td className="px-2.5 py-1.5 text-gray-500">{c.ou_number}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-gray-800">
                        {fmt(c.outstanding_amount)} {c.invoice_currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Duplicate evidence — the one cause backed by a hard fact rather
              than an amount resemblance, so it names the row responsible. */}
          {Array.isArray(ev.claimed_by) && ev.claimed_by.length > 0 && (
            <div className="mt-2 border border-amber-200 rounded overflow-hidden">
              <div className="px-2.5 py-1.5 bg-amber-50 border-b border-amber-200">
                <span className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold">
                  Already claimed by another payment
                </span>
              </div>
              <table className="w-full text-[11px]">
                <tbody className="divide-y divide-gray-100">
                  {ev.claimed_by.map((c: any) => (
                    <tr key={`${c.line_item_id}-${c.invoice_number}`}>
                      <td className="px-2.5 py-1.5 font-mono text-gray-700">{c.invoice_number}</td>
                      <td className="px-2.5 py-1.5 text-gray-500">
                        row #{c.line_item_id} ({c.status})
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-gray-800">
                        {fmt(c.applied_amount)} {ccy}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* No candidate set explained it, but the customer does have other
              open invoices — worth saying, since that is the first thing a
              SPOC would otherwise go and check by hand. */}
          {candidates.length === 0 && ev.other_open_invoice_count > 0 && (
            <p className="mt-2 text-[11px] text-gray-500">
              This customer has {ev.other_open_invoice_count} other open invoice(s)
              totalling {fmt(ev.other_open_invoice_total)} {ccy}, but none of them
              accounts for this amount.
            </p>
          )}

          {/* Points at the single entry point rather than restating the two
              outcomes — the dialog lays them out side by side with their money
              consequences, and describing them twice in different words is what
              made this confusing in the first place. */}
          <div className="mt-2.5 rounded border border-gray-200 bg-gray-50 p-2.5">
            <p className="text-[11px] text-gray-600 leading-snug">
              Use <span className="font-semibold text-gray-800">Handle Overpayment</span> to
              decide: settle the invoices this payment covers, or record why it should not
              post yet. Nothing has been sent to Oracle for this row.
            </p>
          </div>
        </div>
      )}

      {/* ── PARKED: the recorded decision ──────────────────────────────── */}
      {op.is_parked && (
        <div className="px-3 pb-3">
          <div className="flex gap-2 items-start rounded border border-slate-200 bg-slate-50 p-2.5">
            <Archive size={16} className="text-slate-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-slate-800">
                {OVERPAYMENT_DISPOSITION_LABEL[op.disposition || ""] || op.disposition_label || op.disposition}
              </p>
              <p className="text-[11px] mt-0.5 text-slate-600">
                Recorded by {op.disposition_by || "—"}
                {op.disposition_at ? ` on ${new Date(op.disposition_at).toLocaleDateString()}` : ""}.
                Nothing was posted — the receipt in Oracle still holds the full
                {" "}{fmt(op.received_total)} {ccy} unapplied. Use Reopen to bring this row back.
              </p>
            </div>
          </div>

          {op.remittance_now_available && (
            <div className="mt-2 flex gap-2 items-start rounded border border-emerald-200 bg-emerald-50 p-2.5">
              <Mail size={16} className="text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-800 leading-snug">
                <span className="font-semibold">Remittance advice has since arrived</span> for
                this payment. Reopen the row to re-evaluate it with the new information.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── CAPPED: what settled, what did not ─────────────────────────── */}
      {op.is_capped && (
        <div className="px-3 pb-3">
          <div className="flex gap-2 items-start rounded border border-amber-200 bg-amber-50 p-2.5">
            <CheckCircle2 size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-amber-900">
                {op.unapplied_amount !== null
                  ? `${fmt(op.target_total)} ${ccy} applied — ${fmt(op.unapplied_amount)} ${ccy} unapplied`
                  : `${fmt(op.target_total)} ${ccy} will post — ${fmt(op.excess_amount)} ${ccy} will stay unapplied`}
              </p>
              <p className="text-[11px] mt-0.5 text-amber-800 leading-snug">
                Each invoice is applied at its own outstanding amount, so nothing is
                over-applied. The remainder stays unapplied on the receipt in Oracle.
                {op.disposition && (
                  <>
                    {" "}Recorded reason:{" "}
                    <span className="font-semibold">
                      {OVERPAYMENT_DISPOSITION_LABEL[op.disposition] || op.disposition}
                    </span>
                    {op.disposition_by ? ` (${op.disposition_by})` : ""}.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </CardShell>
  );
}
