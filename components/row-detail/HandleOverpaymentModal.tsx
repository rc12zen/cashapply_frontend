"use client";

/**
 * components/row-detail/HandleOverpaymentModal.tsx
 * =====================================================
 * The ONE entry point for an overpaid row.
 *
 * Replaces a pair of sibling buttons ("Map Invoice" and "Resolve Overpayment")
 * that failed for the same reason: neither label said what happened to the
 * money. "Map Invoice" read as bookkeeping and hid the fact that it posts to
 * Oracle; "Resolve Overpayment" read as fixing the problem when it actually
 * meant post nothing and write down why — close to the opposite.
 *
 * So the arithmetic is stated ONCE at the top, and the two outcomes are shown
 * side by side, each leading with its money consequence. The SPOC picks a
 * consequence, not a button name they have to decode.
 *
 *   Apply & Post      -> closes this dialog and takes them to the invoice
 *                        picker. Nothing is decided here; the picker already
 *                        collects the reason for whatever stays unapplied.
 *   Explain & Close   -> records a reason and closes the row. No Oracle call.
 *
 * Vocabulary is "unapplied", matching Oracle and the BRD, so a SPOC
 * cross-checking between this screen and Oracle sees the same word.
 */
import { useState } from "react";
import { ArrowRight, Check, Loader2, Scale, X } from "lucide-react";
import { fmt } from "@/components/row-detail/types";

interface Option { code: string; label: string }
type Outcome = "apply" | "explain" | null;

export default function HandleOverpaymentModal({
  open, onClose, onApply, onExplain, receivedTotal, targetTotal,
  excessAmount, currency, options, busy, error,
}: {
  open: boolean;
  onClose: () => void;
  /** Route to the invoice picker — no state change here. */
  onApply: () => void;
  /** Record a reason and close the row without posting. */
  onExplain: (disposition: string, comment: string) => void;
  receivedTotal: number;
  targetTotal: number;
  excessAmount: number;
  currency: string | null;
  options: Option[];
  busy?: boolean;
  error?: string | null;
}) {
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [disposition, setDisposition] = useState("");
  const [comment, setComment] = useState("");

  if (!open) return null;

  const ccy = currency || "";
  const commentRequired = disposition === "other";
  const canConfirm =
    outcome === "apply" ||
    (outcome === "explain" && !!disposition &&
      (!commentRequired || comment.trim().length > 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-sm shadow-xl w-full max-w-2xl border border-gray-200 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/70 sticky top-0">
          <div className="flex items-center gap-2.5">
            <Scale size={14} className="text-[#222222]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[#222222]">
              Handle Overpayment
            </span>
          </div>
          <button onClick={onClose} disabled={busy} className="text-gray-400 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>

        {/* ── The arithmetic, stated once ─────────────────────────────── */}
        <div className="px-5 pt-4">
          <div className="rounded border border-gray-200 divide-y divide-gray-100">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] text-gray-500">Received</span>
              <span className="text-[12px] font-mono text-gray-800">{fmt(receivedTotal)} {ccy}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] text-gray-500">Matched invoices total</span>
              <span className="text-[12px] font-mono text-gray-800">{fmt(targetTotal)} {ccy}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-amber-50/60">
              <span className="text-[11px] font-semibold text-amber-800">Would stay unapplied</span>
              <span className="text-[12px] font-mono font-bold text-amber-900">{fmt(excessAmount)} {ccy}</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-2 leading-snug">
            More arrived than the matched invoices are worth. Either settle the invoices this
            payment genuinely covers, or record why nothing should post yet.
          </p>
        </div>

        {/* ── The two outcomes, each leading with its consequence ─────── */}
        <div className="px-5 pt-3 pb-1 grid sm:grid-cols-2 gap-2.5">
          <button
            onClick={() => setOutcome("apply")}
            disabled={busy}
            className={`text-left rounded border p-3 transition-colors ${
              outcome === "apply"
                ? "border-[#222222] bg-gray-50 ring-1 ring-[#222222]"
                : "border-gray-200 hover:border-gray-400"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Check size={13} className="text-emerald-600" />
              <span className="text-[12px] font-bold text-gray-900">Apply &amp; Post</span>
            </div>
            <p className="text-[10px] font-mono text-emerald-700 mt-1">
              posts up to {fmt(targetTotal)} {ccy} to Oracle
            </p>
            <p className="text-[11px] text-gray-600 mt-1.5 leading-snug">
              Pick the invoices this payment covers. Each one is applied at its own
              outstanding amount, so nothing is over-applied. Anything left over stays
              unapplied on the receipt.
            </p>
          </button>

          <button
            onClick={() => setOutcome("explain")}
            disabled={busy}
            className={`text-left rounded border p-3 transition-colors ${
              outcome === "explain"
                ? "border-[#222222] bg-gray-50 ring-1 ring-[#222222]"
                : "border-gray-200 hover:border-gray-400"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <X size={13} className="text-slate-500" />
              <span className="text-[12px] font-bold text-gray-900">Explain &amp; Close</span>
            </div>
            <p className="text-[10px] font-mono text-slate-600 mt-1">
              nothing is sent to Oracle
            </p>
            <p className="text-[11px] text-gray-600 mt-1.5 leading-snug">
              Record why the money is here and take the row out of the queue. The receipt
              keeps holding the full {fmt(receivedTotal)} {ccy} unapplied, exactly as it does
              now. Reopen later if this changes.
            </p>
          </button>
        </div>

        {/* ── Explain & Close needs a reason ──────────────────────────── */}
        {outcome === "explain" && (
          <div className="px-5 pt-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
              Why is the money here?
            </p>
            <div className="mt-1.5 space-y-1.5">
              {options.map((o) => (
                <label
                  key={o.code}
                  className={`flex items-center gap-2.5 rounded border px-3 py-2 cursor-pointer transition-colors ${
                    disposition === o.code
                      ? "border-[#222222] bg-gray-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="op-disposition"
                    value={o.code}
                    checked={disposition === o.code}
                    onChange={() => setDisposition(o.code)}
                    className="accent-[#222222]"
                  />
                  <span className="text-[12px] text-gray-800">{o.label}</span>
                </label>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder={commentRequired ? "Required — explain what is happening" : "Optional note for whoever picks this up next"}
              className="mt-2 w-full text-[12px] border border-gray-200 rounded px-2.5 py-2 focus:outline-none focus:border-[#222222]"
            />
          </div>
        )}

        {error && (
          <p className="mx-5 mt-3 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded px-2.5 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 px-5 py-3 mt-3 border-t border-gray-100 bg-gray-50/70 sticky bottom-0">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-[12px] px-3 py-1.5 border border-gray-200 rounded hover:bg-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (outcome === "apply") onApply();
              else if (outcome === "explain") onExplain(disposition, comment);
            }}
            disabled={!canConfirm || busy}
            className="text-[12px] px-3 py-1.5 rounded bg-[#222222] text-white hover:bg-black disabled:opacity-40 flex items-center gap-1.5"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {outcome === "apply" ? (
              <>Choose invoices <ArrowRight size={12} /></>
            ) : outcome === "explain" ? (
              "Close row without posting"
            ) : (
              "Continue"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
