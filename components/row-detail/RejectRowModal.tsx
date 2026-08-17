"use client";
/**
 * components/row-detail/RejectRowModal.tsx
 * ==========================================
 * Collects the REASON a row is being rejected. Backend has always accepted a
 * comment (hitl/service.py's reject_row persists it to RowStatusHistory) and
 * lib/api.ts's rejectEntry has always had the parameter — but no caller ever
 * passed one, so every rejection in the system was reasonless.
 *
 * That gap showed up as soon as reopen gained an edit screen: the first thing a
 * SPOC needs when deciding what to change is why the row was rejected in the
 * first place, and there was nothing to show them (see ReopenAndReviewModal).
 *
 * The comment stays OPTIONAL — making it mandatory would change the contract of
 * an existing action that works today across every bucket.
 */
import { Loader2, X, XCircle } from "lucide-react";
import { useState } from "react";

export default function RejectRowModal({
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
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">Reject Row</h3>
          <button onClick={() => !saving && onCancel()}
                  className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-gray-600 leading-snug">
            The row moves to <span className="font-semibold">Rejected</span> and its invoice claim is
            released, so another payment can match those invoices. Nothing is sent to Oracle, and any
            receipt that already exists is left untouched. This can be reopened later.
          </p>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
              Reason (optional)
            </label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
                      autoFocus
                      placeholder="Why is this being rejected? Shown to whoever reopens it."
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
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 px-4 py-2 rounded-sm cursor-pointer disabled:opacity-40">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
            {saving ? "Rejecting…" : "Reject Row"}
          </button>
        </div>
      </div>
    </div>
  );
}
