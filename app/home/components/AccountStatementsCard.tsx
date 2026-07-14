"use client";
import { CheckCircle2, AlertTriangle, FileText, Loader2, Settings, UploadCloud, X } from "lucide-react";
import type { RefObject } from "react";
import type { AccountGroup, FileInfo } from "../types";

export interface DetectionInfo {
  config_key: string | null;
  warning: string | null;
  ambiguous?: boolean;
}

interface AccountStatementsCardProps {
  statementInputRef: RefObject<HTMLInputElement>;
  onStatementUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  statementUploading: boolean;
  accountGroups: AccountGroup[];
  isAccountSelected: (key: string) => boolean;
  toggleAccountSelected: (key: string) => void;
  detectionInfo: Record<string, DetectionInfo>;
  onOpenResolveForFile: (filename: string, mode: "ambiguous" | "reconfigure") => void;
  onOpenWizardForFile: (filename: string) => void;
  onRemoveFile: (filename: string) => void;
}

/**
 * Account Statements card — upload trigger, plus every uploaded file
 * grouped by resolved bank account, with account-level "include in next
 * run" checkboxes and per-file config/ingest-status badges.
 */
export default function AccountStatementsCard({
  statementInputRef, onStatementUpload, statementUploading,
  accountGroups, isAccountSelected, toggleAccountSelected,
  detectionInfo, onOpenResolveForFile, onOpenWizardForFile, onRemoveFile,
}: AccountStatementsCardProps) {
  return (
    <div className="bg-white border border-gray-200 p-5 shadow-xs flex flex-col justify-between min-h-[140px]">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 mb-3">
          <FileText size={14} className="text-[#2E6DA4]" /> Account Statements
        </h3>
        <input
          ref={statementInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={onStatementUpload}
        />
        <button
          onClick={() => statementInputRef.current?.click()}
          disabled={statementUploading}
          className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-300 hover:border-primary text-primary py-3.5 px-4 text-[11px] font-bold uppercase tracking-wider bg-gray-50/50 hover:bg-gray-50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <UploadCloud size={14} className="text-[#4A90E2]" />
          <span>{statementUploading ? "Uploading…" : "Upload From Local"}</span>
        </button>
      </div>
      {accountGroups.length > 0 ? (
        <div className="mt-3 pt-2 border-t border-gray-100 space-y-2.5 max-h-[220px] overflow-y-auto">
          {accountGroups.map((g) => {
            const selected = isAccountSelected(g.key);
            return (
              <div key={g.key} className="border border-gray-200 rounded-xs overflow-hidden">
                <label className="flex items-center gap-2 px-2 py-1.5 bg-gray-100/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleAccountSelected(g.key)}
                    className="rounded-xs text-[#4A90E2] focus:ring-0 cursor-pointer"
                  />
                  <span className="text-[10px] font-black text-primary uppercase tracking-wide truncate">
                    {g.bank_name}{g.account_number ? ` · ${g.account_number}` : ""}
                  </span>
                  <span className="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-xs">
                    {g.pending_row_count.toLocaleString()} pending row{g.pending_row_count === 1 ? "" : "s"}
                  </span>
                </label>
                <div className="space-y-1.5 p-1.5">
                  {g.files.map((f: FileInfo) => {
                    const det = detectionInfo[f.filename];
                    const isAmbiguous = !!det?.ambiguous;
                    // PATCH: detectionInfo is populated ONLY inside
                    // handleStatementUpload()'s success path, for a file
                    // uploaded in THIS browser session. On a page reload,
                    // a different tab, or simply returning later
                    // ("Welcome back, Admin"), det is undefined for every
                    // file — which used to force isUnknown to false no
                    // matter what the backend actually knows, silently
                    // hiding the Configure button and leaving only the red
                    // ERROR badge with no way to act on it. Fall back to
                    // the file's own persisted fields (already returned by
                    // GET /api/run/files: bank_name is r.bank_config_key or
                    // "Unknown") whenever there's no in-session detection
                    // info to use instead.
                    const isUnknown = det
                      ? (!det.config_key && !isAmbiguous)
                      : (!f.bank_name || f.bank_name === "Unknown") && f.ingest_status !== "ready";
                    return (
                      <div
                        key={f.filename}
                        className={`flex items-center justify-between text-[11px] border rounded-xs px-2 py-1.5 gap-2 ${
                          isUnknown || isAmbiguous ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileText size={11} className="text-gray-400 shrink-0" />
                          <span className="font-mono font-bold text-primary truncate text-[10px]">{f.filename}</span>
                          {det?.config_key ? (
                            <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-xs">{det.config_key}</span>
                          ) : isUnknown ? (
                            <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-xs">Unknown</span>
                          ) : (
                            <span className="text-gray-400 shrink-0 text-[10px]">{f.bank_name} · {f.size_mb}MB</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {f.ingest_status === "processing" ? (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-xs" title="Parsing and deduplicating rows in the background">
                              <Loader2 size={9} className="animate-spin" /> Processing
                            </span>
                          ) : f.ingest_status === "ready" ? (
                            <span
                              className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-xs"
                              title={`${f.new_row_count ?? 0} new row(s)${f.duplicate_row_count ? `, ${f.duplicate_row_count} duplicate(s) skipped` : ""}`}
                            >
                              <CheckCircle2 size={9} /> Ready ({f.new_row_count ?? 0} new)
                            </span>
                          ) : f.ingest_status === "error" ? (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-red-700 bg-red-100 px-1.5 py-0.5 rounded-xs" title="Ingestion failed — see server logs">
                              <AlertTriangle size={9} /> Error
                            </span>
                          ) : null}
                          {isAmbiguous ? (
                            <button onClick={() => onOpenResolveForFile(f.filename, "ambiguous")} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-amber-700 hover:text-primary cursor-pointer" title="Multiple configs match — choose one">
                              <Settings size={10} /> Choose
                            </button>
                          ) : isUnknown ? (
                            <button onClick={() => onOpenWizardForFile(f.filename)} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-amber-700 hover:text-primary cursor-pointer" title="Open Config Builder">
                              <Settings size={10} /> Configure
                            </button>
                          ) : null}
                          <button
                            onClick={() => onRemoveFile(f.filename)}
                            className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer shrink-0"
                            title="Remove from next run (file kept in storage)"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 pt-2 border-t border-gray-100 text-[11px] text-gray-400">
          Upload XLS / CSV files. Max 10 MB each.
        </div>
      )}
    </div>
  );
}
