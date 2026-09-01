"use client";
/**
 * components/row-detail/DeleteReceiptChoiceModal.tsx
 * ======================================================
 * Follows immediately after a successful Delete Receipt (see
 * DeleteReceiptModal.tsx). The row is now a blank slate — no receipt
 * exists — and has to go one of two ways:
 *
 *   "Create New Receipt" — no special API call. The row's server-recomputed
 *     category/available_actions already reflects the reset state (see
 *     hitl/service.py::delete_receipt()), so it just needs a refetch —
 *     the normal Create Receipts (bulk, Analysis History) / Approve flow
 *     picks it up from there like any other row.
 *   "Discard" — calls the existing discardEntry(), whose backend gate was
 *     loosened to also accept a row with receipt_deleted_at set (see
 *     hitl/service.py::discard_row()'s docstring).
 *
 * Two-button choice, not a reason textarea — deliberately different shell
 * from RejectRowModal/ReverseReceiptModal/DeleteReceiptModal.
 */
import { CheckCircle2, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";

export default function DeleteReceiptChoiceModal({
  deletedReceiptNumber, saving, error, onClose, onCreateNew, onDiscard,
}: {
  deletedReceiptNumber?: string | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onCreateNew: () => void;
  onDiscard: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-sm shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">Receipt Deleted</h3>
          <button onClick={() => !saving && onClose()} title="Decide later — the row stays with no receipt until you choose"
                  className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-sm px-3 py-2">
            <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-800 font-medium">
              {deletedReceiptNumber ? <>Receipt <span className="font-mono font-semibold">{deletedReceiptNumber}</span> was deleted.</> : "The receipt was deleted."}
              {" "}What should happen to this row now?
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
              Discard reason (only used if you choose Discard)
            </label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
                      placeholder="Why is this row being discarded instead of re-created?"
                      className="w-full text-[12px] border border-gray-200 rounded-sm px-2 py-1.5 resize-none" />
          </div>

          {error && <p className="text-[12px] text-red-600 font-semibold">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
          <button onClick={() => !saving && onDiscard(comment.trim())} disabled={saving}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-gray-500 hover:bg-gray-600 px-4 py-2 rounded-sm cursor-pointer disabled:opacity-40">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Discard Row
          </button>
          <button onClick={() => !saving && onCreateNew()} disabled={saving}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-sm cursor-pointer disabled:opacity-40">
            <Sparkles size={12} />
            Create New Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
