"use client";
import { AlertTriangle, CheckCircle2, Layers } from "lucide-react";
interface AgingReportCardProps {
  agingStatus: { loaded: boolean; row_count: number; filename: string | null; loaded_at?: string | null };
}
/**
 * Aging Report card — shows the auto-loaded (SFTP watch-folder) snapshot
 * status.
 *
 * PATCH: the manual "Check Now" watch-folder re-scan action (and its
 * onCheckWatchFolder/checkingWatchFolder props) has been removed entirely.
 * The card is now read-only status display — the backend's background poll
 * (AGING_POLL_INTERVAL_SECONDS) is the only way a newer aging file gets
 * picked up.
 *
 * PATCH: the "pick a past aging snapshot to run against" history dropdown
 * (and its onSelectAgingSource action) has been removed entirely. Analysis
 * must always run against whichever aging file is currently active/latest
 * — there is deliberately no way from this page to select an older one.
 * See app/home/PageClient.tsx for the corresponding removal of
 * fetchAgingHistory / handleSelectAgingSource / agingHistory state.
 */
export default function AgingReportCard({
  agingStatus,
}: AgingReportCardProps) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col min-h-[140px]">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 mb-3">
          <Layers size={14} className="text-[#222222]" /> Aging Report
        </h3>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Auto-loaded from the Oracle SFTP (<code className="bg-gray-100 px-1 rounded text-[10px]">AGING_WATCH_FOLDER</code>).
        </p>
      </div>
      <div className="mt-3 pt-2 border-t border-gray-100">
        {agingStatus.loaded && agingStatus.filename ? (
          <div className="flex w-full box-border items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 h-[62px]">
            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Loaded</span>
              <p className="font-mono font-bold text-primary text-[10px] truncate mt-0.5">{agingStatus.filename}</p>
              {agingStatus.loaded_at && (
                <p className="text-[9px] text-emerald-700/70 mt-0.5">
                  Loaded {new Date(agingStatus.loaded_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex w-full box-border items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 h-[62px]">
            <AlertTriangle size={13} className="text-amber-500 shrink-0" />
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Not Loaded</span>
              <p className="text-[10px] text-gray-500 mt-0.5">Drop an aging file in the watch folder.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}