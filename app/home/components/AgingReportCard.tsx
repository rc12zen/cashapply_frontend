"use client";
import { AlertTriangle, CheckCircle2, ChevronDown, Layers, RefreshCw } from "lucide-react";

export interface AgingHistoryEntry {
  id: number;
  filename: string;
  uploaded_at: string | null;
  is_active: boolean;
}

interface AgingReportCardProps {
  agingStatus: { loaded: boolean; row_count: number; filename: string | null; loaded_at?: string | null };
  agingHistory: AgingHistoryEntry[];
  agingSwitching: boolean;
  onSelectAgingSource: (sourceFileId: number) => void;
  /** PATCH: manual "check the watch folder now" action — re-scans
      AGING_WATCH_FOLDER by file modification time (rather than waiting for
      the next background poll) and loads whichever file is newest,
      including a re-drop of the same filename with fresher content. */
  onCheckWatchFolder: () => void;
  checkingWatchFolder: boolean;
}

/**
 * Aging Report card — shows the auto-loaded (SFTP watch-folder) snapshot
 * status and lets the user pick an older aging source file on demand, or
 * force an immediate re-check of the watch folder.
 */
export default function AgingReportCard({
  agingStatus, agingHistory, agingSwitching, onSelectAgingSource,
  onCheckWatchFolder, checkingWatchFolder,
}: AgingReportCardProps) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col min-h-[140px]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 mb-3">
            <Layers size={14} className="text-[#222222]" /> Aging Report
          </h3>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Auto-loaded from the Oracle SFTP (<code className="bg-gray-100 px-1 rounded text-[10px]">AGING_WATCH_FOLDER</code>).
          </p>
        </div>
        {/* PATCH: manual watch-folder check — doesn't wait for the next
            AGING_POLL_INTERVAL_SECONDS tick, and (server-side) now also
            picks up a re-dropped file with the SAME filename if its
            modification time is newer than what was last loaded. */}
        <button
          type="button"
          onClick={onCheckWatchFolder}
          disabled={checkingWatchFolder}
          title="Check the watch folder now for a newer aging file"
          className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <RefreshCw size={11} className={checkingWatchFolder ? "animate-spin" : ""} />
          {checkingWatchFolder ? "Checking…" : "Check Now"}
        </button>
      </div>
      <div className="mt-3 pt-2 border-t border-gray-100 space-y-2">
        {agingStatus.loaded && agingStatus.filename ? (
          <div className="flex w-full box-border items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5 h-[62px]">
            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Loaded</span>
              <p className="font-mono font-bold text-primary text-[10px] truncate mt-0.5">{agingStatus.filename}</p>
              {/* PATCH: when the file was actually loaded into the watch
                  folder / picked up by the watcher — distinct from the
                  file's own "as of" business date shown in the dropdown
                  below (that one comes from SourceFile.uploaded_at, this
                  one from aging_store's loaded_at). */}
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

        {/* PATCH: choose from past aging report source files — available even
            while a snapshot is currently loaded, so the user can go back to an
            older one on demand instead of only ever using the newest upload.
            This is run history, not a live status — the "(active)" tag
            previously appended to the selected option's own label has been
            removed since the <select>'s own current value already shows
            which one is active; the dropdown highlighting a row as
            selected/active while ALSO labelling it "(active)" was redundant. */}
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
                  {h.filename}{h.uploaded_at ? ` — ${new Date(h.uploaded_at).toLocaleDateString()}` : ""}
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