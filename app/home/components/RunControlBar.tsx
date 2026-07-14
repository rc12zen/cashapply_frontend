"use client";
import { ArrowRight, CheckCircle2, Play, RefreshCw, UploadCloud } from "lucide-react";
import type { AccountGroup, FileInfo } from "../types";

interface RunControlBarProps {
  isRunning: boolean;
  loading: boolean;
  filesAlreadyAnalyzed: boolean;
  agingStatus: { loaded: boolean };
  files: FileInfo[];
  accountGroups: AccountGroup[];
  isAccountSelected: (key: string) => boolean;
  elapsedSeconds: number;
  fmtElapsed: (s: number) => string;
  onStart: () => void;
}

/**
 * The "Start Analysis" control bar — its color/copy/disabled-state all
 * depend on the same handful of readiness flags, so it's kept as one
 * self-contained component rather than split further.
 */
export default function RunControlBar({
  isRunning, loading, filesAlreadyAnalyzed, agingStatus, files,
  accountGroups, isAccountSelected, elapsedSeconds, fmtElapsed, onStart,
}: RunControlBarProps) {
  const selectedCount = accountGroups.filter((g) => isAccountSelected(g.key)).length;

  return (
    <div
      className={`px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border shadow-sm transition-all duration-300
    ${
        isRunning || loading
          ? "bg-[#1E3A5F] border-[#172e4c] text-white" // Original dark loading state
          : filesAlreadyAnalyzed
            ? "bg-amber-50 border-amber-300 rounded-lg shadow-md text-gray-900" // Already analyzed — needs a fresh upload
            : agingStatus.loaded && files.length > 0
              ? "bg-blue-600 border-4 border-blue-400 shadow-2xl text-white rounded-xl" // Strong colored background when Ready
              : "bg-white border-[#4A90E2] rounded-lg shadow-md text-gray-900" // White background when missing files/unready
      }`}
    >
      <div className="flex items-center gap-3">
        {filesAlreadyAnalyzed && !(isRunning || loading) ? (
          <CheckCircle2 size={14} className="text-amber-500" />
        ) : (
          <RefreshCw
            size={14}
            className={`${isRunning ? "animate-spin" : ""} ${
              !(isRunning || loading) &&
              agingStatus.loaded &&
              files.length > 0
                ? "text-blue-200"
                : "text-[#4A90E2]"
            }`}
          />
        )}
        <div className="text-xs font-medium">
          {isRunning ? (
            <div className="flex items-center gap-3">
              <span className="font-bold text-white">Analysis Running…</span>
              <span className="font-black text-white text-sm tracking-widest bg-white/15 px-2.5 py-1 rounded-sm tabular-nums">
                {fmtElapsed(elapsedSeconds)}
              </span>
            </div>
          ) : filesAlreadyAnalyzed ? (
            <div>
              <span className="font-bold text-sm tracking-wide text-amber-700">
                Already analyzed
              </span>
              <p className="text-[10px] text-amber-600 mt-0.5">
                These statement(s) were included in the last completed run. Upload a new statement to run analysis again.
              </p>
            </div>
          ) : agingStatus.loaded && files.length > 0 ? (
            <div>
              <span className="font-bold text-sm tracking-wide text-white">
                Ready for analysis
              </span>
              <p className="text-[10px] text-blue-100 mt-0.5">
                {selectedCount} of {accountGroups.length} account{accountGroups.length === 1 ? "" : "s"} selected —
                uncheck any you don't want included in this run.
              </p>
            </div>
          ) : (
            <span className="text-gray-500">
              File Upload Pending
            </span>
          )}
        </div>
      </div>

      <button
        onClick={onStart}
        disabled={
          isRunning || loading || files.length === 0 || !agingStatus.loaded || filesAlreadyAnalyzed ||
          selectedCount === 0
        }
        className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs whitespace-nowrap cursor-pointer
      ${
          !(isRunning || loading) && agingStatus.loaded && files.length > 0 && !filesAlreadyAnalyzed
            ? "bg-white text-blue-600 hover:bg-blue-50 rounded-md" // Inverse button style for the strong blue background
            : "bg-[#4A90E2] text-white hover:bg-[#357ABD] rounded-sm" // Standard button theme style
        }`}
      >
        {filesAlreadyAnalyzed ? (
          <>
            <UploadCloud size={11} />
            <span>Upload New Statement</span>
          </>
        ) : (
          <>
            <Play size={11} className="fill-current" />
            <span>{isRunning ? "Running…" : "Start Analysis"}</span>
            {!isRunning && <ArrowRight size={12} className="ml-0.5" />}
          </>
        )}
      </button>
    </div>
  );
}
