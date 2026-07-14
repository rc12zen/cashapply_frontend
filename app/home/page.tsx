"use client";
/**
 * Dashboard — /app/dashboard/page.tsx  (PATCHED)
 *
 * PATCH NOTES (this revision):
 *   - Metrics served from GET /api/results/metrics now include a `groups`
 *     object (see app.bff.metrics.compute_metrics / _category_for_row),
 *     computed the SAME way as the run-detail page and the HITL approve
 *     gate: unidentified | needs_remittance | ready_for_oracle |
 *     conflict_exception | processed | rejected | post_failed.
 *   - The old KPI set (Found / Not Found / Passed Validation / Failed
 *     Validation / Pending Approval) couldn't distinguish a row that's
 *     genuinely ready to post from one stuck needing a remittance or one
 *     that's a real conflict needing SPOC judgment — "Passed Validation"
 *     in particular was misleading since there's no such concept in the
 *     rule engine itself (rule_engine.py only ever produces a `category`,
 *     never a boolean pass/fail). KPI cards now read straight from
 *     `groups`, matching the run-detail dashboard and the ledger tabs
 *     exactly — same taxonomy everywhere in the app.
 *   - Pie chart metrics (METRIC_CONFIG) redefined to the same 6 groups
 *     (post_failed omitted from the chart as a rare edge case — it still
 *     has its own KPI-adjacent number if needed later, but isn't worth a
 *     7th pie slice for a number that's usually 0).
 *   - Legacy top-level fields (found/not_found/passed_validation/etc.) are
 *     still returned by the backend for compatibility, but this page no
 *     longer reads them — `groups` is the only source of truth here now.
 *   - NEW: KPI cards are now grouped into four labeled sections —
 *     Inbound Transactions, System Matching Results, Exceptions &
 *     Conflicts, and Completed — mirroring the requested dashboard
 *     mock-up. Bank Statements now lives in the Inbound Transactions
 *     group alongside Total Transactions Received.
 *
 *   - FIX (this revision): handleRemoveFile() used to swallow every error
 *     from deleteFile() in a bare `catch {}` — clicking the ✕ on a
 *     statement row would silently do nothing at all if the DELETE call
 *     failed (permission error, network issue, backend exception), with
 *     zero feedback. It now surfaces the real error via setError() (same
 *     pattern as every other handler in this file) and shows a success
 *     toast on the happy path, matching handleStatementUpload's shape.
 */
