"use client";
/**
 * components/row-detail/DeleteReceiptModal.tsx
 * =================================================
 * Collects an optional reason and confirms deleting this row's Oracle
 * receipt entirely (REST DELETE — see hitl/service.py::delete_receipt()).
 * A SEPARATE, more destructive action than Reverse (ReverseReceiptModal),
 * which only unapplies one invoice and leaves the receipt intact — this
 * removes the receipt itself. Only reachable when the receipt has no
 * active application (server-enforced; see actions_registry.py's
 * receipt_deletable condition).
 *
 * On success, the caller (row/[id]/page.tsx) immediately follows up with
 * DeleteReceiptChoiceModal — "Create New Receipt" or "Discard" — since a
 * deleted receipt always needs one of those two next.
 */
import { FileX, Loader2, X } from "lucide-react";
import { useState } from "react";

export default function DeleteReceiptModal({
  saving, error, onCancel, onSubmit,
}: {
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
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">Delete Receipt</h3>
          <button onClick={() => !saving && onCancel()}
                  className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-gray-600 leading-snug">
            Permanently deletes this row's Oracle receipt (<span className="font-mono">DELETE
            /standardReceipts/&#123;id&#125;</span>). This cannot be undone — after deleting, you'll choose
            whether to create a fresh receipt for this row or discard it entirely.
          </p>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
              Reason (optional)
            </label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
                      autoFocus
                      placeholder="Why is this receipt being deleted?"
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
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-sm cursor-pointer disabled:opacity-40">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <FileX size={12} />}
            {saving ? "Deleting…" : "Delete Receipt"}
          </button>
        </div>
      </div>
    </div>
  );
}
