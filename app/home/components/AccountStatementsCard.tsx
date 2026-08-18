"use client";
import { CheckCircle2, AlertTriangle, FileText, Loader2, Settings, UploadCloud, X } from "lucide-react";
import type { RefObject } from "react";
import { type StatementGroup, isStatementRunnable, isAccountRunnable } from "../types";

export interface DetectionInfo {
  config_key: string | null;
  warning: string | null;
  ambiguous?: boolean;
}

interface AccountStatementsCardProps {
  statementInputRef: RefObject<HTMLInputElement | null>;
  onStatementUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  statementUploading: boolean;
  /** AI (Layer 2B narrative extraction) confirmed reachable. When false,
   *  uploading is blocked — a statement is only worth ingesting if it can
   *  actually be analysed. See app/home/page.tsx's AI gate. */
  aiReady: boolean;
  /** Specific reason the gate is blocking (why AI is unavailable). Shown when
   *  !aiReady. Built by app/home/page.tsx's aiGateReason(). */
  aiReason: string;
  /** A statement is already sitting in the list below — only one may be
   *  listed at a time (analysed, pending configuration, or anything else),
   *  so Upload is blocked until it's removed. See app/home/page.tsx's
   *  hasQueuedStatement. */
  hasQueuedStatement: boolean;
  statementGroups: StatementGroup[];
  isStatementSelected: (s: StatementGroup) => boolean;
  toggleStatementSelected: (s: StatementGroup) => void;
  detectionInfo: Record<string, DetectionInfo>;
  onOpenResolveForFile: (filename: string, mode: "ambiguous" | "reconfigure") => void;
  onOpenWizardForFile: (filename: string) => void;
  onRemoveFile: (filename: string) => void;
}

/**
 * Account Statements card — upload trigger, plus one entry per uploaded
 * STATEMENT with an "include in next run" checkbox, its ingest/config status,
 * and the bank account(s) its rows belong to.
 *
 * Files used to be nested UNDER accounts, which listed a statement once per
 * account it contained — a single upload whose account-number column held six
 * accounts appeared as six identical files. Accounts are shown inside the
 * statement instead, which also matches selection: a run takes whole files, so
 * all of a statement's accounts are included or excluded together.
 */