import {
  AlertTriangle, ArrowRight, Ban, Briefcase, Calendar,
  CheckCircle2, ChevronDown, ClipboardCheck, CloudLightning,
  FileText, HelpCircle, Landmark, Layers, Loader2, PieChart as PieIcon, Play,
  RefreshCw, Settings, Sparkles, UploadCloud, User, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {deleteFile,
  getAgingHistory, getAgingStatus, getFiles, getFilterOptions, getIngestStatus, getMetrics, getRunHistory,
  getPendingByAccount,
  getStatus, selectAgingSource, startRun,
  uploadStatement,
} from "@/lib/api";
import { detectForFile } from "@/lib/configBuilderApi";
import {
  getAiUsageSummary,
  getAiUsageTotals,
  downloadAiUsageCsv,
  type AiUsageSummary,
  type AiUsageTotals,
} from "@/lib/ai-usage/api";
import ConfigBuilderWizard from "@/components/ConfigBuilderWizard";
import ConfigResolveDialog from "@/components/ConfigResolveDialog";

interface ConfigCandidate {
  config_key: string;
  display_name: string;
}

interface FileInfo {
  filename:      string;
  bank_name:     string;
  size_mb:       number;
  business_unit: string;
  ou_number:     string;
  bank_account_id?: number | null;
  // ── Duplicate detection / ingestion status (additive) ────────────────────
  source_file_id?:      number;
  ingest_status?:       "processing" | "ready" | "error" | null;
  new_row_count?:        number | null;
  duplicate_row_count?:  number | null;
}

/**
 * PATCH: account-level "include in next run" selection. The orchestrator
 * consumes unconsumed rows by bank_account_id, not by file (see
 * rule_engine/orchestrator.py) — a file-level checkbox would silently not
 * match that behavior whenever two files share an account, so selection
 * happens at the account level to match reality.
 */
interface AccountGroup {
  key: string;                 // String(bank_account_id) or "unresolved"
  bank_account_id: number | null;
  account_number: string | null;
  bank_name: string;
  business_unit: string;
  ou_number: string;
  files: FileInfo[];
  pending_row_count: number;
}

/**
 * PATCH: `groups` is the new, unambiguous taxonomy — same one used by
 * compute_run_summary() (run-detail page) and _category_for_row() (HITL
 * approve gate). Legacy top-level fields are kept on the type for
 * backward compatibility with anything else reading this response, but
 * this page only reads `groups` and `total_rows_ingested` now.
 */
interface Metrics {
  total_rows_ingested: number;
  groups: {
    unidentified:       number;
    needs_remittance:   number;
    ready_for_oracle:   number;
    conflict_exception: number;
    processed:          number;
    rejected:           number;
    post_failed:        number;
  };
  // Amount view — same 7 buckets, values are USD-equivalent totals
  // (each row converted from ITS OWN functional/ledger currency into USD —
  // see bff/metrics.py's _to_usd(). Was labeled INR before, which was wrong
  // the moment any row belonged to a non-Indian OU's functional currency.)
  group_amounts?: {
    unidentified:       number;
    needs_remittance:   number;
    ready_for_oracle:   number;
    conflict_exception: number;
    processed:          number;
    rejected:           number;
    post_failed:        number;
  };
  total_usd_amount?: number;
  // PATCH: identified count for the "Identified" KPI card — every row with
  // SOME signal found (i.e. not in the unidentified bucket). Mirrors
  // total_identified on the Analysis History run-list table.
  identified?:          number;
  // Legacy — unused on this page now, kept for other consumers.
  found?:               number;
  not_found?:           number;
  passed_validation?:   number;
  failed_validation?:   number;
  pending_hitl?:        number;
  approved?:            number;
  rejected?:            number;
  posted_to_oracle?:    number;
  extraction_method_breakdown: Record<string, number>;
  aging_report_loaded:    boolean;
  aging_report_row_count: number;
  total_statements?:      number;
}

const METRIC_CONFIG = {
  unidentified:       { name: "Unidentified",         color: "#e11d48" },
  needsRemittance:    { name: "Needs Remittance",     color: "#f59e0b" },
  readyForOracle:     { name: "Ready for Oracle",     color: "#10b981" },
  conflictException:  { name: "Conflict / Exception", color: "#dc2626" },
  processed:          { name: "Processed",            color: "#1E3A5F" },
  rejected:           { name: "Rejected",             color: "#6b7280" },
};

// Maps each METRIC_CONFIG key to where its value lives in Metrics.groups.
const METRIC_GROUP_KEY: Record<keyof typeof METRIC_CONFIG, keyof Metrics["groups"]> = {
  unidentified:      "unidentified",
  needsRemittance:   "needs_remittance",
  readyForOracle:    "ready_for_oracle",
  conflictException: "conflict_exception",
  processed:         "processed",
  rejected:          "rejected",
};

export default function Dashboard() {
  const [files, setFiles]             = useState<FileInfo[]>([]);
  // PATCH: account-level pending counts + which accounts are checked to be
  // included in the next run. Keyed by String(bank_account_id), or
  // "unresolved" for files whose account couldn't be determined at ingest.
  const [pendingByAccount, setPendingByAccount] = useState<Record<string, { account_number: string | null; bank_name: string; pending_row_count: number }>>({});
  // PATCH: tracks accounts the user has explicitly UNCHECKED (opt-out model).
  // Anything not in this set is included by default — including an account
  // that's never been seen before (e.g. just uploaded) — without needing to
  // separately track "have we seen this key already" to tell "new account"
  // apart from "user unchecked this one earlier".
  const [deselectedAccountKeys, setDeselectedAccountKeys] = useState<Set<string>>(new Set());
  const [runStatus, setRunStatus]     = useState({ status: "idle", message: "", progress_current: 0, started_at: null as string | null });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const runStartedLocalRef = useRef<number | null>(null); // wall-clock ms when THIS browser session first saw "running"
  const [metrics, setMetrics]         = useState<Metrics | null>(null);
  const [agingStatus, setAgingStatus] = useState({ loaded: false, row_count: 0, filename: null });
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  // PATCH: past aging report source files — lets the user pick an older
  // snapshot even while a current one is already loaded (kind="aging_report"
  // SourceFile rows are never hard-deleted, so this is a permanent list).
  const [agingHistory, setAgingHistory]           = useState<{ id: number; filename: string; uploaded_at: string | null; is_active: boolean }[]>([]);
  const [agingSwitching, setAgingSwitching]       = useState(false);

  const [agingUploading, setAgingUploading]         = useState(false);  // kept for compat — unused
  const [statementUploading, setStatementUploading] = useState(false);
  const statementInputRef = useRef<HTMLInputElement>(null);

  // ── Duplicate-upload banner (backend design doc §2.1) ──────────────────────
  // Set when uploadStatement() returns { duplicate: true, ... } — surfaced as
  // a dismissable, actionable banner (not a toast).
  // PATCH: added existing_run_id — the backend correctly returns null here
  // when the file was uploaded but never analyzed (see
  // ingestion/file_hash.py's check_duplicate_file), but the banner used to
  // always say "View existing run →" regardless, which is misleading when
  // there's no run to view. Now branches on whether one actually exists.
  const [duplicateUploadInfo, setDuplicateUploadInfo] = useState<{
    filename: string; uploaded_by: string; uploaded_at: string | null;
    history_link: string; existing_run_id: number | null;
  } | null>(null);

  // Detection results per file + wizard/resolve state
  const [detectionInfo, setDetectionInfo] = useState<Record<string, { config_key: string | null; warning: string | null; ambiguous?: boolean }>>({});
  const [wizardFile, setWizardFile]       = useState<string | null>(null);
  const [resolveState, setResolveState]   = useState<{ filename: string; candidates: ConfigCandidate[]; mode: "ambiguous" | "reconfigure" } | null>(null);

  const [timePeriod, setTimePeriod]               = useState("Last Analysis");
  const [isCustomDateActive, setIsCustomDateActive] = useState(false);
  const [customStartDate, setCustomStartDate]     = useState("");
  const [customEndDate, setCustomEndDate]         = useState("");

  const [bankOptions, setBankOptions] = useState<string[]>([]);
  const [buOptions, setBuOptions]     = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<string[]>([]);
  const [selectedBank, setSelectedBank] = useState("All Banks");
  const [selectedBU, setSelectedBU]     = useState("All BUs");
  const [selectedUser, setSelectedUser] = useState("All Users");

  // PATCH: active-metrics toggle keys now match METRIC_CONFIG's new keys.
  const [activeMetrics, setActiveMetrics] = useState({
    unidentified: true, needsRemittance: true, readyForOracle: true,
    conflictException: true, processed: true, rejected: true,
  });

  const [userDisplayName, setUserDisplayName] = useState("Admin User");
  const [aiPanelVisible, setAiPanelVisible]   = useState(true);
  const [aiUsage, setAiUsage] = useState<AiUsageSummary | null>(null);
  const [aiTotals, setAiTotals] = useState<AiUsageTotals | null>(null);
  // The run/date scope the AI panel is currently showing — reused by the
  // "Download CSV" button so the export matches what's on screen.
  const [aiScope, setAiScope] = useState<{ runId?: number; dateFrom?: string; dateTo?: string }>({});
  const [successMessage, setSuccessMessage]   = useState("");

  // PATCH: completion banner now reports the new taxonomy too.
  const [runCompletionSummary, setRunCompletionSummary] = useState<{
    totalRows: number; identified: number; unidentified: number; readyForOracle: number;
  } | null>(null);
  const prevRunStatus = useRef<string>("idle");

  // PATCH: filenames that were part of the most recently COMPLETED run.
  // Used to stop the control bar from inviting an immediate re-run against
  // the exact same statement(s) — see filesAlreadyAnalyzed below.
  const [lastRunFiles, setLastRunFiles] = useState<string[]>([]);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await getFiles();
      setFiles(res.data.files);
    } catch {
      setError("Could not connect to backend system.");
    }
  }, []);

  const fetchPendingByAccount = useCallback(async () => {
    try {
      const res = await getPendingByAccount();
      const accounts: any[] = res.data.accounts || [];
      const byKey: Record<string, { account_number: string | null; bank_name: string; pending_row_count: number }> = {};
      accounts.forEach((a) => {
        const key = a.bank_account_id != null ? String(a.bank_account_id) : "unresolved";
        byKey[key] = { account_number: a.account_number, bank_name: a.bank_name, pending_row_count: a.pending_row_count };
      });
      setPendingByAccount(byKey);
      // Nothing else to do here — deselectedAccountKeys is opt-out, so any
      // account not explicitly unchecked (new or old) stays included.
    } catch {
      // non-fatal — falls back to "everything included" behavior below
    }
  }, []);

  const buildDateRange = (period: string, cStart: string, cEnd: string) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date(); const today = fmt(now);
    if (period === "Today")  return { date_from: today, date_to: today };
    if (period === "Yesterday") { const y = new Date(now); y.setDate(y.getDate() - 1); const ys = fmt(y); return { date_from: ys, date_to: ys }; }
    if (period === "WTD") { const m = new Date(now); m.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return { date_from: fmt(m), date_to: today }; }
    if (period === "MTD") { return { date_from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), date_to: today }; }
    if (period === "Custom Date") { return { date_from: cStart || undefined, date_to: cEnd || undefined }; }
    return {};
  };

  const doFetchMetrics = useCallback(async (period: string, cStart: string, cEnd: string) => {
    try {
      let runId: number | undefined;
      let dateFrom: string | undefined;
      let dateTo:   string | undefined;

      if (period === "Last Analysis") {
        const histRes = await getRunHistory(1, 1, undefined, undefined, undefined, undefined, undefined, "completed");
        runId = histRes.data.data?.[0]?.run_id;
      } else {
        const dr = buildDateRange(period, cStart, cEnd);
        dateFrom = (dr as any).date_from;
        dateTo   = (dr as any).date_to;
      }

      const bankFilter = selectedBank !== "All Banks" ? selectedBank : undefined;
      const buFilter   = selectedBU   !== "All BUs"   ? selectedBU   : undefined;
      const userFilter = selectedUser !== "All Users" ? selectedUser : undefined;

      // Each call catches independently: these panels are unrelated, so a
      // failure in one (e.g. a 500 from /metrics) must NOT blank the others.
      // Previously a bare Promise.all meant one rejecting call aborted the
      // whole block before setAgingStatus ran — a healthy aging report then
      // showed as "Not Loaded" purely because /metrics happened to be down.
      const [m, a, ai, aiT] = await Promise.all([
        getMetrics(runId, dateFrom, dateTo, bankFilter, buFilter, userFilter).catch(() => ({ data: null })),
        getAgingStatus().catch(() => ({ data: null })),
        // AI Run Details panel — scoped to the same run/date period as the
        // rest of the dashboard: "Last Analysis" => runId, any date pill =>
        // dateFrom/dateTo. (AI usage is tagged by run/time only, so the
        // Bank/BU/User dropdowns intentionally don't apply to these figures.)
        getAiUsageSummary(runId, dateFrom, dateTo).catch(() => ({ data: null })),
        // Global all-time / this-month totals — independent of the scope above.
        getAiUsageTotals().catch(() => ({ data: null })),
      ]);
      if (m.data)   setMetrics(m.data);
      if (a.data)   setAgingStatus(a.data);
      setAiUsage(ai.data);
      setAiTotals(aiT.data);
      setAiScope({ runId, dateFrom, dateTo });
    } catch {}
  }, [selectedBank, selectedBU, selectedUser]);

  const fetchStatus = useCallback(async () => {
    try {
      const res       = await getStatus();
      const newStatus = res.data.status;
      setRunStatus(res.data);

      if (newStatus === "completed" && prevRunStatus.current !== "completed") {
        await doFetchMetrics(timePeriod, customStartDate, customEndDate);
        try {
          const histRes = await getRunHistory(1, 1);
          const latest  = histRes.data.data?.[0];
          if (latest) {
            // PATCH: completion banner now reads the new
            // total_identified/total_unidentified/total_ready_for_oracle
            // fields from compute_run_summary_row(), matching the
            // Analysis History run-list table.
            setRunCompletionSummary({
              totalRows:      latest.total_credit_rows      ?? 0,
              identified:     latest.total_identified       ?? 0,
              unidentified:   latest.total_unidentified     ?? 0,
              readyForOracle: latest.total_ready_for_oracle ?? 0,
            });
            // PATCH: remember exactly which files this completed run used,
            // so the control bar can tell "same statements, already done"
            // apart from "new statement(s) uploaded, ready to go".
            setLastRunFiles(latest.selected_files ?? []);
          }
        } catch {}
      }
      if (newStatus === "error" && prevRunStatus.current !== "error") {
        setError(res.data.message || "Analysis run failed.");
      }
      prevRunStatus.current = newStatus;
    } catch {}
  }, [doFetchMetrics, timePeriod, customStartDate, customEndDate]);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const res = await getFilterOptions();
      setBankOptions(res.data.banks || []);
      setBuOptions(res.data.business_units || []);
      setUserOptions(res.data.users || []);
    } catch {}
  }, []);

  const fetchAgingHistory = useCallback(async () => {
    try {
      const res = await getAgingHistory();
      setAgingHistory(res.data.items || []);
    } catch {}
  }, []);

  const handleSelectAgingSource = async (sourceFileId: number) => {
    setAgingSwitching(true);
    setError("");
    try {
      const res = await selectAgingSource(sourceFileId);
      setAgingStatus({ loaded: res.data.loaded, row_count: res.data.row_count, filename: res.data.filename });
      await fetchAgingHistory();
      showSuccess(`Loaded aging snapshot "${res.data.filename}".`);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load that aging snapshot.");
    }
    setAgingSwitching(false);
  };

  useEffect(() => {
    fetchFiles();
    fetchPendingByAccount();
    doFetchMetrics("Last Analysis", "", "");
    fetchFilterOptions();
    fetchAgingHistory();
    const match = document.cookie.match(/(?:^|; )login_user_email_stub=([^;]*)/);
    if (match?.[1]) setUserDisplayName(decodeURIComponent(match[1]).split("@")[0]);
    // PATCH: seed lastRunFiles from the most recent completed run so a page
    // refresh doesn't forget that these statements were already analyzed.
    (async () => {
      try {
        const histRes = await getRunHistory(1, 1);
        const latest  = histRes.data.data?.[0];
        if (latest?.status === "completed") {
          setLastRunFiles(latest.selected_files ?? []);
        }
      } catch {}
    })();
  }, [fetchFiles, fetchPendingByAccount, doFetchMetrics, fetchFilterOptions, fetchAgingHistory]);

  useEffect(() => {
    if (timePeriod === "Custom Date") return;
    doFetchMetrics(timePeriod, customStartDate, customEndDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timePeriod]);

  // Re-fetch metrics whenever the Bank / BU / User dropdowns change — these
  // previously only populated the dropdown lists without affecting the query.
  useEffect(() => {
    doFetchMetrics(timePeriod, customStartDate, customEndDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBank, selectedBU, selectedUser]);

  useEffect(() => {
    if (runStatus.status !== "running") return;
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [runStatus.status, fetchStatus]);

  useEffect(() => {
    if (runStatus.status !== "running") {
      setElapsedSeconds(0);
      runStartedLocalRef.current = null;
      return;
    }
    // First time we see "running" in this browser session — record local time.
    if (runStartedLocalRef.current === null) {
      runStartedLocalRef.current = Date.now();
    }
    const sessionStart = runStartedLocalRef.current;
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - sessionStart) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [runStatus.status]);

  // PATCH: showSuccess() used to schedule a bare setTimeout with no way to
  // cancel it. If a second success message came in before the first one's
  // 4s timer fired (e.g. "Statement uploaded, processing..." immediately
  // followed by pollIngestStatus's "ready" message once ingestion finished
  // quickly), the FIRST timer would still fire on schedule and clear
  // whatever message was showing — even the newer one, sometimes only a
  // moment after it appeared. Now tracks the pending timer and cancels it
  // before scheduling a new one, so each message reliably gets its own
  // full 4 seconds.
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSuccess = (msg: string) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSuccessMessage(msg);
    successTimerRef.current = setTimeout(() => setSuccessMessage(""), 4000);
  };

  // PATCH: true when the currently-listed statement files are EXACTLY the
  // same set (regardless of order) as the ones the last completed run
  // already processed — i.e. nothing new has been uploaded since. Drives
  // the control bar so it doesn't say "Ready for analysis" (implying a
  // fresh, useful run) right after a completed run against the same files.
  // PATCH: group `files` by bank_account_id for the account-level checkbox
  // UI — the orchestrator consumes rows by account, not by file, so
  // selection has to happen at this granularity to match real behavior.
  const accountGroups: AccountGroup[] = useMemo(() => {
    const map = new Map<string, AccountGroup>();
    for (const f of files) {
      const key = f.bank_account_id != null ? String(f.bank_account_id) : "unresolved";
      if (!map.has(key)) {
        const meta = pendingByAccount[key];
        map.set(key, {
          key,
          bank_account_id: f.bank_account_id ?? null,
          account_number: meta?.account_number ?? null,
          bank_name: meta?.bank_name || f.bank_name,
          business_unit: f.business_unit,
          ou_number: f.ou_number,
          files: [],
          pending_row_count: meta?.pending_row_count ?? 0,
        });
      }
      map.get(key)!.files.push(f);
    }
    return Array.from(map.values());
  }, [files, pendingByAccount]);

  const isAccountSelected = (key: string) => !deselectedAccountKeys.has(key);
  const toggleAccountSelected = (key: string) => {
    setDeselectedAccountKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const filesAlreadyAnalyzed =
    files.length > 0 &&
    lastRunFiles.length === files.length &&
    [...files.map((f) => f.filename)].sort().join("|") ===
      [...lastRunFiles].sort().join("|");

  const handleStart = async () => {
    if (!agingStatus.loaded) { setError("Please load aging ledger data first."); return; }
    if (files.length === 0)  { setError("Upload at least one statement file first."); return; }
    if (filesAlreadyAnalyzed) {
      setError("These statement(s) were already analyzed. Upload a new statement to run again.");
      return;
    }
    // PATCH: only include files whose ACCOUNT is checked — the orchestrator
    // consumes rows by account, so this is the real unit of selection (see
    // accountGroups above). Previously every listed file was always sent,
    // regardless of any selection UI, which didn't exist at all before this.
    const selectedFilenames = accountGroups
      .filter((g) => isAccountSelected(g.key))
      .flatMap((g) => g.files.map((f) => f.filename));
    if (selectedFilenames.length === 0) {
      setError("No accounts selected. Check at least one account below before starting analysis.");
      return;
    }
    setError("");
    setRunCompletionSummary(null);
    setLoading(true);
    try {
      await startRun(selectedFilenames);
      prevRunStatus.current = "running";
      fetchStatus();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to start analysis");
    }
    setLoading(false);
  };

  const pollIngestStatus = (sourceFileId: number, filename: string) => {
    // Frontend half of "Upload successful. Processing..." -> "You can now
    // start Analysis." (backend design doc §4). Stops on ready/error or
    // after ~60 attempts (2 minutes) so a stuck backend job doesn't poll
    // forever in an abandoned tab.
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const res = await getIngestStatus(sourceFileId);
        const { ingest_status, new_row_count, duplicate_row_count, ingest_error } = res.data ?? {};
        setFiles((prev) =>
          prev.map((f) =>
            f.filename === filename
              ? { ...f, ingest_status, new_row_count, duplicate_row_count }
              : f
          )
        );
        if (ingest_status === "ready") {
          clearInterval(interval);
          const dupNote = duplicate_row_count ? ` (${duplicate_row_count} duplicate row(s) skipped)` : "";
          showSuccess(`"${filename}" is ready — ${new_row_count ?? 0} new row(s) ingested${dupNote}.`);
          fetchPendingByAccount();
        } else if (ingest_status === "error") {
          clearInterval(interval);
          setError(ingest_error || `Failed to process "${filename}".`);
        }
      } catch {
        // transient — keep polling until attempts run out
      }
      if (attempts >= 60) clearInterval(interval);
    }, 2000);
  };

  const handleStatementUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setStatementUploading(true); setError(""); setDuplicateUploadInfo(null);
    try {
      const res = await uploadStatement(file);
      const data = res.data ?? {};

      if (data.restored) {
        // PATCH: the file you just uploaded matches one that was
        // previously removed (✕) — the backend un-archived it instead of
        // permanently blocking it as a duplicate (which used to leave it
        // stuck: blocked from re-upload, yet invisible in this list
        // either way, since that list filters out archived files).
        await fetchFiles();
        await fetchPendingByAccount();
        showSuccess(data.message || `"${file.name}" restored to your Account Statements list.`);
        return;
      }

      if (data.duplicate) {
        // Exact-duplicate-file case (backend design doc §2.1) — not an
        // error toast, an actionable banner. existing_run_id tells us
        // whether there's actually a run to link to.
        //
        // FIX: this used to `return` here, BEFORE the fetchFiles() /
        // fetchPendingByAccount() calls below — so even though the banner
        // correctly says "it's still sitting in your Account Statements
        // list below," that list was never actually refreshed, and could
        // show empty/stale if this was the first action taken since page
        // load. Now falls through to the same refresh every other path
        // does, just skips the detection-info/ambiguous-config handling
        // below (nothing new was actually parsed).
        setDuplicateUploadInfo({
          filename: file.name,
          uploaded_by: data.uploaded_by,
          uploaded_at: data.uploaded_at,
          history_link: data.history_link,
          existing_run_id: data.existing_run_id ?? null,
        });
        await fetchFiles();
        await fetchPendingByAccount();
        return;
      }

      const { detected_bank_config, warning, ambiguous, candidates, source_file_id } = data;
      setDetectionInfo((prev) => ({
        ...prev,
        [file.name]: { config_key: detected_bank_config ?? null, warning: warning ?? null, ambiguous: !!ambiguous },
      }));
      await fetchFiles();
      await fetchPendingByAccount();
      await fetchFilterOptions();
      if (ambiguous) {
        setResolveState({ filename: file.name, candidates: candidates ?? [], mode: "ambiguous" });
        showSuccess(`"${file.name}" uploaded — multiple configs match. Choose the correct one.`);
      } else if (warning) {
        showSuccess(`"${file.name}" uploaded. Bank format not detected — click Configure to set it up.`);
      } else {
        showSuccess(`Statement "${file.name}" uploaded. Processing...`);
      }
      if (source_file_id) pollIngestStatus(source_file_id, file.name);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Statement upload failed.");
    } finally {
      setStatementUploading(false);
      if (statementInputRef.current) statementInputRef.current.value = "";
    }
  };

  const openResolveForFile = async (filename: string, mode: "ambiguous" | "reconfigure") => {
    try {
      const res = await detectForFile(filename);
      const candidates: ConfigCandidate[] = res.data?.candidates ?? [];
      setResolveState({ filename, candidates, mode });
    } catch {
      setWizardFile(filename);
    }
  };

  const handleRemoveFile = async (filename: string) => {
    // FIX: previously `try { ... } catch {}` — any failure (permission
    // error, network issue, backend exception) was silently swallowed, so
    // clicking ✕ appeared to do nothing at all with zero feedback. Now
    // surfaces the real error the same way every other handler in this
    // file does, and confirms success with a toast.
    setError("");
    try {
      await deleteFile(filename);
      await fetchFiles();
      await fetchPendingByAccount();
      showSuccess(`"${filename}" removed from the next run.`);
    } catch (e: any) {
      setError(
        e?.response?.data?.detail ||
        `Failed to remove "${filename}". Check that your account has permission to modify statements.`
      );
    }
  };

  const isRunning = runStatus.status === "running";

  // PATCH: pie data now pulls straight from metrics.groups via
  // METRIC_GROUP_KEY — no more found/not_found/passed_validation mapping.
  const getPieChartData = () => {
    if (!metrics?.groups) return [];
    const g = metrics.groups;
    const raw = (Object.keys(METRIC_CONFIG) as Array<keyof typeof METRIC_CONFIG>).map((key) => ({
      id: key,
      name: METRIC_CONFIG[key].name,
      value: g[METRIC_GROUP_KEY[key]] ?? 0,
      color: METRIC_CONFIG[key].color,
    }));
    return raw.filter((item) => activeMetrics[item.id as keyof typeof activeMetrics] && item.value > 0);
  };

  const pieData = getPieChartData();
  const dm      = metrics || {
    total_rows_ingested: 0,
    identified: 0,
    groups: {
      unidentified: 0, needs_remittance: 0, ready_for_oracle: 0,
      conflict_exception: 0, processed: 0, rejected: 0, post_failed: 0,
    },
  };
  const g = dm.groups;

  // Amount view helpers
  const EMPTY_GA = { unidentified: 0, needs_remittance: 0, ready_for_oracle: 0, conflict_exception: 0, processed: 0, rejected: 0, post_failed: 0 };
  const ga = metrics?.group_amounts ?? EMPTY_GA;
  const fmtUsd = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtElapsed = (s: number) => `${Math.floor(s / 60).toString().padStart(2,"0")}:${(s % 60).toString().padStart(2,"0")}`;
  const getAmountPieData = () =>
    (Object.keys(METRIC_CONFIG) as Array<keyof typeof METRIC_CONFIG>)
      .map((key) => ({ id: key, name: METRIC_CONFIG[key].name, value: ga[METRIC_GROUP_KEY[key]] ?? 0, color: METRIC_CONFIG[key].color }))
      .filter((item) => activeMetrics[item.id as keyof typeof activeMetrics] && item.value > 0);
  const amountPieData = getAmountPieData();

  return (
			<div className="space-y-6">
				{/* HERO */}
				<div className="bg-white border border-gray-200 p-6 shadow-xs relative overflow-hidden">
					<div className="absolute top-0 right-0 p-4 opacity-5 text-primary pointer-events-none">
						<CloudLightning size={100} />
					</div>
					<div className="max-w-4xl">
						<h2 className="text-sm font-black text-primary uppercase tracking-wider">
							Welcome back, {userDisplayName}.
						</h2>
						<p className="text-xs text-gray-600 mt-2 leading-relaxed">
							Upload an Aging report and at least one bank account statement
							below, then start analysis. The AI will automatically identify
							customers, match invoices and flag anything that needs your
							attention.
						</p>
					</div>
				</div>

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
							onClick={() => { if (successTimerRef.current) clearTimeout(successTimerRef.current); setSuccessMessage(""); }}
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

				{/* UPLOADS */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* Aging Status — auto-loaded from watch folder, with manual override */}
					<div className="bg-white border border-gray-200 p-5 shadow-xs flex flex-col justify-between min-h-[140px]">
						<div>
							<h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2 mb-3">
								<Layers size={14} className="text-[#2E6DA4]" /> Aging Report
							</h3>
							<p className="text-[11px] text-gray-500 leading-relaxed">
								Auto-loaded from the Oracle SFTP (<code className="bg-gray-100 px-1 rounded text-[10px]">AGING_WATCH_FOLDER</code>).
								Drop a new XLS/CSV file there to refresh automatically.
							</p>
						</div>
						<div className="mt-3 pt-2 border-t border-gray-100 space-y-2">
							{agingStatus.loaded && agingStatus.filename ? (
								<div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xs px-3 py-2">
									<CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
									<div className="min-w-0">
										<span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Loaded</span>
										<p className="font-mono font-bold text-primary text-[10px] truncate mt-0.5">{agingStatus.filename}</p>
									</div>
								</div>
							) : (
								<div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xs px-3 py-2">
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
											if (id) handleSelectAgingSource(id);
										}}
										disabled={agingSwitching}
										className="w-full bg-gray-50 border border-gray-300 text-[10px] font-bold text-primary pl-2.5 pr-7 py-2 rounded-sm appearance-none focus:outline-none focus:border-accent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

					{/* Statement Upload */}
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
								onChange={handleStatementUpload}
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
										<div key={g.key} className={`border rounded-xs ${selected ? "border-gray-200" : "border-gray-200 opacity-50"}`}>
											<label className="flex items-center gap-2 px-2 py-1.5 bg-gray-50/80 border-b border-gray-100 cursor-pointer select-none">
												<input
													type="checkbox"
													checked={selected}
													onChange={() => toggleAccountSelected(g.key)}
													className="cursor-pointer"
												/>
												<Landmark size={11} className="text-gray-400 shrink-0" />
												<span className="text-[10px] font-black text-primary uppercase tracking-wide truncate">
													{g.bank_name}{g.account_number ? ` · ${g.account_number}` : ""}
												</span>
												<span className="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-xs">
													{g.pending_row_count.toLocaleString()} pending row{g.pending_row_count === 1 ? "" : "s"}
												</span>
											</label>
											<div className="space-y-1.5 p-1.5">
												{g.files.map((f) => {
													const det = detectionInfo[f.filename];
													const isAmbiguous = !!det?.ambiguous;
													const isUnknown = det ? (!det.config_key && !isAmbiguous) : false;
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
																	<button onClick={() => openResolveForFile(f.filename, "ambiguous")} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-amber-700 hover:text-primary cursor-pointer" title="Multiple configs match — choose one">
																		<Settings size={10} /> Choose
																	</button>
																) : isUnknown ? (
																	<button onClick={() => setWizardFile(f.filename)} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-amber-700 hover:text-primary cursor-pointer" title="Open Config Builder">
																		<Settings size={10} /> Configure
																	</button>
																) : null}
																<button
																	onClick={() => handleRemoveFile(f.filename)}
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
				</div>

				{/* CONTROL BAR CARD */}
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
										{accountGroups.filter((g) => isAccountSelected(g.key)).length} of {accountGroups.length} account{accountGroups.length === 1 ? "" : "s"} selected —
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
						onClick={handleStart}
						disabled={
							isRunning || loading || files.length === 0 || !agingStatus.loaded || filesAlreadyAnalyzed ||
							accountGroups.filter((g) => isAccountSelected(g.key)).length === 0
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

				{/* DASHBOARD METRICS */}
				<div className="bg-white border border-gray-200 p-6 shadow-xs space-y-6">
					<div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-gray-100">
						<div>
							<h2 className="text-xs font-black text-primary uppercase tracking-wider">
								Dashboard
							</h2>
							<p className="text-[11px] text-gray-500 mt-0.5">
								Overall summary for the selected period and applied filters.
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2 self-start xl:self-auto">
							<div className="flex items-center gap-1 bg-gray-100 p-1 rounded-sm">
								{[
									"Last Analysis",
									"Today",
									"Yesterday",
									"WTD",
									"MTD",
									"Custom Date",
								].map((p) => (
									<button
										key={p}
										onClick={() => {
											setTimePeriod(p);
											setIsCustomDateActive(p === "Custom Date");
										}}
										className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xs transition-all cursor-pointer ${timePeriod === p ? "bg-[#1E3A5F] text-white shadow-xs" : "text-gray-500 hover:text-primary"}`}
									>
										{p}
									</button>
								))}
							</div>
							{isCustomDateActive && (
								<div className="flex items-center gap-1.5 border-l border-gray-200 pl-2">
									<input
										type="date"
										value={customStartDate}
										onChange={(e) => {
											const v = e.target.value;
											setCustomStartDate(v);
											doFetchMetrics("Custom Date", v, customEndDate);
										}}
										className="bg-gray-50 border border-gray-300 rounded-sm text-[10px] font-bold text-gray-600 px-2 py-1 outline-none focus:border-accent"
									/>
									<span className="text-[10px] font-bold text-gray-400">
										TO
									</span>
									<input
										type="date"
										value={customEndDate}
										onChange={(e) => {
											const v = e.target.value;
											setCustomEndDate(v);
											doFetchMetrics("Custom Date", customStartDate, v);
										}}
										className="bg-gray-50 border border-gray-300 rounded-sm text-[10px] font-bold text-gray-600 px-2 py-1 outline-none focus:border-accent"
									/>
								</div>
							)}
						</div>
					</div>

					{/* Filters */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
						{[
							{
								icon: (
									<Landmark
										size={14}
										className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
									/>
								),
								value: selectedBank,
								onChange: setSelectedBank,
								options: bankOptions,
								defaultLabel: "All Banks",
							},
							{
								icon: (
									<Briefcase
										size={14}
										className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
									/>
								),
								value: selectedBU,
								onChange: setSelectedBU,
								options: buOptions,
								defaultLabel: "All BUs",
							},
							{
								icon: (
									<User
										size={14}
										className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
									/>
								),
								value: selectedUser,
								onChange: setSelectedUser,
								options: userOptions,
								defaultLabel: "All Users",
							},
						].map(({ icon, value, onChange, options, defaultLabel }) => (
							<div key={defaultLabel} className="relative">
								{icon}
								<select
									value={value}
									onChange={(e) => onChange(e.target.value)}
									className="w-full bg-white border border-gray-300 text-xs font-bold text-primary pl-9 pr-8 py-2.5 rounded-sm appearance-none focus:outline-none focus:border-accent cursor-pointer"
								>
									<option>{defaultLabel}</option>
									{options.map((o) => (
										<option key={o}>{o}</option>
									))}
								</select>
								<ChevronDown
									size={14}
									className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
								/>
							</div>
						))}
					</div>

					{/* INBOUND TRANSACTIONS */}
					<div className="space-y-3 pt-1">
						<h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-2">
							<span aria-hidden>📊</span> Inbound Transactions
						</h4>
						<div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
							{[
								{ icon: <FileText size={12} className="text-[#2E6DA4]" />, label: "Bank Statements", value: metrics?.total_statements ?? 0, sub: "Statement files uploaded", accent: "#2E6DA4" },
								{ icon: <Layers   size={12} className="text-[#1E3A5F]" />, label: "Total Transactions Received", value: dm.total_rows_ingested ?? 0, sub: "All line items from bank statement with credit only", accent: "#1E3A5F" },
							].map(({ icon, label, value, sub, accent }) => (
								<div key={label} className="border border-gray-200 rounded-sm bg-white shadow-xs overflow-hidden">
									<div className="h-0.5" style={{ backgroundColor: accent }} />
									<div className="p-4">
										<div className="flex items-center gap-1.5 text-gray-400 mb-2">{icon}<span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div>
										<div className="text-2xl font-black text-primary">{value.toLocaleString()}</div>
										<div className="mt-1.5 text-[10px] text-gray-400 font-medium">{sub}</div>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* SYSTEM MATCHING RESULTS */}
					<div className="space-y-3 pt-1">
						<h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-2">
							<span aria-hidden>✓</span> System Matching Results
						</h4>
						<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
							{[
								{ icon: <Sparkles   size={12} className="text-emerald-500" />, label: "Identified Matches",         value: dm.identified       ?? 0, sub: "Customer name or invoice number found",       accent: "#10b981" },
								{ icon: <HelpCircle size={12} className="text-red-400"     />, label: "Unidentified (Blocked)",     value: g.unidentified      ?? 0, sub: "No matching customer name or invoice number", accent: "#e11d48" },
								{ icon: <Calendar   size={12} className="text-amber-500"   />, label: "Needs Remittance Follow-Up", value: g.needs_remittance  ?? 0, sub: "Variance: amount, date, invoice mapping, etc", accent: "#f59e0b" },
								{ icon: <Sparkles   size={12} className="text-emerald-500" />, label: "Ready for Approval",         value: g.ready_for_oracle  ?? 0, sub: "Exact match, one-click post to Oracle",       accent: "#10b981" },
							].map(({ icon, label, value, sub, accent }) => (
								<div key={label} className="border border-gray-200 rounded-sm bg-white shadow-xs overflow-hidden">
									<div className="h-0.5" style={{ backgroundColor: accent }} />
									<div className="p-3.5">
										<div className="flex items-center gap-1.5 text-gray-400 mb-2">{icon}<span className="text-[9px] font-bold uppercase tracking-wider">{label}</span></div>
										<div className="text-xl font-black text-primary">{value.toLocaleString()}</div>
										<div className="mt-1 text-[10px] text-gray-400 font-medium">{sub}</div>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* EXCEPTIONS & CONFLICTS */}
					<div className="space-y-3 pt-1">
						<h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-2">
							<span aria-hidden>⚠️</span> Exceptions &amp; Conflicts
						</h4>
						<div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
							{[
								{ icon: <AlertTriangle size={12} className="text-red-500"  />, label: "Conflict / Exception", value: g.conflict_exception ?? 0, sub: "Mismatch on customer/invoice/amount/OU", accent: "#dc2626" },
								{ icon: <Ban           size={12} className="text-gray-400" />, label: "Rejected",             value: g.rejected            ?? 0, sub: "Rejected by system or SPOC",             accent: "#6b7280" },
								{ icon: <Ban           size={12} className="text-gray-400" />, label: "Post Failed",          value: g.post_failed         ?? 0, sub: "Approved but Oracle post errored",        accent: "#6b7280" },
							].map(({ icon, label, value, sub, accent }) => (
								<div key={label} className="border border-gray-200 rounded-sm bg-white shadow-xs overflow-hidden">
									<div className="h-0.5" style={{ backgroundColor: accent }} />
									<div className="p-3.5">
										<div className="flex items-center gap-1.5 text-gray-400 mb-2">{icon}<span className="text-[9px] font-bold uppercase tracking-wider">{label}</span></div>
										<div className="text-xl font-black text-primary">{value.toLocaleString()}</div>
										<div className="mt-1 text-[10px] text-gray-400 font-medium">{sub}</div>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* COMPLETED */}
					<div className="space-y-3 pt-1">
						<h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-2">
							<span aria-hidden>✅</span> Completed
						</h4>
						<div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
							{[
								{ icon: <ClipboardCheck size={12} className="text-emerald-600" />, label: "Invoice Mapped", value: g.processed ?? 0, sub: "Approved and invoice-mapped in Oracle AR", accent: "#1E3A5F" },
							].map(({ icon, label, value, sub, accent }) => (
								<div key={label} className="border border-gray-200 rounded-sm bg-white shadow-xs overflow-hidden">
									<div className="h-0.5" style={{ backgroundColor: accent }} />
									<div className="p-4">
										<div className="flex items-center gap-1.5 text-gray-400 mb-2">{icon}<span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div>
										<div className="text-2xl font-black text-primary">{value.toLocaleString()}</div>
										<div className="mt-1.5 text-[10px] text-gray-400 font-medium">{sub}</div>
									</div>
								</div>
							))}
						</div>
					</div>

					<hr className="border-gray-200" />

					{/* Pie Chart */}
					<div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2">
						<div className="lg:col-span-5 space-y-4">
							<div>
								<h4 className="text-xs font-black text-primary uppercase tracking-wider">
									Select Metrics to Display
								</h4>
								<p className="text-[11px] text-gray-500 mt-0.5">
									Toggle variables to alter chart distribution.
								</p>
							</div>
							<div className="flex flex-wrap gap-2 pt-1">
								{(
									Object.keys(METRIC_CONFIG) as Array<
										keyof typeof METRIC_CONFIG
									>
								).map((key) => {
									const cfg = METRIC_CONFIG[key];
									const active = activeMetrics[key];
									const val = g[METRIC_GROUP_KEY[key]] ?? 0;
									return (
										<button
											key={key}
											type="button"
											onClick={() =>
												setActiveMetrics((prev) => ({
													...prev,
													[key]: !prev[key],
												}))
											}
											className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-bold transition-all shadow-xs cursor-pointer ${active ? "text-primary" : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"}`}
											style={{ borderColor: active ? cfg.color : "" }}
										>
											<span
												className="w-2 h-2 rounded-full shrink-0"
												style={{
													backgroundColor: active ? cfg.color : "#d1d5db",
												}}
											/>
											<span>{cfg.name}</span>
											<span
												className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${active ? "text-white" : "bg-gray-100 text-gray-400"}`}
												style={{ backgroundColor: active ? cfg.color : "" }}
											>
												{val.toLocaleString()}
											</span>
										</button>
									);
								})}
							</div>
						</div>

						<div className="lg:col-span-7 border border-gray-200 p-5 rounded-sm bg-gray-50/10 flex flex-col items-center justify-center min-h-[340px]">
							<div className="w-full text-left mb-4 flex items-center gap-2">
								<PieIcon size={14} className="text-accent" />
								<span className="text-xs font-bold text-primary uppercase tracking-wider">
									Proportional Distribution Share
								</span>
							</div>
							{pieData.length > 0 ? (
								<div className="w-full h-[240px]">
									<ResponsiveContainer width="100%" height="100%">
										<PieChart>
											<Pie
												data={pieData}
												cx="50%"
												cy="48%"
												innerRadius={60}
												outerRadius={90}
												paddingAngle={3}
												dataKey="value"
											>
												{pieData.map((entry, i) => (
													<Cell key={i} fill={entry.color} />
												))}
											</Pie>
											<Tooltip
												contentStyle={{
													backgroundColor: "#1E3A5F",
													borderColor: "#172e4c",
													borderRadius: "2px",
												}}
												itemStyle={{ color: "#fff", fontSize: "12px" }}
											/>
											<Legend
												verticalAlign="bottom"
												align="center"
												iconType="rect"
												iconSize={10}
												wrapperStyle={{
													fontSize: "11px",
													fontWeight: 600,
													paddingTop: "10px",
												}}
											/>
										</PieChart>
									</ResponsiveContainer>
								</div>
							) : (
								<div className="text-xs text-gray-400 font-medium text-center py-12">
									No active metrics selected.
								</div>
							)}
						</div>
					</div>

					<hr className="border-gray-200" />

					{/* AI Run Details */}
					<div className="space-y-4 pt-1">
						<div className="flex items-start justify-between">
							<div>
								<h4 className="text-xs font-black text-primary uppercase tracking-wider">
									AI Run Details
								</h4>
								<p className="text-[11px] text-gray-500 mt-0.5">
									Layer 2B AI extraction token consumption and cost{aiUsage && aiUsage.call_count === 0 ? " — no AI fallback calls needed for this scope (Layer 2A regex resolved everything)" : ""}.
								</p>
							</div>
							<div className="flex items-center gap-3 shrink-0">
								<button
									onClick={() =>
										downloadAiUsageCsv(aiScope.runId, aiScope.dateFrom, aiScope.dateTo)
											.then(() => showSuccess("AI usage CSV downloaded."))
											.catch(() => setError("Failed to download AI usage CSV."))
									}
									className="text-[11px] font-medium text-gray-400 hover:text-primary cursor-pointer"
								>
									Download CSV
								</button>
								<button
									onClick={() => setAiPanelVisible((v) => !v)}
									className="text-[11px] font-medium text-gray-400 hover:text-primary cursor-pointer"
								>
									{aiPanelVisible ? "Hide" : "Show"}
								</button>
							</div>
						</div>
						{aiPanelVisible && (
							<div className="space-y-5">
								<div className="grid grid-cols-2 sm:grid-cols-3 gap-y-5 gap-x-6">
									{[
										["Model", aiUsage?.model ?? "—"],
										["AI Calls", (aiUsage?.call_count ?? 0).toLocaleString()],
										["Tokens In", (aiUsage?.total_input_tokens ?? 0).toLocaleString()],
										["Tokens Out", (aiUsage?.total_output_tokens ?? 0).toLocaleString()],
										["Estimated Cost", `$${(aiUsage?.total_cost_usd ?? 0).toFixed(4)}`],
										["Avg Latency", aiUsage?.avg_latency_ms != null ? `${(aiUsage.avg_latency_ms / 1000).toFixed(1)} sec` : "—"],
									].map(([label, value]) => (
										<div key={label} className="space-y-0.5">
											<span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
												{label}
											</span>
											<span
												className={`text-xs font-bold ${label === "Estimated Cost" ? "text-emerald-600" : "text-primary"}`}
											>
												{value}
											</span>
										</div>
									))}
								</div>

								{/* Per-model breakdown */}
								{aiUsage && aiUsage.by_model.length > 0 && (
									<div className="space-y-2">
										<span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
											By Model
										</span>
										<div className="space-y-1">
											{aiUsage.by_model.map((m) => (
												<div key={m.model} className="flex items-center justify-between text-[11px] gap-4">
													<span className="font-medium text-primary truncate">{m.model}</span>
													<span className="text-gray-500 shrink-0">
														{m.call_count.toLocaleString()} calls · {(m.input_tokens + m.output_tokens).toLocaleString()} tok · <span className="text-emerald-600 font-bold">${m.cost_usd.toFixed(4)}</span>
													</span>
												</div>
											))}
										</div>
									</div>
								)}

								{/* Global totals — independent of the scope above */}
								{aiTotals && (
									<div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-3 border-t border-gray-100">
										{[
											["This Month", aiTotals.month_cost_usd, aiTotals.month_tokens],
											["All Time", aiTotals.all_time_cost_usd, aiTotals.all_time_tokens],
										].map(([label, cost, tokens]) => (
											<div key={label as string} className="space-y-0.5">
												<span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
													{label}
												</span>
												<span className="text-xs font-bold text-primary">
													<span className="text-emerald-600">${(cost as number).toFixed(4)}</span>
													<span className="text-gray-400 font-medium"> · {(tokens as number).toLocaleString()} tok</span>
												</span>
											</div>
										))}
									</div>
								)}
							</div>
						)}
					</div>
				</div>

				{/* AMOUNT VIEW — USD */}
				<div className="bg-white border border-gray-200 p-6 shadow-xs space-y-6">
					<div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-gray-100">
						<div>
							<h2 className="text-xs font-black text-primary uppercase tracking-wider">
								Amount View{" "}
								<span className="ml-2 text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-xs">USD</span>
							</h2>
							<p className="text-[11px] text-gray-500 mt-0.5">
								Total credited amounts converted to USD.
							</p>
						</div>
						<div className="text-right shrink-0">
							<div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total</div>
							<div className="text-lg font-black text-primary">{fmtUsd(metrics?.total_usd_amount ?? 0)}</div>
						</div>
					</div>

					{/* Amount KPI Cards — grouped and named to match the count section above */}
					<div className="space-y-6">
						{/* Inbound Transactions */}
						<div className="space-y-3">
							<h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-2">
								<span aria-hidden>📊</span> Inbound Transactions
							</h4>
							<div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
								{[
									{ icon: <Layers size={12} className="text-[#1E3A5F]" />, label: "Total Amount Ingested", value: metrics?.total_usd_amount ?? 0, sub: "All credited amounts, converted to USD", accent: "#1E3A5F" },
								].map(({ icon, label, value, sub, accent }) => (
									<div key={label} className="border border-gray-200 rounded-sm bg-white shadow-xs overflow-hidden">
										<div className="h-0.5" style={{ backgroundColor: accent }} />
										<div className="p-4">
											<div className="flex items-center gap-1.5 text-gray-400 mb-2">{icon}<span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div>
											<div className="text-lg font-black text-primary">{fmtUsd(value)}</div>
											<div className="mt-1.5 text-[10px] text-gray-400 font-medium">{sub}</div>
										</div>
									</div>
								))}
							</div>
						</div>

						{/* System Matching Results */}
						<div className="space-y-3">
							<h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-2">
								<span aria-hidden>✓</span> System Matching Results
							</h4>
							<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
								{[
									{ icon: <Sparkles   size={12} className="text-emerald-500" />, label: "Identified Matches",         value: Math.max((metrics?.total_usd_amount ?? 0) - (ga.unidentified ?? 0), 0), sub: "Customer name or invoice number found",       accent: "#10b981" },
									{ icon: <HelpCircle size={12} className="text-red-400"     />, label: "Unidentified (Blocked)",     value: ga.unidentified,     sub: "No matching customer name or invoice number", accent: "#e11d48" },
									{ icon: <Calendar   size={12} className="text-amber-500"   />, label: "Needs Remittance Follow-Up", value: ga.needs_remittance, sub: "Variance: amount, date, invoice mapping, etc", accent: "#f59e0b" },
									{ icon: <Sparkles   size={12} className="text-emerald-500" />, label: "Ready for Approval",         value: ga.ready_for_oracle, sub: "Exact match, one-click post to Oracle",       accent: "#10b981" },
								].map(({ icon, label, value, sub, accent }) => (
									<div key={label} className="border border-gray-200 rounded-sm bg-white shadow-xs overflow-hidden">
										<div className="h-0.5" style={{ backgroundColor: accent }} />
										<div className="p-3.5">
											<div className="flex items-center gap-1.5 text-gray-400 mb-2">{icon}<span className="text-[9px] font-bold uppercase tracking-wider">{label}</span></div>
											<div className="text-sm font-black text-primary leading-tight">{fmtUsd(value)}</div>
											<div className="mt-1 text-[10px] text-gray-400 font-medium">{sub}</div>
										</div>
									</div>
								))}
							</div>
						</div>

						{/* Exceptions & Conflicts */}
						<div className="space-y-3">
							<h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-2">
								<span aria-hidden>⚠️</span> Exceptions &amp; Conflicts
							</h4>
							<div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
								{[
									{ icon: <AlertTriangle size={12} className="text-red-500"  />, label: "Conflict / Exception", value: ga.conflict_exception, sub: "Mismatch on customer/invoice/amount/OU", accent: "#dc2626" },
									{ icon: <Ban           size={12} className="text-gray-400" />, label: "Rejected",             value: ga.rejected,           sub: "Rejected by system or SPOC",             accent: "#6b7280" },
									{ icon: <Ban           size={12} className="text-gray-400" />, label: "Post Failed",          value: ga.post_failed,        sub: "Approved but Oracle post errored",        accent: "#6b7280" },
								].map(({ icon, label, value, sub, accent }) => (
									<div key={label} className="border border-gray-200 rounded-sm bg-white shadow-xs overflow-hidden">
										<div className="h-0.5" style={{ backgroundColor: accent }} />
										<div className="p-3.5">
											<div className="flex items-center gap-1.5 text-gray-400 mb-2">{icon}<span className="text-[9px] font-bold uppercase tracking-wider">{label}</span></div>
											<div className="text-sm font-black text-primary leading-tight">{fmtUsd(value)}</div>
											<div className="mt-1 text-[10px] text-gray-400 font-medium">{sub}</div>
										</div>
									</div>
								))}
							</div>
						</div>

						{/* Completed */}
						<div className="space-y-3">
							<h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-2">
								<span aria-hidden>✅</span> Completed
							</h4>
							<div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
								{[
									{ icon: <ClipboardCheck size={12} className="text-emerald-600" />, label: "Invoice Mapped", value: ga.processed, sub: "Approved and invoice-mapped in Oracle AR", accent: "#1E3A5F" },
								].map(({ icon, label, value, sub, accent }) => (
									<div key={label} className="border border-gray-200 rounded-sm bg-white shadow-xs overflow-hidden">
										<div className="h-0.5" style={{ backgroundColor: accent }} />
										<div className="p-4">
											<div className="flex items-center gap-1.5 text-gray-400 mb-2">{icon}<span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div>
											<div className="text-lg font-black text-primary">{fmtUsd(value)}</div>
											<div className="mt-1.5 text-[10px] text-gray-400 font-medium">{sub}</div>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>

					<hr className="border-gray-200" />

					{/* Amount Pie Chart */}
					<div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2">
						<div className="lg:col-span-5 space-y-4">
							<div>
								<h4 className="text-xs font-black text-primary uppercase tracking-wider">Amount Distribution</h4>
								<p className="text-[11px] text-gray-500 mt-0.5">Toggle categories — same toggles as count chart above.</p>
							</div>
							<div className="flex flex-wrap gap-2 pt-1">
								{(Object.keys(METRIC_CONFIG) as Array<keyof typeof METRIC_CONFIG>).map((key) => {
									const cfg = METRIC_CONFIG[key];
									const active = activeMetrics[key];
									const val = ga[METRIC_GROUP_KEY[key]] ?? 0;
									return (
										<button
											key={key}
											type="button"
											onClick={() => setActiveMetrics((prev) => ({ ...prev, [key]: !prev[key] }))}
											className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-bold transition-all shadow-xs cursor-pointer ${active ? "text-primary" : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"}`}
											style={{ borderColor: active ? cfg.color : "" }}
										>
											<span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: active ? cfg.color : "#d1d5db" }} />
											<span>{cfg.name}</span>
											<span className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${active ? "text-white" : "bg-gray-100 text-gray-400"}`} style={{ backgroundColor: active ? cfg.color : "" }}>
												{fmtUsd(val)}
											</span>
										</button>
									);
								})}
							</div>
						</div>
						<div className="lg:col-span-7 border border-gray-200 p-5 rounded-sm bg-gray-50/10 flex flex-col items-center justify-center min-h-[340px]">
							<div className="w-full text-left mb-4 flex items-center gap-2">
								<PieIcon size={14} className="text-accent" />
								<span className="text-xs font-bold text-primary uppercase tracking-wider">Amount Distribution (USD)</span>
							</div>
							{amountPieData.length > 0 ? (
								<div className="w-full h-[240px]">
									<ResponsiveContainer width="100%" height="100%">
										<PieChart>
											<Pie data={amountPieData} cx="50%" cy="48%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
												{amountPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
											</Pie>
											<Tooltip
												formatter={(value: number) => fmtUsd(value)}
												contentStyle={{ backgroundColor: "#1E3A5F", borderColor: "#172e4c", borderRadius: "2px" }}
												itemStyle={{ color: "#fff", fontSize: "12px" }}
											/>
											<Legend verticalAlign="bottom" align="center" iconType="rect" iconSize={10} wrapperStyle={{ fontSize: "11px", fontWeight: 600, paddingTop: "10px" }} />
										</PieChart>
									</ResponsiveContainer>
								</div>
							) : (
								<div className="text-xs text-gray-400 font-medium text-center py-12">No active categories selected.</div>
							)}
						</div>
					</div>
				</div>

				{/* Config Resolve Dialog */}
				{resolveState && (
					<ConfigResolveDialog
						filename={resolveState.filename}
						candidates={resolveState.candidates}
						mode={resolveState.mode}
						onClose={() => setResolveState(null)}
						onBuildNew={() => {
							const fn = resolveState.filename;
							setResolveState(null);
						setWizardFile(fn);
						}}
					/>
				)}

				{/* Config Builder Wizard */}
				{wizardFile && (
					<ConfigBuilderWizard
						filename={wizardFile}
						onClose={() => setWizardFile(null)}
						onSaved={(configKey) => {
							const fn = wizardFile;
							setWizardFile(null);
							setDetectionInfo((prev) => ({
								...prev,
								[fn]: { config_key: configKey, warning: null, ambiguous: false },
							}));
							showSuccess(`Config '${configKey}' saved! Re-upload the file to use the new config.`);
						}}
					/>
				)}
			</div>
		);
}