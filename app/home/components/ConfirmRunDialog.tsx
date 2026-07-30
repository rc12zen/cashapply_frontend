"use client";
/**
 * app/home/components/ConfirmRunDialog.tsx
 * ============================================
 * Shown right before "Start Analysis" actually fires — lists exactly
 * which bank accounts, and which Organization Unit / Business Unit each
 * one resolves to, so nobody starts a run against the wrong OU without
 * seeing it first. This matters because Oracle Fusion matches the
 * "BusinessUnit" string it receives as an EXACT match — a wrong OU/BU
 * name silently causes every receipt for that account to 404 later,
 * and this is the last point before a run starts where a person can
 * catch that.
 *
 * Purely a confirmation step — nothing here calls the backend. The
 * actual POST /run/start only happens if the person clicks "Confirm &
 * Start Analysis".
 */
import { AlertTriangle, Building2, Landmark, Loader2, X } from "lucide-react";
import type { AccountGroup } from "../types";

export default function ConfirmRunDialog({
  groups,
  loading,
  onCancel,
  onConfirm,
}: {
  groups: AccountGroup[];
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const totalPendingRows = groups.reduce((sum, g) => sum + (g.pending_row_count || 0), 0);
  const missingBU = groups.filter((g) => !g.business_unit || !g.ou_number);
  // Statements whose rows span several accounts (a multi-account account-number
  // column). Every account in such a statement is processed together — a run
  // can't take a subset of one file — so it's called out explicitly here rather
  // than leaving the person to infer it from repeated filenames.
  const fileAccountCount = new Map<string, number>();
  groups.forEach((g) => g.files.forEach((f) =>
    fileAccountCount.set(f.filename, (fileAccountCount.get(f.filename) ?? 0) + 1)));
  const multiAccountFiles = [...fileAccountCount.entries()].filter(([, n]) => n > 1);
  const distinctFiles = fileAccountCount.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !loading && onCancel()}>
      <div className="bg-white rounded-sm shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">
            Confirm Analysis Run
          </h3>
          <button onClick={() => !loading && onCancel()} className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-[11px] text-gray-500 font-medium">
            This run will process <strong className="text-primary">{totalPendingRows}</strong> pending
            row{totalPendingRows === 1 ? "" : "s"} across{" "}
            <strong className="text-primary">{groups.length}</strong> account
            {groups.length === 1 ? "" : "s"} from {distinctFiles} statement
            {distinctFiles === 1 ? "" : "s"}. Check the Business Unit for each account is correct before
            continuing — a wrong or misspelled Business Unit name will cause every receipt for that
            account to be rejected by Oracle later.
          </p>

          {multiAccountFiles.length > 0 && (
            <div className="bg-gray-50 border-l-2 border-gray-300 p-2.5 text-[11px] flex items-start gap-2 rounded-r-sm">
              <Landmark size={13} className="text-gray-400 shrink-0 mt-0.5" />
              <span className="text-gray-700">
                {multiAccountFiles.length === 1 ? (
                  <>
                    <span className="font-mono text-[10px]">{multiAccountFiles[0][0]}</span> contains{" "}
                    <strong>{multiAccountFiles[0][1]} different accounts</strong> in its account-number
                    column.
                  </>
                ) : (
                  <>
                    <strong>{multiAccountFiles.length} statements</strong> contain several accounts each in
                    their account-number column.
                  </>
                )}{" "}
                Every account listed below is processed together — each row is posted against its own
                account and Organization Unit.
              </span>
            </div>
          )}

          {missingBU.length > 0 && (
            <div className="bg-amber-50 border-l-2 border-amber-400 p-2.5 text-[11px] flex items-start gap-2 rounded-r-sm">
              <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
              <span className="text-gray-700">
                {missingBU.length} account{missingBU.length === 1 ? "" : "s"} below has no Business Unit
                resolved yet — its rows will still be analyzed, but likely won't be postable to Oracle
                until that's fixed on the <strong>Accounts &amp; OU's</strong> page.
              </span>
            </div>
          )}

          <div className="border border-gray-200 rounded-sm divide-y divide-gray-100">
            {groups.map((g) => (
              <div key={g.key} className="px-3 py-2.5 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Landmark size={13} className="text-gray-300 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold text-primary text-xs truncate">{g.bank_name}</div>
                    <div className="font-mono text-[10px] text-gray-400 truncate">
                      {g.account_number || "—"} &middot; {g.files.length} file{g.files.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {g.business_unit && g.ou_number ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-700 px-2 py-1 rounded-xs">
                      <Building2 size={10} className="text-gray-400" />
                      {g.business_unit} <span className="text-gray-400 font-mono normal-case">(OU {g.ou_number})</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-1 rounded-xs">
                      No Business Unit
                    </span>
                  )}
                  <div className="text-[10px] text-gray-400 mt-1">{g.pending_row_count} pending row{g.pending_row_count === 1 ? "" : "s"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="text-[11px] font-black uppercase tracking-wider text-gray-500 hover:text-primary px-3 py-2 rounded-sm cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider bg-[#222222] hover:bg-black text-white px-4 py-2 rounded-sm cursor-pointer shadow-xs disabled:opacity-50"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            {loading ? "Starting…" : "Confirm & Start Analysis"}
          </button>
        </div>
      </div>
    </div>
  );
}