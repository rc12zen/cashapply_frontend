"use client";
/**
 * components/row-detail/MarkEligibleModal.tsx
 * =============================================
 * Confirms "Mark Eligible for Receipt" — the one action on an Unidentified row
 * that writes to Oracle.
 *
 * WHY THIS EXISTS
 * ----------------
 * Mark Eligible used to fire straight through with no confirmation, while
 * Discard — which touches nothing outside this database — asked "Sure?" first.
 * That was backwards: the reversible action prompted, the irreversible one did
 * not. Creating a receipt cannot be undone from this app (a wrong one needs an
 * Oracle-side reversal or a credit memo), so it gets the heavier gate.
 *
 * WHY A PAYLOAD PREVIEW RATHER THAN A PLAIN "SURE?"
 * --------------------------------------------------
 * The whole point of an Unidentified row is that automatic extraction read
 * nothing off it — so the SPOC is authorising an Oracle write for a payment
 * with NO identified customer. "Sure?" cannot answer the only question worth
 * asking, which is "what exactly is about to be created". This shows the real
 * payload the backend has already built for this row (row_detail.py's
 * oracle.payload), so the amount, currency, business unit and receipt number
 * are checked BEFORE the call rather than discovered afterwards.
 */
import { CheckCircle2, Loader2, X } from "lucide-react";

// The handful of payload fields worth surfacing, in the order a person reads
// them: what/how much first, then where it lands, then its identity in Oracle.
// Everything else in the payload (FX legs, conversion dates) is noise for this
// particular decision and stays hidden.
const SHOWN: { key: string; label: string }[] = [
  { key: "Amount",                      label: "Amount" },
  { key: "Currency",                    label: "Currency" },
  { key: "BusinessUnit",                label: "Business Unit" },
  { key: "RemittanceBankAccountNumber", label: "Bank account" },
  { key: "ReceiptDate",                 label: "Receipt date" },
  { key: "ReceiptMethod",               label: "Receipt method" },
  { key: "ReceiptNumber",               label: "Receipt number" },
];

export default function MarkEligibleModal({
  payload, saving, error, onCancel, onConfirm,
}: {
  payload: Record<string, unknown> | null | undefined;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const p = payload || {};
  const rows = SHOWN.filter(({ key }) => p[key] !== undefined && p[key] !== null && p[key] !== "");
  // A payload the builder could not complete comes back carrying this instead
  // of real fields — surface it rather than showing a confident empty table.
  const previewError = typeof p._preview_error === "string" ? p._preview_error : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={() => !saving && onCancel()}>
      <div className="bg-white rounded-sm shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">
            Create Oracle Receipt
          </h3>
          <button onClick={() => !saving && onCancel()} aria-label="Close"
                  className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-gray-600 leading-snug">
            This confirms the row is a real receivable and creates its receipt in Oracle now.
            It does <span className="font-semibold">not</span> match the payment to an invoice —
            the row stays in Unidentified and still needs Manual Invoice Mapping.
          </p>

          {previewError ? (
            <div className="border border-amber-300 bg-amber-50 rounded-xs px-3 py-2.5">
              <p className="text-[11px] font-bold text-amber-800 mb-1">Payload could not be built</p>
              <p className="text-[11px] text-amber-900 leading-snug">{previewError}</p>
            </div>
          ) : rows.length > 0 ? (
            <div className="border border-gray-200 rounded-xs overflow-hidden">
              <table className="w-full text-[11px]">
                <tbody className="divide-y divide-gray-100">
                  {rows.map(({ key, label }) => (
                    <tr key={key}>
                      <td className="px-3 py-1.5 text-gray-400 font-black uppercase tracking-wider text-[9px] whitespace-nowrap align-middle">
                        {label}
                      </td>
                      <td className="px-3 py-1.5 font-mono font-bold text-[#222222] text-right break-all">
                        {String(p[key])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 italic">
              No payload preview is available for this row.
            </p>
          )}

          <p className="text-[10px] text-gray-400 leading-snug">
            A receipt cannot be withdrawn from here once created — reversing one is an Oracle-side
            action. If Oracle refuses it, this row returns to undecided so you can try again or
            discard it.
          </p>

          {error && (
            <p className="text-[11px] text-red-600 font-bold leading-snug">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
          <button onClick={onCancel} disabled={saving}
                  className="text-[11px] font-bold text-gray-500 hover:text-primary px-3 py-1.5 cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={saving}
                  className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider bg-[#222222] text-white px-3 py-1.5 rounded-sm cursor-pointer disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            {saving ? "Creating…" : "Create Receipt"}
          </button>
        </div>

      </div>
    </div>
  );
}
