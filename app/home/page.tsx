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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type AiUsageSummary,
  type AiUsageTotals,
} from "@/lib/ai-usage/api";
import ConfigBuilderWizard from "@/components/ConfigBuilderWizard";
import ConfigResolveDialog from "@/components/ConfigResolveDialog";

import WelcomeHero from "./components/WelcomeHero";
import StatusBanners from "./components/StatusBanners";
import AgingReportCard from "./components/AgingReportCard";
import AccountStatementsCard from "./components/AccountStatementsCard";
import RunControlBar from "./components/RunControlBar";
import DashboardMetricsCard from "./components/DashboardMetricsCard";
import AmountViewCard from "./components/AmountViewCard";

import {
  type ConfigCandidate, type FileInfo, type AccountGroup, type Metrics, type MetricKey,
  METRIC_CONFIG, METRIC_GROUP_KEY,
} from "./types";

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
  // Mount-only: doFetchMetrics's identity changes with the Bank/BU/User
  // filters (see its useCallback deps), which would otherwise re-fire this
  // effect on every filter change and race the dedicated filter effect below
  // with a stale "Last Analysis" fetch, intermittently clobbering it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Reconcile the file / account lists with the backend when the tab regains
  // focus. pollIngestStatus only updates a file's badge during its ~2-minute
  // window, then stops — and fetchFiles otherwise runs only on mount / after a
  // run. So if a file's real status later changed (e.g. it was re-ingested to
  // "ready" after its config was added, or a run consumed its rows) while this
  // tab sat idle, the badge would show a stale status — including a stale
  // "Error" on a file that is actually ready — until a manual reload. Re-syncing
  // on focus lets the UI self-heal to the backend's truth automatically.
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === "hidden") return;
      if (runStatus.status === "running") return; // the run poller already refreshes
      fetchFiles();
      fetchPendingByAccount();
    };
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", resync);
    return () => {
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [fetchFiles, fetchPendingByAccount, runStatus.status]);

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

      if (data.restored || data.retried) {
        // PATCH (restored): the file you just uploaded matches one that
        // was previously removed (✕) — the backend un-archived it instead
        // of permanently blocking it as a duplicate (which used to leave
        // it stuck: blocked from re-upload, yet invisible in this list
        // either way, since that list filters out archived files).
        //
        // PATCH (retried): the file matches one whose ONLY prior ingestion
        // attempt errored (typically: no config existed yet). The backend
        // now retries instead of flatly rejecting it as a duplicate, since
        // a config may exist now.
        //
        // BUGFIX: both cases used to `return` immediately after the
        // success toast, before ever calling pollIngestStatus() below — so
        // even though the backend actually re-runs ingest_and_parse for
        // these files (the route defers ingest_statement_task whenever
        // duplicate === false), the UI never reflected it finishing. The
        // file would just sit showing its last-known ingest_status
        // ("processing"/"error") until the user manually refreshed the
        // page. Now polls the same as a brand-new upload.
        await fetchFiles();
        await fetchPendingByAccount();
        showSuccess(
          data.message ||
            (data.restored
              ? `"${file.name}" restored to your Account Statements list.`
              : `"${file.name}" previously failed to process — retrying now.`)
        );
        if (data.source_file_id) pollIngestStatus(data.source_file_id, file.name);
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
				<WelcomeHero userDisplayName={userDisplayName} />

				<StatusBanners
					error={error} setError={setError}
					duplicateUploadInfo={duplicateUploadInfo} setDuplicateUploadInfo={setDuplicateUploadInfo}
					successMessage={successMessage} setSuccessMessage={setSuccessMessage} successTimerRef={successTimerRef}
					runCompletionSummary={runCompletionSummary} setRunCompletionSummary={setRunCompletionSummary}
				/>

				{/* UPLOADS */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<AgingReportCard
						agingStatus={agingStatus}
						agingHistory={agingHistory}
						agingSwitching={agingSwitching}
						onSelectAgingSource={handleSelectAgingSource}
					/>
					<AccountStatementsCard
						statementInputRef={statementInputRef}
						onStatementUpload={handleStatementUpload}
						statementUploading={statementUploading}
						accountGroups={accountGroups}
						isAccountSelected={isAccountSelected}
						toggleAccountSelected={toggleAccountSelected}
						detectionInfo={detectionInfo}
						onOpenResolveForFile={openResolveForFile}
						onOpenWizardForFile={setWizardFile}
						onRemoveFile={handleRemoveFile}
					/>
				</div>

				{/* CONTROL BAR CARD */}
				<RunControlBar
					isRunning={isRunning}
					loading={loading}
					filesAlreadyAnalyzed={filesAlreadyAnalyzed}
					agingStatus={agingStatus}
					files={files}
					accountGroups={accountGroups}
					isAccountSelected={isAccountSelected}
					elapsedSeconds={elapsedSeconds}
					fmtElapsed={fmtElapsed}
					onStart={handleStart}
				/>

				{/* DASHBOARD METRICS */}
				<DashboardMetricsCard
					timePeriod={timePeriod} setTimePeriod={setTimePeriod}
					isCustomDateActive={isCustomDateActive} setIsCustomDateActive={setIsCustomDateActive}
					customStartDate={customStartDate} setCustomStartDate={setCustomStartDate}
					customEndDate={customEndDate} setCustomEndDate={setCustomEndDate}
					doFetchMetrics={doFetchMetrics}
					bankOptions={bankOptions} buOptions={buOptions} userOptions={userOptions}
					selectedBank={selectedBank} setSelectedBank={setSelectedBank}
					selectedBU={selectedBU} setSelectedBU={setSelectedBU}
					selectedUser={selectedUser} setSelectedUser={setSelectedUser}
					totalStatements={metrics?.total_statements ?? 0}
					dm={dm}
					g={g}
					pieData={pieData}
					activeMetrics={activeMetrics}
					setActiveMetrics={setActiveMetrics}
					aiUsage={aiUsage} aiTotals={aiTotals}
					aiPanelVisible={aiPanelVisible} setAiPanelVisible={setAiPanelVisible}
					aiScope={aiScope} showSuccess={showSuccess} setError={setError}
				/>

				{/* AMOUNT VIEW - USD */}
				<AmountViewCard
					totalUsdAmount={metrics?.total_usd_amount ?? 0}
					ga={ga}
					amountPieData={amountPieData}
					activeMetrics={activeMetrics}
					setActiveMetrics={setActiveMetrics}
					fmtUsd={fmtUsd}
				/>

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
