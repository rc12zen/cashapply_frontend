"use client";
import { AlertTriangle, CheckCircle2, ChevronDown, Layers, RefreshCw } from "lucide-react";

export interface AgingHistoryEntry {
  id: number;
  filename: string;
  uploaded_at: string | null;
  is_active: boolean;
}

interface AgingReportCardProps {
  agingStatus: { loaded: boolean; row_count: number; filename: string | null };
  agingHistory: AgingHistoryEntry[];
  agingSwitching: boolean;
  onSelectAgingSource: (sourceFileId: number) => void;
}

/**
 * Aging Report card — shows the auto-loaded (SFTP watch-folder) snapshot
 * status and lets the user pick an older aging source file on demand.
 */
export default function AgingReportCard({
  agingStatus, agingHistory, agingSwitching, onSelectAgingSource,
}: AgingReportCardProps) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between min-h-[140px]">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 mb-3">
          <Layers size={14} className="text-[#222222]" /> Aging Report
        </h3>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Auto-loaded from the Oracle SFTP (<code className="bg-gray-100 px-1 rounded text-[10px]">AGING_WATCH_FOLDER</code>).
        </p>
      </div>
      <div className="mt-3 pt-2 border-t border-gray-100 space-y-2">
        {agingStatus.loaded && agingStatus.filename ? (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Loaded</span>
              <p className="font-mono font-bold text-primary text-[10px] truncate mt-0.5">{agingStatus.filename}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
            <AlertTriangle size={13} className="text-amber-500 shrink-0" />
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Not Loaded</span>
              <p className="text-[10px] text-gray-500 mt-0.5">Drop an aging file in the watch folder.</p>
            </div>
          </div>
        )}

        {/* PATCH: choose from past aging report source files — available even
            while a snapshot is currently loaded, so the user can go back to an
            older one on demand instead of only ever using the newest upload. */}
        {agingHistory.length > 0 && (
          <div className="relative">
            <select
              value={agingHistory.find((h) => h.is_active)?.id ?? ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) onSelectAgingSource(id);
              }}
              disabled={agingSwitching}
              className="w-full bg-gray-50 border border-gray-200 text-[10px] font-bold text-primary pl-3 pr-7 py-2.5 rounded-xl appearance-none focus:outline-none focus:border-[#222222] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {agingHistory.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.filename}{h.uploaded_at ? ` — ${new Date(h.uploaded_at).toLocaleDateString()}` : ""}{h.is_active ? " (active)" : ""}
                </option>
              ))}
            </select>
            {agingSwitching ? (
              <RefreshCw size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 animate-spin pointer-events-none" />
            ) : (
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
