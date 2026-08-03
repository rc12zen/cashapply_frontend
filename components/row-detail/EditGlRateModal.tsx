"use client";
/**
 * components/row-detail/EditGlRateModal.tsx
 * =============================================
 * PATCHes the Leg 2 (invoice -> functional) GL conversion rate on an
 * already-created Oracle receipt — see hitl/service.py's edit_gl_rate()
 * for the full guard (cross-ledger rows only, only before invoice mapping
 * exists on the receipt).
 */
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useState } from "react";

export default function EditGlRateModal({
  currentRate,
  standardReceiptId,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  currentRate: number | null;
  standardReceiptId: string | null;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (data: { new_rate: number; reason: string }) => void;
}) {
  const [rate, setRate] = useState(currentRate != null ? String(currentRate) : "");
  const [reason, setReason] = useState("");

  const parsed = parseFloat(rate);
  const isValid = rate.trim() !== "" && !isNaN(parsed) && parsed > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSubmit({ new_rate: parsed, reason: reason.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onCancel()}>
      <div className="bg-white rounded-sm shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">Edit GL Rate</h3>
          <button onClick={() => !saving && onCancel()} className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="text-[11px] text-gray-500 font-medium">
            Oracle receipt <span className="font-mono font-bold text-primary">{standardReceiptId || "—"}</span>
          </div>

          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
            <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
              This directly PATCHes the receipt already created in Oracle. Only allowed before
              invoice mapping exists on it — once mapped, this needs a reverse-and-recreate correction instead.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
              Current rate
            </label>
            <div className="text-sm font-mono font-bold text-gray-400">{currentRate ?? "—"}</div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
              New rate
            </label>
            <input
              type="number" step="0.0001" autoFocus
              value={rate} onChange={(e) => setRate(e.target.value)}
              className="w-full text-sm font-mono px-3 py-2 border border-gray-200 rounded-sm"
              placeholder="e.g. 83.98"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
              Reason (optional, kept in the audit trail)
            </label>
            <textarea
              value={reason} onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full text-xs px-3 py-2 border border-gray-200 rounded-sm"
              placeholder="e.g. Finance-confirmed rate for this settlement date"
            />
          </div>

          {error && (
            <div className="text-[11px] text-red-600 font-semibold bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} disabled={saving}
              className="text-[11px] font-black uppercase tracking-wider text-gray-500 hover:text-primary px-3 py-2 cursor-pointer disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={!isValid || saving}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-3 py-2 rounded-sm bg-[#222222] hover:bg-black text-white disabled:opacity-50 cursor-pointer">
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              Update rate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