export default function AccountStatementsCard({
  statementInputRef, onStatementUpload, statementUploading, aiReady, aiReason,
  hasQueuedStatement, statementGroups, isStatementSelected, toggleStatementSelected,
  detectionInfo, onOpenResolveForFile, onOpenWizardForFile, onRemoveFile,
}: AccountStatementsCardProps) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col min-h-[140px]">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 mb-3">
          <FileText size={14} className="text-[#222222]" /> Account Statements
        </h3>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Upload XLS / CSV files. Max 10 MB each.
        </p>
        {!aiReady && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold text-amber-700 leading-snug">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            <span>{aiReason}</span>
          </p>
        )}
      </div>
      <input
        ref={statementInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={onStatementUpload}
      />
      <div className="mt-3 pt-2 border-t border-gray-100 space-y-2.5">
        <button
          onClick={() => statementInputRef.current?.click()}
          disabled={statementUploading || !aiReady || hasQueuedStatement}
          title={
            !aiReady ? aiReason
            : hasQueuedStatement ? "A statement is already in the list — remove it before uploading another."
            : undefined
          }
          style={{ width: "100%" }}
          className="flex w-full box-border items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 hover:border-primary text-primary px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider bg-gray-50/50 hover:bg-gray-50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed h-[62px]"
        >
          <UploadCloud size={14} className="text-[#222222]" />
          <span>
            {statementUploading ? "Uploading…"
              : !aiReady ? "Upload Unavailable"
              : hasQueuedStatement ? "Remove Current File First"
              : "Upload"}
          </span>
        </button>
        {statementGroups.length > 0 && (
          <div className="space-y-2.5 max-h-[220px] overflow-y-auto">
          {statementGroups.map((s) => {
            // Only a statement with at least one recognised, pending-row account
            // can be included in a run (see isStatementRunnable). An
            // Unknown/errored/0-row statement's checkbox is disabled so it can't
            // be selected into a no-op run.
            const runnable = isStatementRunnable(s);
            const selected = runnable && isStatementSelected(s);
            const noAccount = s.accounts.every((a) => a.bank_account_id == null);
            const lastConsumed = s.accounts.find((a) => a.last_consumed_run_id != null)?.last_consumed_run_id;
            const disabledReason = s.accounts.length === 0 || noAccount
              ? "Configure this statement's account(s) before it can be analyzed"
              : lastConsumed != null
                ? `All rows from this statement were already processed in run #${lastConsumed} — this is a duplicate, nothing new to analyze`
                : "No pending rows to analyze";
            return (
              <div key={s.filename} className="border border-gray-200 rounded-xl overflow-hidden">
                <label
                  className={`flex items-center gap-2 px-2 py-1.5 bg-gray-100/60 select-none ${runnable ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                  title={runnable ? undefined : disabledReason}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!runnable}
                    onChange={() => toggleStatementSelected(s)}
                    className="rounded-md text-[#222222] focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-[10px] font-black text-primary uppercase tracking-wide truncate">
                    {s.accounts[0]?.bank_name || s.file.bank_name}
                    {s.accounts.length === 1 && s.accounts[0].account_number
                      ? ` · ${s.accounts[0].account_number}`
                      : s.accounts.length > 1
                        ? ` · ${s.accounts.length} accounts`
                        : ""}
                  </span>
                  {s.pending_row_count > 0 && (
                    <span className="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">
                      {s.pending_row_count.toLocaleString()} pending row{s.pending_row_count === 1 ? "" : "s"}
                    </span>
                  )}
                </label>
                <div className="space-y-1.5 p-1.5">
                  {[s.file].map((f) => {
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
                    const hasError = f.ingest_status === "error";
                    const isUnrecognized = f.ingest_status === "unrecognized";
                    // Recognised format, but at least one account in the file has
                    // no config yet — a partially-configured multi-account
                    // statement. Distinct from "unknown format": the recipe
                    // already exists, so this is "add the missing account(s)",
                    // not "build a config from scratch". Explained inline rather
                    // than in a tooltip, since a bare Reconfigure button reads as
                    // "redo the whole thing".
                    const isIncomplete = isUnrecognized && !!f.bank_config_key;
                    const isUnknown = det
                      ? (!det.config_key && !isAmbiguous)
                      : (!f.bank_name || f.bank_name === "Unknown") && f.ingest_status !== "ready";
                    return (
                      <div
                        key={f.filename}
                        className={`text-[11px] border rounded-md px-2 py-1.5 ${
                          isUnknown || isAmbiguous || hasError || isUnrecognized ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"
                        }`}
                      >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileText size={11} className="text-gray-400 shrink-0" />
                          <span className="font-mono font-bold text-primary truncate text-[10px]">{f.filename}</span>
                          {det?.config_key ? (
                            <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md">{det.config_key}</span>
                          ) : isUnknown ? (
                            <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-md">Unknown</span>
                          ) : (
                            // Just the size. `f.bank_name` is bank_config_key —
                            // the matched ACCOUNT NUMBER, or the literal
                            // "Unknown" — which read as "Unknown · 0.22MB" on a
                            // perfectly-ingested statement. Bank and account
                            // identity live in the statement header above.
                            <span className="text-gray-400 shrink-0 text-[10px]">{f.size_mb}MB</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {f.ingest_status === "processing" ? (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-md" title="Parsing and deduplicating rows in the background">
                              <Loader2 size={9} className="animate-spin" /> Processing
                            </span>
                          ) : f.ingest_status === "ready" ? (
                            <span
                              className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md"
                              title={
                                s.pending_row_count > 0
                                  ? `${s.pending_row_count} row(s) still pending analysis` +
                                    ((f.new_row_count ?? 0) > 0
                                      ? ` (${f.new_row_count} new at ingest${f.duplicate_row_count ? `, ${f.duplicate_row_count} already-seen skipped` : ""})`
                                      : "")
                                  : lastConsumed != null
                                    ? `All rows already processed in run #${lastConsumed}`
                                    : `No pending rows — all ${f.duplicate_row_count ?? 0} row(s) were already ingested earlier`
                              }
                            >
                              <CheckCircle2 size={9} /> {s.pending_row_count > 0 ? `Ready (${s.pending_row_count} pending)` : "Ready"}
                            </span>
                          ) : f.ingest_status === "error" ? (
                            // A real failure — a config DID match, something else broke
                            // (OU not mapped, an unexpected exception mid-parse, ...).
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-red-700 bg-red-100 px-1.5 py-0.5 rounded-md" title={f.ingest_error || "Ingestion failed — see server logs"}>
                              <AlertTriangle size={9} /> Error
                            </span>
                          ) : isIncomplete ? (
                            // Format recognised; some account in it isn't configured.
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-md" title="Some accounts in this statement have no configuration yet">
                              Accounts Missing
                            </span>
                          ) : isUnrecognized ? (
                            // No config matched at all — an expected, everyday state,
                            // not a failure. Deliberately NOT styled like Error.
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-md" title="No account configuration matches this statement yet">
                              Needs Config
                            </span>
                          ) : null}
                          {isAmbiguous ? (
                            <button onClick={() => onOpenResolveForFile(f.filename, "ambiguous")} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-amber-700 hover:text-primary cursor-pointer" title="Multiple configs match — choose one">
                              <Settings size={10} /> Choose
                            </button>
                          ) : hasError ? (
                            <button onClick={() => onOpenResolveForFile(f.filename, "reconfigure")} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-amber-700 hover:text-primary cursor-pointer" title={f.ingest_error || "Ingestion failed — test the matched config, or build a new one"}>
                              <Settings size={10} /> Reconfigure
                            </button>
                          ) : isIncomplete ? (
                            <button onClick={() => onOpenResolveForFile(f.filename, "reconfigure")} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-amber-700 hover:text-primary cursor-pointer" title="Add the missing account(s) to this statement's existing config">
                              <Settings size={10} /> Add Accounts
                            </button>
                          ) : isUnrecognized || isUnknown ? (
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
                      {/* Spelled out inline: which accounts are already fine and
                          which still need adding. A bare "Reconfigure" button gave
                          no hint that most of the statement was already set up. */}
                      {isIncomplete && f.ingest_error && (
                        <div className="mt-1.5 pt-1.5 border-t border-amber-200 flex items-start gap-1.5">
                          <AlertTriangle size={10} className="shrink-0 mt-0.5 text-amber-600" />
                          <p className="text-[10px] text-amber-800 leading-snug">{f.ingest_error}</p>
                        </div>
                      )}
                      </div>
                    );
                  })}
                  {/* The accounts this one statement's rows belong to. Only worth
                      listing when there's more than one — a single-account
                      statement already shows its account in the header. */}
                  {s.accounts.length > 1 && (
                    <div className="px-1 pt-0.5 space-y-0.5">
                      {s.accounts.map((a) => (
                        <div key={a.key} className="flex items-baseline gap-1.5 text-[10px]">
                          <span className="font-mono text-gray-600 shrink-0">{a.account_number || "—"}</span>
                          {a.business_unit && a.ou_number ? (
                            <span className="text-gray-400 truncate">{a.business_unit} (OU {a.ou_number})</span>
                          ) : (
                            <span className="text-amber-700">no Business Unit</span>
                          )}
                          <span className="ml-auto shrink-0 text-gray-400">
                            {a.pending_row_count.toLocaleString()}
                            {isAccountRunnable(a) ? "" : " (nothing pending)"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}