"use client";
/**
 * Home — /app/home/page.tsx
 *
 * Trimmed to three things: Welcome, the Aging Report + Account Statements
 * upload cards, and the Run Analysis control bar. Metrics, the category pie
 * charts, and AI usage — previously all embedded here — now live on their
 * own pages: /overview and /ai-usage.
 *
 *   - FIX (kept from an earlier revision): handleRemoveFile() used to
 *     swallow every error from deleteFile() in a bare `catch {}` — clicking
 *     the ✕ on a statement row would silently do nothing at all if the
 *     DELETE call failed (permission error, network issue, backend
 *     exception), with zero feedback. It now surfaces the real error via
 *     setError() (same pattern as every other handler in this file) and
 *     shows a success toast on the happy path, matching
 *     handleStatementUpload's shape.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {deleteFile,
  getAgingHistory, getAgingStatus, getFiles, getIngestStatus, getRunHistory,
  getPendingByAccount, getMe, getRunPreflight,
  getStatus, reingestStatement, selectAgingSource, startRun,
  uploadStatement,
} from "@/lib/api";
import { isViewerRoles } from "@/lib/permissions";
import { detectForFile } from "@/lib/configBuilderApi";
import { getErrorMessage } from "@/lib/errorMessage";
import ConfigBuilderWizard from "@/components/ConfigBuilderWizard";
import AiStatusBadge from "./components/AiStatusBadge";
import ConfigResolveDialog from "@/components/ConfigResolveDialog";

import WelcomeHero from "./components/WelcomeHero";
import StatusBanners from "./components/StatusBanners";
import AgingReportCard from "./components/AgingReportCard";
import AccountStatementsCard from "./components/AccountStatementsCard";
import RunControlBar from "./components/RunControlBar";
import ConfirmRunDialog from "./components/ConfirmRunDialog";

import {
  type ConfigCandidate, type FileInfo, type AccountGroup, type StatementGroup,
  type RunPreflight,
  isAccountRunnable,
} from "./types";
import { formatGreetingName } from "@/lib/formatName";

export default function Dashboard() {
  const router = useRouter();
  const [files, setFiles]             = useState<FileInfo[]>([]);
  // PATCH: account-level pending counts + which accounts are checked to be
  // included in the next run. Keyed by String(bank_account_id), or
  // "unresolved" for files whose account couldn't be determined at ingest.
  const [pendingByAccount, setPendingByAccount] = useState<Record<string, { account_number: string | null; bank_name: string; business_unit: string; ou_number: string; pending_row_count: number; last_consumed_run_id?: number | null; filenames: string[] }>>({});
  // PATCH: tracks accounts the user has explicitly UNCHECKED (opt-out model).
  // Anything not in this set is included by default — including an account
  // that's never been seen before (e.g. just uploaded) — without needing to
  // separately track "have we seen this key already" to tell "new account"
  // apart from "user unchecked this one earlier".
  const [deselectedAccountKeys, setDeselectedAccountKeys] = useState<Set<string>>(new Set());
  const [runStatus, setRunStatus]     = useState({ status: "idle", message: "", progress_current: 0, started_at: null as string | null });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const runStartedLocalRef = useRef<number | null>(null); // wall-clock ms when THIS browser session first saw "running"
  const [agingStatus, setAgingStatus] = useState({ loaded: false, row_count: 0, filename: null });
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  // Distinct from `error` — this one drives its own unmissable banner (see
  // the top of the render), not the generic dismissible error list, so
  // "the backend itself is down" is never just one line among several.
  const [backendUnreachable, setBackendUnreachable] = useState(false);

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
    owned_by_current_user: boolean;
  } | null>(null);

  // Detection results per file + wizard/resolve state
  const [detectionInfo, setDetectionInfo] = useState<Record<string, { config_key: string | null; warning: string | null; ambiguous?: boolean }>>({});
  const [wizardFile, setWizardFile]       = useState<string | null>(null);
  const [resolveState, setResolveState]   = useState<{ filename: string; candidates: ConfigCandidate[]; mode: "ambiguous" | "reconfigure" } | null>(null);

  const [userDisplayName, setUserDisplayName] = useState("Admin User");
  // Viewer holds no permissions at all -- this page renders ONLY the
  // Welcome hero for them (see the early return near the bottom of this
  // component) and skips every data-fetching effect below, so a Viewer
  // never triggers the now-guarded (run:view) backend calls this page
  // otherwise makes on mount.
  const [isViewer, setIsViewer] = useState(false);
  const [successMessage, setSuccessMessage]   = useState("");
  // Persistent (no auto-dismiss) notice for "needs configuration" uploads —
  // separate from the success toast queue below, which is for transient
  // confirmations and disappears after SUCCESS_MS. This is actionable and
  // should stay visible until the person dismisses it or resolves it.
  // Persistent (no auto-dismiss) confirmation for restore/retry — these used
  // to be transient success toasts, which is why they were "disappearing in
  // seconds"; this is informational and worth leaving up until dismissed.
  const [uploadNotice, setUploadNotice] = useState("");
  const [configNeededNotice, setConfigNeededNotice] = useState("");

  // PATCH: completion banner now reports the new taxonomy too.
  const [runCompletionSummary, setRunCompletionSummary] = useState<{
    totalRows: number; identified: number; unidentified: number; readyForOracle: number;
  } | null>(null);
  const prevRunStatus = useRef<string>("idle");

  // PATCH: filenames that were part of the most recently COMPLETED run.
  // Used to stop the control bar from inviting an immediate re-run against
  // the exact same statement(s) — see filesAlreadyAnalyzed below.
  const [lastRunFiles, setLastRunFiles] = useState<string[]>([]);
  const [lastRunId, setLastRunId] = useState<number | null>(null);
  // Confirm-before-run: populated by handleStart() once validation passes,
  // so the person reviews the FULL run context before it actually starts --
  // see ConfirmRunDialog. The real POST /run/start only fires from
  // confirmAndStartRun(), never directly from handleStart().
  //
  // Only the filenames are held here. Everything the dialog shows comes from
  // GET /api/run/preflight, fetched fresh when the dialog opens: the backend
  // re-derives the accounts from these filenames and resolves the settings
  // that will actually shape the run (functional currency, credit rule, aging
  // report, AI state, settlement identifiers, tolerances) plus its own
  // blockers/warnings. Deliberately NOT the locally-built AccountGroup[] --
  // an analysis run can't be undone, so the review has to reflect server
  // state at confirm time, not a page-load snapshot that may since have gone
  // stale (another user's run, a Business Unit reassignment, aging report
  // swapped out).
  const [confirmRun, setConfirmRun] = useState<{ filenames: string[] } | null>(null);
  const [preflight, setPreflight] = useState<RunPreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState("");

  // Fetch (or re-fetch, via the dialog's Retry) the preflight review. On
  // failure the dialog shows the error and keeps Start disabled -- failing
  // closed, since starting an irreversible run on an unverified picture is
  // exactly the mistake this dialog exists to prevent.
  const loadPreflight = useCallback(async (filenames: string[]) => {
    setPreflightLoading(true);
    setPreflightError("");
    try {
      const res = await getRunPreflight(filenames);
      setPreflight(res.data);
    } catch (e: any) {
      setPreflight(null);
      setPreflightError(getErrorMessage(e, "the check could not be completed."));
    }
    setPreflightLoading(false);
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await getFiles();
      setFiles(res.data.files);
      // Self-heal: this specific message is a pure connectivity signal, not
      // an action result — once a fetch succeeds again, the backend is
      // reachable, so clear it automatically instead of waiting for a
      // manual dismiss. Every other error message stays as manual-dismiss
      // only (see StatusBanners) — this is a deliberate one-off exception.
      setError((prev) => (prev === "Could not connect to backend system." ? "" : prev));
      setBackendUnreachable(false);
    } catch (e: any) {
      setError("Could not connect to backend system.");
      // e.response is only present when a response actually came back (any
      // status code) — its total absence means the request never completed
      // at all (server down, wrong port, CORS block, etc.), which is a
      // different, more fundamental problem than an ordinary error reply.
      // That distinction drives the dedicated banner below, so "nothing is
      // loading because the backend itself is unreachable" never looks the
      // same as an empty/not-yet-configured state on this page.
      if (!e?.response) setBackendUnreachable(true);
    }
  }, []);

  const fetchPendingByAccount = useCallback(async () => {
    try {
      const res = await getPendingByAccount();
      const accounts: any[] = res.data.accounts || [];
      const byKey: Record<string, { account_number: string | null; bank_name: string; business_unit: string; ou_number: string; pending_row_count: number; last_consumed_run_id?: number | null; filenames: string[] }> = {};
      accounts.forEach((a) => {
        const key = a.bank_account_id != null ? String(a.bank_account_id) : "unresolved";
        byKey[key] = {
          account_number: a.account_number, bank_name: a.bank_name,
          // BU/OU resolved from the account's CURRENT OU mapping (backend
          // /pending-by-account), not the per-file snapshot — see accountGroups.
          business_unit: a.business_unit ?? "", ou_number: a.ou_number ?? "",
          pending_row_count: a.pending_row_count, last_consumed_run_id: a.last_consumed_run_id ?? null,
          // Which statement files hold rows for THIS account. One statement can
          // appear under several accounts (a multi-account column), which is why
          // accountGroups is built from this endpoint rather than from the file
          // list — a file carries only its primary account.
          filenames: (a.files || []).map((fi: any) => fi.filename),
        };
      });
      setPendingByAccount(byKey);
      // Nothing else to do here — deselectedAccountKeys is opt-out, so any
      // account not explicitly unchecked (new or old) stays included.
    } catch {
      // non-fatal — falls back to "everything included" behavior below
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res       = await getStatus();
      const newStatus = res.data.status;
      setRunStatus(res.data);

      if (newStatus === "completed" && prevRunStatus.current !== "completed") {
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
            setLastRunId(latest.run_id ?? null);
          }
        } catch {}
      }
      if (newStatus === "error" && prevRunStatus.current !== "error") {
        setError(res.data.message || "Analysis run failed.");
      }
      prevRunStatus.current = newStatus;
    } catch {}
  }, []);

  const fetchAgingHistory = useCallback(async () => {
    try {
      const res = await getAgingHistory();
      setAgingHistory(res.data.items || []);
      setBackendUnreachable(false);
    } catch (e: any) {
      setError((prev) => prev || getErrorMessage(e, "Could not load aging report history."));
      if (!e?.response) setBackendUnreachable(true);
    }
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
      setError(getErrorMessage(e, "Failed to load that aging snapshot."));
    }
    setAgingSwitching(false);
  };

  // BUGFIX: this used to only ever be populated as a side effect of
  // doFetchMetrics() (which fetched it alongside /results/metrics). When
  // metrics moved to the Overview page, doFetchMetrics — and this call
  // along with it — was removed from Home entirely, with nothing put back
  // to fetch it standalone. Home never called GET /api/config/aging-status
  // again after that, so `agingStatus` stayed stuck at its default
  // ({ loaded: false, ... }) on every page load, showing "Not Loaded" even
  // when the backend had an active aging snapshot the whole time.
  const fetchAgingStatus = useCallback(async () => {
    try {
      const res = await getAgingStatus();
      setAgingStatus(res.data);
      setBackendUnreachable(false);
    } catch (e: any) {
      // Surfaced (not silent) — a real failure here must never look
      // identical to "no aging file loaded yet", which is what a silent
      // catch produced: the same "Not Loaded" empty-state either way, with
      // zero signal to tell the two apart.
      setError((prev) => prev || getErrorMessage(e, "Could not load aging report status."));
      if (!e?.response) setBackendUnreachable(true);
    }
  }, []);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|; )login_user_email_stub=([^;]*)/);
    if (match?.[1]) setUserDisplayName(formatGreetingName(decodeURIComponent(match[1]).split("@")[0]));

    (async () => {
      // Resolve the role FIRST -- a Viewer holds no permissions at all, so
      // every one of the calls below (all now gated on "run:view" or
      // similar server-side) would just 403. This page renders only the
      // Welcome hero for a Viewer (see the early return further down).
      let viewer = false;
      try {
        const me = await getMe();
        // Prefer the authoritative display_name from /auth/me over the
        // email-cookie fallback set above. Guarded so a missing/blank/
        // non-string value never blanks out the greeting -- it just keeps
        // whatever the cookie/default already produced.
        const dn = me.data?.display_name;
        if (typeof dn === "string" && dn.trim()) setUserDisplayName(formatGreetingName(dn.trim()));
        viewer = isViewerRoles(me.data?.roles ?? null);
      } catch {
        // 401 handled globally by lib/api.ts's interceptor; treat unknown
        // role as non-viewer here so a transient /me failure doesn't hide
        // the whole dashboard behind a false Viewer gate.
      }
      setIsViewer(viewer);
      if (viewer) return;

      fetchFiles();
      fetchPendingByAccount();
      fetchAgingHistory();
      fetchAgingStatus();
      // PATCH: seed lastRunFiles from the most recent completed run so a page
      // refresh doesn't forget that these statements were already analyzed.
      try {
        const histRes = await getRunHistory(1, 1);
        const latest  = histRes.data.data?.[0];
        if (latest?.status === "completed") {
          setLastRunFiles(latest.selected_files ?? []);
          setLastRunId(latest.run_id ?? null);
        }
      } catch {}
    })();
  // Mount-only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (isViewer) return; // no permission to fetch these -- and nothing to show anyway
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
  }, [fetchFiles, fetchPendingByAccount, runStatus.status, isViewer]);

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

  // Success messages are QUEUED and now PERSISTENT — no auto-dismiss timer.
  // Previously each one auto-advanced after SUCCESS_MS, which is why these
  // were disappearing on their own. Now the current message stays up until
  // the person dismisses it (×), at which point the next queued one (if any)
  // takes its place. An identical message already showing or queued is
  // de-duplicated (so a repeated "…is ready…" can't spam the bar).
  const successQueueRef = useRef<string[]>([]);
  const currentSuccessRef = useRef<string>("");

  const advanceSuccessQueue = () => {
    const next = successQueueRef.current.shift();
    if (next === undefined) {
      setSuccessMessage("");
      currentSuccessRef.current = "";
      return;
    }
    setSuccessMessage(next);
    currentSuccessRef.current = next;
  };

  const showSuccess = (msg: string) => {
    if (!msg) return;
    // De-dupe: skip if it's the message on screen now or already waiting.
    if (msg === currentSuccessRef.current || successQueueRef.current.includes(msg)) return;
    successQueueRef.current.push(msg);
    if (!currentSuccessRef.current) advanceSuccessQueue(); // idle → show now
  };

  // PATCH: true when the currently-listed statement files are EXACTLY the
  // same set (regardless of order) as the ones the last completed run
  // already processed — i.e. nothing new has been uploaded since. Drives
  // the control bar so it doesn't say "Ready for analysis" (implying a
  // fresh, useful run) right after a completed run against the same files.
  // PATCH: group `files` by bank_account_id for the account-level checkbox
  // UI — the orchestrator consumes rows by account, not by file, so
  // selection has to happen at this granularity to match real behavior.
  // Built from /pending-by-account (the account-level endpoint), NOT by grouping
  // the file list. A statement whose account_locator is a COLUMN holds rows for
  // several accounts, but SourceFile.bank_account_id records only the primary —
  // so keying off the file list collapsed a 6-account statement into one group
  // and the run/confirm dialog counted only the primary account's rows (9 of 180).
  // The same file legitimately appears under every account it has rows for.
  const accountGroups: AccountGroup[] = useMemo(() => {
    const byName = new Map(files.map((f) => [f.filename, f]));
    const groups: AccountGroup[] = [];
    const represented = new Set<string>();

    for (const [key, meta] of Object.entries(pendingByAccount)) {
      const groupFiles = meta.filenames
        .map((n) => byName.get(n))
        .filter((f): f is FileInfo => !!f);
      if (groupFiles.length === 0) continue;   // account has no currently-listed file
      groupFiles.forEach((f) => represented.add(f.filename));
      groups.push({
        key,
        bank_account_id: key === "unresolved" ? null : Number(key),
        account_number: meta.account_number,
        bank_name: meta.bank_name,
        // BU/OU come from the account's CURRENT OU mapping, never the per-file
        // snapshot taken at upload time.
        business_unit: meta.business_unit,
        ou_number: meta.ou_number,
        files: groupFiles,
        pending_row_count: meta.pending_row_count,
        last_consumed_run_id: meta.last_consumed_run_id ?? null,
      });
    }

    // Safety net for files the account endpoint didn't cover (a failed/stale
    // fetch, or a file still being ingested). Without this a file could vanish
    // from the list entirely, taking its Configure / Add Accounts button with it.
    const leftovers = files.filter((f) => !represented.has(f.filename));
    const byKey = new Map<string, AccountGroup>();
    for (const f of leftovers) {
      const key = f.bank_account_id != null ? String(f.bank_account_id) : "unresolved";
      if (!byKey.has(key)) {
        byKey.set(key, {
          key, bank_account_id: f.bank_account_id ?? null,
          account_number: null, bank_name: f.bank_name,
          business_unit: f.business_unit, ou_number: f.ou_number,
          files: [], pending_row_count: 0, last_consumed_run_id: null,
        });
      }
      byKey.get(key)!.files.push(f);
    }
    return [...groups, ...byKey.values()];
  }, [files, pendingByAccount]);

  // One entry per uploaded STATEMENT, carrying the accounts its rows belong to.
  // accountGroups stays account-keyed (the run and the confirm dialog need that
  // granularity); this is the file-shaped view the Account Statements list needs
  // so a 6-account statement is listed once, not six times.
  const statementGroups: StatementGroup[] = useMemo(() => {
    const map = new Map<string, StatementGroup>();
    for (const f of files) {
      map.set(f.filename, {
        filename: f.filename, file: f, accounts: [], accountKeys: [],
        pending_row_count: 0,
      });
    }
    for (const g of accountGroups) {
      for (const f of g.files) {
        const s = map.get(f.filename);
        if (!s) continue;
        s.accounts.push(g);
        s.accountKeys.push(g.key);
        s.pending_row_count += g.pending_row_count;
      }
    }
    // Biggest account first — in a multi-account statement one account usually
    // dominates the row count, and that's the OU worth checking.
    map.forEach((s) => s.accounts.sort((a, b) => b.pending_row_count - a.pending_row_count));
    return Array.from(map.values());
  }, [files, accountGroups]);

  const isAccountSelected = (key: string) => !deselectedAccountKeys.has(key);
  // A statement is selected when its accounts are. They move together (a run
  // takes whole files), so this is one checkbox over all of them.
  const isStatementSelected = (s: StatementGroup) =>
    s.accountKeys.length === 0 ? true : s.accountKeys.every(isAccountSelected);
  const toggleStatementSelected = (s: StatementGroup) => {
    if (s.accountKeys.length === 0) return;
    const turningOff = isStatementSelected(s);
    setDeselectedAccountKeys((prev) => {
      const next = new Set(prev);
      if (turningOff) s.accountKeys.forEach((k) => next.add(k));
      else s.accountKeys.forEach((k) => next.delete(k));
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
    // PATCH 2: also require the account to be RUNNABLE (recognised + has
    // pending rows). An "Unknown"/errored statement would otherwise be sent
    // and produce a no-op run — see isAccountRunnable().
    const runnableSelected = accountGroups.filter(
      (g) => isAccountSelected(g.key) && isAccountRunnable(g),
    );
    if (runnableSelected.length === 0) {
      const unrunnableSelected = accountGroups.filter(
        (g) => isAccountSelected(g.key) && !isAccountRunnable(g),
      );
      const allDuplicates = unrunnableSelected.length > 0 &&
        unrunnableSelected.every((g) => g.bank_account_id != null && g.last_consumed_run_id != null);
      setError(
        allDuplicates
          ? "The selected statement(s) match transactions already processed in a previous run — " +
            "there's nothing new to analyze. See the Analysis History tab for that run."
          : "No analyzable statements selected. A statement must be recognised (its account " +
            "configured) and have pending rows. Configure any 'Unknown' statements from the " +
            "Config tab first.",
      );
      return;
    }
    // De-duplicated: one statement can appear under several accounts (a
    // multi-account column), and each occurrence is the same physical file.
    const selectedFilenames = Array.from(
      new Set(runnableSelected.flatMap((g) => g.files.map((f) => f.filename))));
    setError("");
    // PATCH: no longer starts the run directly here — opens the confirm
    // dialog instead (see ConfirmRunDialog) and kicks off the preflight
    // review of everything this run will do. The actual POST /run/start
    // only happens from confirmAndStartRun() below, once the person has
    // reviewed that and explicitly acknowledged it can't be undone.
    setPreflight(null);
    setConfirmRun({ filenames: selectedFilenames });
    loadPreflight(selectedFilenames);
  };

  const confirmAndStartRun = async () => {
    if (!confirmRun) return;
    // Belt-and-braces: the dialog already disables Start unless preflight
    // loaded cleanly and can_start is true. /run/start enforces the real
    // guards server-side regardless — this just makes the client incapable
    // of firing a request the review said was blocked.
    if (!preflight?.can_start) return;
    setRunCompletionSummary(null);
    setLoading(true);
    try {
      await startRun(confirmRun.filenames);
      prevRunStatus.current = "running";
      setConfirmRun(null);
      fetchStatus();
    } catch (e: any) {
      setConfirmRun(null);
      setError(getErrorMessage(e, "Failed to start analysis"));
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
        const { ingest_status, new_row_count, duplicate_row_count, ingest_error, pending_row_count } = res.data ?? {};
        setFiles((prev) =>
          prev.map((f) =>
            f.filename === filename
              ? { ...f, ingest_status, new_row_count, duplicate_row_count }
              : f
          )
        );
        if (ingest_status === "ready") {
          clearInterval(interval);
          // Two independent facts, stated plainly so "0 new rows" is never read
          // as "nothing to do":
          //   1. what ingestion did — added new rows, or found them all already
          //      present (a re-upload of a file whose rows were ingested before);
          //   2. whether it can be run now — keyed off pending rows, NOT new rows.
          const added = (new_row_count ?? 0) > 0
            ? `${new_row_count} new row(s) added`
            : `no new rows (all ${duplicate_row_count ?? 0} already ingested)`;
          const action = (pending_row_count ?? 0) > 0
            ? "ready to analyze"
            : "already analyzed — nothing new to run";
          showSuccess(`"${filename}" is ready — ${added}; ${action}.`);
          // Re-fetch the authoritative file list too: ingestion sets the file's
          // bank_account_id (null until now), so without this the file stays in
          // the "unresolved"/Unknown group even though it's ready. fetchFiles
          // regroups it under its real account so it becomes selectable/runnable.
          fetchFiles();
          fetchPendingByAccount();
        } else if (ingest_status === "error") {
          clearInterval(interval);
          setError(ingest_error || `Failed to process "${filename}".`);
        } else if (ingest_status === "unrecognized") {
          // Not a failure — no config matches this statement yet. Stop
          // polling (nothing will change until someone configures it), and
          // surface the persistent (non-auto-dismissing) notice — this is
          // the path a RETRIED upload of an already-unresolved file takes,
          // where the only other feedback so far was a transient toast.
          clearInterval(interval);
          setConfigNeededNotice(
            ingest_error || `"${filename}" still has no matching config — click Configure to set it up.`
          );
        }
      } catch {
        // transient — keep polling until attempts run out
      }
      if (attempts >= 60) clearInterval(interval);
    }, 2000);
  };

  const handleStatementUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setStatementUploading(true); setError(""); setDuplicateUploadInfo(null); setConfigNeededNotice(""); setUploadNotice("");
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
        setUploadNotice(
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
          owned_by_current_user: data.owned_by_current_user ?? false,
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
      if (ambiguous) {
        setResolveState({ filename: file.name, candidates: candidates ?? [], mode: "ambiguous" });
        setConfigNeededNotice(`"${file.name}" uploaded — multiple configs match. Choose the correct one.`);
      } else if (warning) {
        setConfigNeededNotice(`"${file.name}" uploaded. Bank format not detected — click Configure to set it up.`);
      } else {
        showSuccess(`Statement "${file.name}" uploaded. Processing...`);
      }
      if (source_file_id && data.ingest_status === "processing") pollIngestStatus(source_file_id, file.name);
    } catch (err: any) {
      setError(getErrorMessage(err, "Statement upload failed."));
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
        getErrorMessage(e, `Failed to remove "${filename}". Check that your account has permission to modify statements.`)
      );
    }
  };

  const isRunning = runStatus.status === "running";

  const fmtElapsed = (s: number) => `${Math.floor(s / 60).toString().padStart(2,"0")}:${(s % 60).toString().padStart(2,"0")}`;

  // Viewer: Home is a working dashboard for people who already have
  // access -- a Viewer never actually renders it. app/layout.tsx's route
  // guard normally redirects them before this component even mounts;
  // this is just a defensive fallback for that brief window right after
  // /me resolves, in case this page was reached directly.
  if (isViewer) {
    router.replace("/welcome");
    return null;
  }

  return (
			<div className="max-w-5xl mx-auto space-y-5">
				{backendUnreachable && (
					<div className="flex items-start gap-3 bg-red-50 border-2 border-red-300 rounded-2xl px-5 py-4 shadow-sm">
						<AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
						<div>
							<p className="text-sm font-black text-red-700 uppercase tracking-wide">
								Can't reach the backend
							</p>
							<p className="text-[13px] text-red-600 mt-0.5">
								None of this page's data could load — the API server didn't respond at all (not just an error reply).
								Check that it's running and reachable, then this will clear on its own once it's back.
							</p>
						</div>
					</div>
				)}
				<WelcomeHero userDisplayName={userDisplayName} />

				<StatusBanners
					error={error} setError={setError}
					duplicateUploadInfo={duplicateUploadInfo} setDuplicateUploadInfo={setDuplicateUploadInfo}
					successMessage={successMessage} onDismissSuccess={advanceSuccessQueue}
					runCompletionSummary={runCompletionSummary} setRunCompletionSummary={setRunCompletionSummary}
					configNeededNotice={configNeededNotice} setConfigNeededNotice={setConfigNeededNotice}
					uploadNotice={uploadNotice} setUploadNotice={setUploadNotice}
				/>
				{/* PATCH: Retry-all-failed-receipts moved to the Analysis History
				    run-detail view (app/analysis-history/page.tsx) instead of living
				    here too. lastRunId only ever reflects the most recent run THIS
				    browser session happened to see -- someone typically fixes an
				    OU/Business Unit detail well after they've navigated away from
				    Home, so a durable, always-reachable-by-run_id location (any past
				    run, any time) is the right one, not a second copy tied to
				    whatever's freshest in this tab's memory. */}

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
						statementGroups={statementGroups}
						isStatementSelected={isStatementSelected}
						toggleStatementSelected={toggleStatementSelected}
						detectionInfo={detectionInfo}
						onOpenResolveForFile={openResolveForFile}
						onOpenWizardForFile={setWizardFile}
						onRemoveFile={handleRemoveFile}
					/>
				</div>

				{/* CONTROL BAR CARD */}
				<div className="flex items-center justify-end -mb-1">
					<AiStatusBadge />
				</div>
				<RunControlBar
					isRunning={isRunning}
					loading={loading}
					filesAlreadyAnalyzed={filesAlreadyAnalyzed}
					lastRunId={lastRunId}
					agingStatus={agingStatus}
					files={files}
					accountGroups={accountGroups}
					isAccountSelected={isAccountSelected}
					elapsedSeconds={elapsedSeconds}
					fmtElapsed={fmtElapsed}
					onStart={handleStart}
				/>

				{/* Confirm-before-run dialog */}
				{confirmRun && (
					<ConfirmRunDialog
						preflight={preflight}
						preflightLoading={preflightLoading}
						preflightError={preflightError}
						loading={loading}
						onCancel={() => { setConfirmRun(null); setPreflight(null); setPreflightError(""); }}
						onConfirm={confirmAndStartRun}
						onRetryPreflight={() => loadPreflight(confirmRun.filenames)}
					/>
				)}

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
							setConfigNeededNotice("");
							setDetectionInfo((prev) => ({
								...prev,
								[fn]: { config_key: configKey, warning: null, ambiguous: false },
							}));
							// The file was already uploaded (and failed ingest as UNKNOWN).
							// Now that its config exists, re-ingest it IN PLACE so it parses
							// rows + links its account + flips to ready — a plain re-upload
							// would be blocked as a duplicate and do nothing.
							const sf = files.find((f) => f.filename === fn);
							if (sf?.source_file_id) {
								reingestStatement(sf.source_file_id)
									.then(() => {
										showSuccess(`Config '${configKey}' saved — re-processing "${fn}"…`);
										pollIngestStatus(sf.source_file_id!, fn);
									})
									.catch(() => showSuccess(`Config '${configKey}' saved. Re-upload the file to process it.`));
							} else {
								showSuccess(`Config '${configKey}' saved.`);
							}
						}}
					/>
				)}
			</div>
		);
}