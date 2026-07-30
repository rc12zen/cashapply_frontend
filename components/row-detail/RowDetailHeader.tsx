"use client";

/**
 * components/row-detail/RowDetailHeader.tsx
 * =====================================================
 * The dark top bar on Row Detail: Back button, breadcrumb (statement date
 * · run # · category chip · row ID), the server-computed ActionBar, and
 * the dismissible error strip beneath it. Extracted verbatim from
 * app/analysis-history/row/[id]/page.tsx.
 */
import { AlertTriangle, ArrowLeft, X } from "lucide-react";
import ActionBar from "@/components/row-detail/ActionBar";
import { AvailableRowAction, fmtDate, STATUS_CHIP, STATUS_LABEL } from "@/components/row-detail/types";

export default function RowDetailHeader({
  statementDate, runId, status, categoryLabel, recordId,
  availableActions, onAction, busyCode,
  actionError, onClearError, onBack,
}: {
  statementDate: string | null;
  runId?: number;
  status: string;
  categoryLabel?: string;
  recordId: number;
  availableActions: AvailableRowAction[];
  onAction: (code: string) => void;
  busyCode: string | null;
  actionError: string;
  onClearError: () => void;
  onBack: () => void;
}) {
  return (
    <>
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="bg-[#222222] px-5 py-0 flex items-stretch flex-shrink-0 shadow-md">

        {/* Back */}
        <button onClick={onBack}
          className="flex items-center gap-2 hover:bg-white/10 px-4 transition-colors cursor-pointer border-r border-white/10 mr-4">
          <ArrowLeft size={14} className="text-white/70" />
          <span className="text-[10px] font-black text-white/70 uppercase tracking-wider">Back</span>
        </button>

        {/* Breadcrumb: Statement date · Run ID · Category · Row ID */}
        <div className="flex items-center gap-2 py-3.5 flex-1 min-w-0 flex-wrap">
          {statementDate && (
            <span className="text-[11px] font-bold text-white/60 font-mono">{fmtDate(statementDate)}</span>
          )}
          {statementDate && <span className="text-white/20">·</span>}
          {runId && (
            <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">Run #{runId}</span>
          )}
          {runId && <span className="text-white/20">·</span>}
          <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-xs border ${STATUS_CHIP[status] || STATUS_CHIP.pending}`}>
            {categoryLabel || STATUS_LABEL[status] || status}
          </span>
          <span className="text-white/20">·</span>
          <span className="text-[10px] font-bold text-white/40 font-mono">ID {recordId}</span>
        </div>

        {/* Action buttons — server-computed from row state + the signed-in
            user's permissions (see hitl/actions_registry.py). No client-side
            eligibility logic needed here anymore. */}
        <div className="flex items-center gap-2 pl-4 border-l border-white/10">
          <ActionBar
            actions={availableActions || []}
            onAction={onAction}
            busyCode={busyCode}
          />
        </div>
      </div>

      {/* Error strip */}
      {actionError && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 flex items-center gap-2 text-[11px] font-bold text-red-700 flex-shrink-0">
          <AlertTriangle size={12} className="shrink-0" /> {actionError}
          <button onClick={onClearError} className="ml-auto cursor-pointer"><X size={12} /></button>
        </div>
      )}
    </>
  );
}
