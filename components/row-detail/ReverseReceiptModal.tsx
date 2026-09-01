"use client";
/**
 * components/row-detail/ReverseReceiptModal.tsx
 * =================================================
 * Collects an optional reason before unapplying ONE invoice from this
 * row's receipt (Oracle SOAP processUnapplyReceipt — see
 * hitl/service.py::reverse_receipt_invoice()). Modeled directly on
 * RejectRowModal.tsx's shell.
 *
 * Deliberately per-invoice, not per-row: opened from a single invoice's
 * row in AgingSnapshotCard, not from the row-level ActionBar — a row can
 * have several applied invoices, and only the SPOC-picked one is
 * unapplied. The receipt itself is explicitly NOT touched by this action;
 * the copy below says so plainly so it isn't confused with Delete Receipt.
 */
import { Loader2, Undo2, X } from "lucide-react";
import { useState } from "react";

export default function ReverseReceiptModal({
  invoiceNumber, saving, error, onCancel, onSubmit,
}: {
  invoiceNumber: string;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={() => !saving && onCancel()}>
      <div className="bg-white rounded-sm shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">Reverse Invoice</h3>
          <button onClick={() => !saving && onCancel()}
                  className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-gray-600 leading-snug">
            Unapplies <span className="font-mono font-semibold text-primary">{invoiceNumber}</span> from
            this row's Oracle receipt (SOAP <span className="font-mono">processUnapplyReceipt</span>). The
            invoice's amount is released back to the pool for re-mapping.
            {" "}
            <span className="font-semibold">The receipt itself is NOT deleted</span> — it stays live in
            Oracle and will be reused for whatever gets mapped next. If every applied invoice on this row
            ends up reversed, the row moves to "Receipt Reversed — Pending Remap" for manual re-mapping.
          </p>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
              Reason (optional)
            </label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
                      autoFocus
                      placeholder="Why is this invoice being unapplied?"
                      className="w-full text-[12px] border border-gray-200 rounded-sm px-2 py-1.5 resize-none" />
          </div>

          {error && <p className="text-[12px] text-red-600 font-semibold">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
          <button onClick={() => !saving && onCancel()} disabled={saving}
                  className="text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-primary px-3 py-2 cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          <button onClick={() => onSubmit(comment.trim())} disabled={saving}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-sm cursor-pointer disabled:opacity-40">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
            {saving ? "Reversing…" : "Reverse Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
