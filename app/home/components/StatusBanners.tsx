"use client";
import { AlertTriangle, ArrowRight, CheckCircle2, X } from "lucide-react";

export interface DuplicateUploadInfo {
  filename: string;
  uploaded_by: string;
  uploaded_at: string | null;
  history_link: string;
  existing_run_id: number | null;
}

export interface RunCompletionSummary {
  totalRows: number;
  identified: number;
  unidentified: number;
  readyForOracle: number;
}

interface StatusBannersProps {
  error: string;
  setError: (v: string) => void;
  duplicateUploadInfo: DuplicateUploadInfo | null;
  setDuplicateUploadInfo: (v: DuplicateUploadInfo | null) => void;
  successMessage: string;
  onDismissSuccess: () => void; // advances to the next queued success message, if any
  runCompletionSummary: RunCompletionSummary | null;
  setRunCompletionSummary: (v: RunCompletionSummary | null) => void;
  configNeededNotice: string;
  setConfigNeededNotice: (v: string) => void;
  uploadNotice: string;
  setUploadNotice: (v: string) => void;
}

/**
 * Every dismissible top-of-page banner: connection/action errors, the
 * actionable "duplicate file" banner (backend design doc §2.1), success
 * confirmations (persistent — no auto-dismiss timer, see page.tsx's
 * showSuccess/advanceSuccessQueue), and the post-run completion summary.
 * Pulled out of page.tsx as one unit since they're all simple, independent,
 * dismissible strips driven by otherwise-unrelated pieces of state.
 */
export default function StatusBanners({
  error, setError,
  duplicateUploadInfo, setDuplicateUploadInfo,
  successMessage, onDismissSuccess,
  runCompletionSummary, setRunCompletionSummary,
  configNeededNotice, setConfigNeededNotice,
  uploadNotice, setUploadNotice,
}: StatusBannersProps) {
  return (
    <>
      {/* ERROR */}
      {error && (
        <div className="bg-red-50/50 border-l-4 border-red-600 text-gray-900 px-4 py-3.5 shadow-sm text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            className="text-gray-400 hover:text-gray-600 px-2"
          >
            ×
          </button>
        </div>
      )}

      {/* UPLOAD INFO — restore/retry confirmations. Persists until dismissed;
          these used to be transient toasts, which is why they disappeared
          in seconds. */}
      {uploadNotice && (
        <div className="bg-blue-50 border-l-4 border-blue-500 text-gray-900 px-4 py-3.5 shadow-sm text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-blue-500 shrink-0" />
            <span className="font-medium">{uploadNotice}</span>
          </div>
          <button
            onClick={() => setUploadNotice("")}
            className="text-gray-400 hover:text-gray-600 px-2"
          >
            ×
          </button>
        </div>
      )}

      {/* NEEDS CONFIGURATION — actionable, persists until dismissed or resolved
          (not routed through the success toast queue, which auto-dismisses) */}
      {configNeededNotice && (
        <div className="bg-amber-50 border-l-4 border-amber-500 text-gray-900 px-4 py-3.5 shadow-sm text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0" />
            <span className="font-medium">{configNeededNotice}</span>
          </div>
          <button
            onClick={() => setConfigNeededNotice("")}
            className="text-gray-400 hover:text-gray-600 px-2"
          >
            ×
          </button>
        </div>
      )}

      {/* DUPLICATE UPLOAD — actionable banner, not a toast (backend design doc §2.1) */}
      {duplicateUploadInfo && (
        <div className="bg-amber-50 border-l-4 border-amber-500 text-gray-900 px-4 py-3.5 shadow-sm text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0" />
            <span className="font-medium">
              "{duplicateUploadInfo.filename}" was already uploaded by{" "}
              <span className="font-bold">{duplicateUploadInfo.uploaded_by}</span>
              {duplicateUploadInfo.uploaded_at && (
                <> on {new Date(duplicateUploadInfo.uploaded_at).toLocaleString()}</>
              )}
              . No new upload was processed.{" "}
              {duplicateUploadInfo.existing_run_id ? (
                <a href={duplicateUploadInfo.history_link} className="underline font-bold text-amber-700 hover:text-amber-900">
                  View existing run →
                </a>
              ) : (
                <>
                  This file hasn't been analyzed yet — no run exists for it. It's still sitting
                  in your Account Statements list below; select it and click{" "}
                  <span className="font-bold">Start Analysis</span> to process it.
                </>
              )}
            </span>
          </div>
          <button
            onClick={() => setDuplicateUploadInfo(null)}
            className="text-gray-400 hover:text-gray-600 px-2"
          >
            ×
          </button>
        </div>
      )}

      {/* SUCCESS */}
      {successMessage && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 px-4 py-3.5 text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <button
            onClick={onDismissSuccess}
            className="text-gray-400 hover:text-gray-600 px-2"
          >
            ×
          </button>
        </div>
      )}

      {/* COMPLETION BANNER */}
      {runCompletionSummary && (
        <div className="bg-[#1E3A5F] text-white px-5 py-4 shadow-sm border border-[#172e4c] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2
              size={20}
              className="text-emerald-400 shrink-0 mt-0.5"
            />
            <div>
              <div className="text-sm font-black uppercase tracking-wider">
                Analysis Complete
              </div>
              <p className="text-[11px] text-gray-300 mt-1">
                Processed{" "}
                <span className="text-white font-bold">
                  {runCompletionSummary.totalRows.toLocaleString()}
                </span>{" "}
                rows —{" "}
                <span className="text-emerald-400 font-bold">
                  {runCompletionSummary.identified.toLocaleString()} identified
                </span>
                ,{" "}
                <span className="text-red-400 font-bold">
                  {runCompletionSummary.unidentified.toLocaleString()} unidentified
                </span>
                ,{" "}
                <span className="text-blue-300 font-bold">
                  {runCompletionSummary.readyForOracle.toLocaleString()}{" "}
                  ready for Oracle
                </span>
                .
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <a
              href="/analysis-history"
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              View in Analysis History <ArrowRight size={11} />
            </a>
            <button
              onClick={() => setRunCompletionSummary(null)}
              className="text-gray-400 hover:text-white cursor-pointer p-1"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}