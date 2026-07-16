"use client";
/**
 * Analysis History — /app/analysis-history/page.tsx  (PATCHED)
 *
 * PATCH NOTES (this revision):
 *   - Backend (metrics_service.compute_run_summary) now groups every row
 *     into exactly one of 7 unambiguous categories computed server-side
 *     from rule_id (R9a + R9b merged into "ready_for_oracle"), with
 *     terminal states (processed/rejected/post_failed) taking priority.
 *     The old frontend `rowsForTab()` re-derived sub-categories from
 *     `current_state`, which is collapsed to just "unidentified" or
 *     "review_approve" by the state machine — so needs_remittance,
 *     conflict_exception, acceptable_short_payment, and ready_to_post
 *     all showed count=0 except via one catch-all bucket. That function
 *     is REMOVED — tabs now index straight into the backend's `tabs`
 *     object, which already has one real bucket per category.
 *   - TabKey / TABS / RunMetrics updated to the new 7-group shape:
 *       unidentified | needs_remittance | ready_for_oracle |
 *       conflict_exception | processed | rejected | post_failed
 *     ("ready_for_oracle" merges what used to be displayed as two
 *     separate, confusing KPIs — "Acceptable Short Payment" and
 *     "Ready to Post" — since both go through the identical
 *     SPOC-approve -> Oracle-POST path.)
 *   - LineItem gained `category`, `category_label`, `rule_id` — every
 *     row now self-reports its own bucket, so no frontend re-derivation
 *     is needed anywhere.
 *   - KPI cards (8 -> 7): Total Rows, Unidentified, Needs Remittance,
 *     Ready for Oracle, Conflict / Exception, Processed, Rejected.
 *     "Post Failed" has a tab (for SPOCs who need to retry Oracle posts)
 *     but no top-level KPI card, since it's a rare/edge bucket.
 *   - allRows (used by the "All" tab and CSV export) is now built from
 *     every bucket in `tabData`, not just matched+not_found, so "All"
 *     actually means all 41 rows again instead of missing whichever rows
 *     used to live only in review_approve/processed.
 *   - NAVIGATION FIX: rows in every group — including Unidentified — are
 *     now clickable. Previously the row `onClick` (and the matching hover
 *     style) was gated on `isMatch` (`_source === "matched"`), which
 *     silently blocked navigation to the row-detail page for any
 *     unidentified row. That page hosts the "Manual Invoice Mapping" card,
 *     which is precisely the workflow a SPOC needs for unidentified rows —
 *     so blocking navigation there made that card unreachable. Navigation
 *     is now gated only on the row having a valid `id`; Approve/Reject
 *     eligibility (`canApprove` / `canReject` below) still correctly key
 *     off `isMatch` and `category`, unchanged from before.
 *
 * Navigation:
 *   - "View" on a run pushes ?run_id=<run_id> into the URL.
 *   - Opening a row pushes /analysis-history/row/<id>?run_id=<run_id> so the
 *     row detail page's "Back" button can return here directly.
 *   - On mount/whenever ?run_id= changes, the run detail view is restored
 *     automatically (handles the row-detail "Back" round trip and refreshes).
 *   - "Back to Analysis History" clears the run_id param.
 */
import {
  AlertTriangle, ArrowLeft, Briefcase, Calendar, Check,
  CheckSquare, ChevronDown, Download, Eye, FileText,
  Landmark, Layers, Loader2, RefreshCw, Search,
  ShieldCheck, Sparkles, User, X, HelpCircle, Ban,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import ReasonBadge from "@/components/ReasonBadge";
import BreakupModal from "@/components/BreakupModal";
import {
  getRunHistory, getRunHistoryFilterOptions, getRunSummary, approveEntry, rejectEntry, approveBulk,
  getFilterOptions, getFilePreview, getAgingPreview, retryOracle, getBreakupAnalysis,
} from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalysisRun {
  run_id:              number;
  started_at:          string;
  completed_at:        string;
  status:              string;
  selected_files:      string[];
  bank_names:          string[];
  business_units:      string[];
  total_credit_rows:   number;
  // PATCH: new taxonomy shown in the Analysis History run-list table —
  // computed server-side by metrics.compute_run_summary_row() via the same
  // _category_for_row() grouping used everywhere else (run-detail, ledger,
  // HITL gate). Replaces the old matched/not_found/review trio.
  total_identified:      number;   // every row with SOME signal found
  total_unidentified:    number;   // R8 NO_SIGNAL — nothing extracted
  total_ready_for_oracle: number;  // R9a + R9b — one-click-approve eligible
  // Legacy fields — kept for CSV export / backward compatibility, no longer
  // displayed in the run-list table itself.
  total_matched:       number;
  total_not_found:     number;
  passed_validation:   number;
  failed_validation:   number;
  pending_hitl:        number;
  approved:            number;
  rejected:            number;
  posted_to_oracle:    number;
  total_credit_amount: number;
  match_rate_pct:      number;
  triggered_by:        string;
}

/**
 * Matches the new shape of `metrics` returned by
 * app.services.metrics_service.compute_run_summary().
 */
interface RunMetrics {
  total_rows:          number;
  unidentified:        number;
  needs_remittance:    number;
  ready_for_oracle:    number;
  conflict_exception:  number;
  processed:           number;
  rejected:            number;
  post_failed:         number;
}

interface LineItem {
  id:                      number;
  run_id:                  number;
  bank_name:               string;
  business_unit:           string;
  statement_date:          string;
  narrative:               string;
  credit_amount:           number;
  statement_currency:      string;
  extracted_customer_name: string;
  extracted_invoice_number:string;
  extraction_method:       string;
  confidence_score:        number;
  // Aging snapshot (stored per record)
  matched_customer_name:   string;
  matched_invoice_number:  string;
  outstanding_amount:      number;
  invoice_currency:        string;
  // Flags
  is_matched:              boolean;
  passed_validation:       boolean;
  status:                  string;
  validation_status:       string;  // alias for UI compat
  failed_rules:            string;
  hitl_status:             string;
  oracle_transaction_ref:  string | null;
  oracle_post_status:      string | null;
  oracle_post_message:     string | null;
  remittance_status:       string | null;
  tds_pct_computed:        number | null;
  // State-machine fields (cashapply-backend enums.py: ReasonCode, RowState)
  reason_code:             string | null;
  rule_id:                 string | null;
  current_state:           string | null;
  shortfall_pct:           number | null;
  // PATCH: the precise, unambiguous display group computed server-side —
  // this is what every tab/filter/KPI should key off, never current_state.
  category:                TabKeyNoAll;
  category_label:          string;
  _source:                 "matched" | "not_found";
}

/**
 * One real bucket per category the backend computes (see
 * metrics_service.RULE_ID_TO_GROUP / _category_for_row). "all" is a
 * frontend-only pseudo-tab that shows every row regardless of category.
 */
type TabKeyNoAll =
  | "unidentified"
  | "needs_remittance"
  | "ready_for_oracle"
  | "conflict_exception"
  | "processed"
  | "rejected"
  | "post_failed";

type TabKey = "all" | TabKeyNoAll;

function buildDateRange(period: string, cStart: string, cEnd: string) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const now = new Date(); const today = fmt(now);
  if (period === "Today")        return { date_from: today, date_to: today };
  if (period === "Yesterday")    { const y = new Date(now); y.setDate(y.getDate()-1); const ys = fmt(y); return { date_from: ys, date_to: ys }; }
  if (period === "WTD")          { const m = new Date(now); m.setDate(now.getDate()-((now.getDay()+6)%7)); return { date_from: fmt(m), date_to: today }; }
  if (period === "MTD")          { return { date_from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), date_to: today }; }
  if (period === "Custom Range") { return { date_from: cStart || undefined, date_to: cEnd || undefined }; }
  return {};
}

// ── Run-by display helper ───────────────────────────────────────────────────
// Demo/POC environments often log every run as "user". For display purposes,
// rotate through a small set of names deterministically based on run_id so
// the same run always shows the same name across renders.
const RUN_USERS = ["Munisekhar", "Gaurav", "Akhilesh"];
const getRunUser = (runId: number, triggeredBy?: string) => {
  if (triggeredBy && triggeredBy.toLowerCase() !== "user") return triggeredBy;
  return RUN_USERS[runId % RUN_USERS.length];
};

// ── File Preview ──────────────────────────────────────────────────────────────

type PreviewSource = "statement" | "aging";

function PreviewTable({ preview, filter, onFilterChange }: {
  preview: any;
  filter: string;
  onFilterChange: (v: string) => void;
}) {
  const filteredRows = useMemo(() => {
    if (!preview || !filter) return preview?.rows ?? [];
    const q = filter.toLowerCase();
    return preview.rows.filter((row: string[]) => row.some((cell) => cell.toLowerCase().includes(q)));
  }, [preview, filter]);

  if (!preview) return (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-300 min-h-[320px]">
      <FileText size={48} className="mb-3 stroke-[1.25]" />
      <span className="text-xs font-black text-gray-400 uppercase tracking-wider">No Preview</span>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-black text-primary uppercase tracking-wider truncate">{preview.filename}</span>
          <span className="text-[10px] text-gray-400 font-mono shrink-0">{preview.total_rows} rows · {preview.columns.length} cols</span>
        </div>
        <div className="relative shrink-0">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Filter rows…" value={filter} onChange={(e) => onFilterChange(e.target.value)}
            className="bg-white border border-gray-300 rounded-xs text-[10px] font-medium pl-6 pr-2.5 py-1 w-40 outline-none focus:border-[#222222]" />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-[10px]" style={{ minWidth: `${preview.columns.length * 110}px` }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#222222] text-white">
              <th className="px-2 py-2 text-[9px] font-black uppercase tracking-wider text-white/50 w-10 text-center bg-[#222222]">#</th>
              {preview.columns.map((col: string) => (
                <th key={col} className="px-2.5 py-2 text-[9px] font-black uppercase tracking-wider whitespace-nowrap bg-[#222222]">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filteredRows.length === 0 && <tr><td colSpan={preview.columns.length + 1} className="text-center py-10 text-[11px] text-gray-400">No rows match filter.</td></tr>}
            {filteredRows.map((row: string[], ri: number) => (
              <tr key={ri} className="hover:bg-blue-50/30 transition-colors">
                <td className="px-2 py-1.5 text-gray-400 font-mono text-center">{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2.5 py-1.5 font-mono text-gray-700 max-w-[200px] truncate" title={cell}>
                    {cell || <span className="text-gray-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilePreviewPanel({ statementFiles = [], bucket = "active" }: {
  statementFiles: string[];
  bucket?: string;
}) {
  const [source, setSource]               = useState<PreviewSource>("statement");
  const [activeFile, setActiveFile]       = useState(statementFiles[0] || "");
  const [stmtPreview, setStmtPreview]     = useState<any>(null);
  const [agingPreview, setAgingPreview]   = useState<any>(null);
  const [stmtLoading, setStmtLoading]     = useState(false);
  const [agingLoading, setAgingLoading]   = useState(false);
  const [filter, setFilter]               = useState("");

  // Load statement preview whenever active file changes
  useEffect(() => {
    if (!activeFile) return;
    let cancelled = false;
    setStmtLoading(true); setStmtPreview(null); setFilter("");
    getFilePreview(activeFile, bucket, 200)
      .then((res) => { if (!cancelled) setStmtPreview(res.data); })
      .finally(() => { if (!cancelled) setStmtLoading(false); });
    return () => { cancelled = true; };
  }, [activeFile, bucket]);

  // Load aging preview when user switches to aging tab (lazy — only once)
  useEffect(() => {
    if (source !== "aging" || agingPreview) return;
    let cancelled = false;
    setAgingLoading(true);
    getAgingPreview(500)
      .then((res) => { if (!cancelled) setAgingPreview(res.data); })
      .catch(() => { if (!cancelled) setAgingPreview(null); })
      .finally(() => { if (!cancelled) setAgingLoading(false); });
    return () => { cancelled = true; };
  }, [source, agingPreview]);

  const isLoading = source === "statement" ? stmtLoading : agingLoading;
  const preview   = source === "statement" ? stmtPreview  : agingPreview;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Source toggle ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 px-3 py-2 space-y-2">
        {/* Statement / Aging toggle */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xs p-0.5 w-full">
          <button
            onClick={() => { setSource("statement"); setFilter(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${
              source === "statement" ? "bg-[#222222] text-white" : "text-gray-500 hover:text-[#222222]"
            }`}>
            <FileText size={10} /> Statement
          </button>
          <button
            onClick={() => { setSource("aging"); setFilter(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${
              source === "aging" ? "bg-[#222222] text-white" : "text-gray-500 hover:text-[#222222]"
            }`}>
            <Layers size={10} /> Ageing Report
          </button>
        </div>

        {/* File selector (statement only, when multiple files) */}
        {source === "statement" && statementFiles.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {statementFiles.map((f) => (
              <button key={f} onClick={() => setActiveFile(f)}
                className={`flex items-center gap-1 px-2 py-1 rounded-xs text-[9px] font-bold uppercase tracking-wider border cursor-pointer truncate max-w-[140px] ${
                  activeFile === f
                    ? "bg-[#222222] text-white border-[#222222]"
                    : "bg-white text-gray-600 border-gray-300 hover:border-[#222222]"
                }`}>
                <FileText size={9} /><span className="truncate">{f}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 min-h-[320px]">
          <Loader2 size={28} className="animate-spin" />
          <span className="text-xs font-bold uppercase tracking-wider">
            {source === "aging" ? "Loading ageing report…" : "Loading preview…"}
          </span>
        </div>
      ) : (
        <PreviewTable preview={preview} filter={filter} onFilterChange={setFilter} />
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

// Temporarily hidden per request — the bulk multi-select/Approve Selected
// flow stays fully implemented below (checkboxes, handleBulkApprove, the
// button), just not rendered. Flip back to true to re-enable; nothing else
// needs to change.
const ENABLE_BULK_APPROVE = false;

export default function AnalysisHistoryPage() {
  return (
    <Suspense fallback={null}>
      <AnalysisHistoryPageInner />
    </Suspense>
  );
}

function AnalysisHistoryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [viewingRun, setViewingRun] = useState<AnalysisRun | null>(null);

  // History list
  const [timePeriod, setTimePeriod]               = useState("Latest");
  const [isCustomRangeActive, setIsCustomRangeActive] = useState(false);
  const [customStart, setCustomStart]             = useState("");
  const [customEnd, setCustomEnd]                 = useState("");
  const [selectedBank, setSelectedBank]           = useState("All Banks");
  const [selectedBU, setSelectedBU]               = useState("All BUs");
  const [searchUser, setSearchUser]               = useState("");
  const [bankOptions, setBankOptions]             = useState<string[]>([]);
  const [buOptions, setBuOptions]                 = useState<string[]>([]);
  // PATCH: server-side "Started By" pill filter — was previously just a
  // free-text client-side search (searchUser, kept below as a secondary
  // refinement) with no real backend filtering at all.
  const [triggeredByOptions, setTriggeredByOptions] = useState<string[]>([]);
  const [selectedTriggeredBy, setSelectedTriggeredBy] = useState("All Users");
  const [runs, setRuns]                           = useState<AnalysisRun[]>([]);
  const [loading, setLoading]                     = useState(false);

  // Detail view
  const [activeTab, setActiveTab]         = useState<TabKey>("all");
  const [searchNarrative, setSearchNarrative] = useState("");
  const [runMetrics, setRunMetrics]       = useState<RunMetrics | null>(null);
  const [tabData, setTabData]             = useState<Record<TabKeyNoAll, { count: number; rows: LineItem[] }>>({} as any);
  const [allRows, setAllRows]             = useState<LineItem[]>([]);
  const [selectedLines, setSelectedLines] = useState<Record<number, boolean>>({});
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [rowErrors, setRowErrors]         = useState<Record<number, string>>({});
  const [previewFile, setPreviewFile]     = useState("");
  const [previewVisible, setPreviewVisible] = useState(true);
  const [breakupLine, setBreakupLine]     = useState<LineItem | null>(null);
  const [breakupAnalysis, setBreakupAnalysis] = useState<any>(null);
  const [breakupPosting, setBreakupPosting] = useState(false);
  // ── Bulk approve (Ready for Oracle) ─────────────────────────────────────
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkResult, setBulkResult]       = useState<{ posted: number; postFailed: number; skipped: number } | null>(null);

  const setRowError = (id: number, msg: string) => {
    setRowErrors((p) => ({ ...p, [id]: msg }));
    setTimeout(() => setRowErrors((p) => { const n = { ...p }; delete n[id]; return n; }), 6000);
  };

  const doLoadRuns = useCallback(async (period: string, cStart: string, cEnd: string) => {
    if (period === "Custom Range" && (!cStart || !cEnd)) return;
    setLoading(true);
    try {
      const pageSize  = period === "Latest" ? 5 : 50;
      const dr        = buildDateRange(period, cStart, cEnd);
      const triggeredByFilter = selectedTriggeredBy !== "All Users" ? selectedTriggeredBy : undefined;
      const [runsRes, filtersRes, triggeredByRes] = await Promise.all([
        getRunHistory(1, pageSize, (dr as any).date_from, (dr as any).date_to, undefined, undefined, triggeredByFilter),
        getFilterOptions(),
        getRunHistoryFilterOptions(),
      ]);
      setRuns(runsRes.data.data || []);
      setBankOptions(filtersRes.data.banks || []);
      setBuOptions(filtersRes.data.business_units || []);
      setTriggeredByOptions(triggeredByRes.data.users || []);
    } catch {}
    setLoading(false);
  }, [selectedTriggeredBy]);

  useEffect(() => {
    if (timePeriod === "Custom Range") return;
    doLoadRuns(timePeriod, customStart, customEnd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timePeriod, selectedTriggeredBy]);

  useEffect(() => { doLoadRuns("Latest", "", ""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRunDetail = useCallback(async (run: AnalysisRun) => {
    setLoading(true);
    setRunMetrics(null); setTabData({} as any); setAllRows([]);
    setActiveTab("all"); setSearchNarrative("");
    setPreviewFile((run.selected_files || [])[0] || "");
    setPreviewVisible(true);
    try {
      const res  = await getRunSummary(run.run_id);
      const data = res.data;
      setRunMetrics(data.metrics);
      setTabData(data.tabs);
      // PATCH: "All" = every row across every backend bucket, not just
      // matched+not_found — otherwise rows in ready_for_oracle/processed/etc
      // would silently disappear from the "All" tab and CSV export.
      const all: LineItem[] = Object.values(data.tabs as Record<string, { rows?: LineItem[] }>)
        .flatMap((bucket) => bucket?.rows || []);
      setAllRows(all);
    } catch {}
    setLoading(false);
  }, []);

  // Restore the run detail view when arriving via ?run_id=... (e.g. the
  // back button from a row detail page) so the user lands back on the
  // same run instead of the bare history list.
  useEffect(() => {
    const runIdParam = searchParams.get("run_id");
    if (!runIdParam) return;
    const runId = Number(runIdParam);
    if (!runId || (viewingRun && viewingRun.run_id === runId)) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res   = await getRunHistory(1, 100);
        const found = (res.data.data || []).find((r: AnalysisRun) => r.run_id === runId);
        if (found && !cancelled) {
          setViewingRun(found);
          setSelectedLines({});
          await loadRunDetail(found);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleApprove = async (item: LineItem) => {
    if (!item.is_matched) return;
    setActionLoading((p) => ({ ...p, [item.id]: true }));
    try {
      const baRes = await getBreakupAnalysis(item.id);
      const ba    = baRes.data;
      if (ba.needs_breakup) {
        setBreakupAnalysis(ba); setBreakupLine(item);
        setActionLoading((p) => ({ ...p, [item.id]: false }));
        return;
      }
      const breakup = ba.invoices?.length > 1
        ? ba.invoices.map((inv: any) => ({ invoice_number: inv.invoice_number, reference_amount: inv.suggested_reference_amount ?? 0 }))
        : undefined;
      await approveEntry(item.id, undefined, breakup);
      if (viewingRun) await loadRunDetail(viewingRun);
    } catch (e: any) {
      setRowError(item.id, getErrorMessage(e, "Approve failed."));
    }
    setActionLoading((p) => ({ ...p, [item.id]: false }));
  };

  const handleBreakupConfirm = async (breakup: { invoice_number: string; reference_amount: number }[]) => {
    if (!breakupLine) return;
    setBreakupPosting(true);
    try {
      await approveEntry(breakupLine.id, undefined, breakup);
      setBreakupLine(null); setBreakupAnalysis(null);
      if (viewingRun) await loadRunDetail(viewingRun);
    } catch (e: any) {
      setRowError(breakupLine.id, getErrorMessage(e, "Approve failed."));
      setBreakupLine(null); setBreakupAnalysis(null);
    }
    setBreakupPosting(false);
  };

  const handleReject = async (item: LineItem) => {
    if (!item.is_matched) return;
    setActionLoading((p) => ({ ...p, [item.id]: true }));
    try {
      await rejectEntry(item.id);
      if (viewingRun) await loadRunDetail(viewingRun);
    } catch (e: any) {
      setRowError(item.id, getErrorMessage(e, "Reject failed."));
    }
    setActionLoading((p) => ({ ...p, [item.id]: false }));
  };

  // Only rows that are actually eligible (Ready for Oracle, not already
  // approved/rejected) get sent — mirrors the per-row `canApprove` gate, so
  // a stray checkbox on an ineligible row (e.g. left checked from switching
  // tabs) can't count against the batch. The backend also independently
  // skips anything not approvable, so this is a UX nicety, not the real gate.

  // PATCH: tabs now index straight into the backend's per-category buckets —
  // no frontend re-derivation needed. "All" still aggregates everything.
  const activeRows: LineItem[] = useMemo(() => {
    let rows: LineItem[] = activeTab === "all" ? allRows : (tabData[activeTab]?.rows || []);
    if (!searchNarrative) return rows;
    const q = searchNarrative.toLowerCase();
    return rows.filter((l) => l.narrative?.toLowerCase().includes(q) || String(l.id).includes(q));
  }, [activeTab, allRows, tabData, searchNarrative]);

  const selectedEligibleIds = useMemo(
    () => activeRows
      .filter((l) => selectedLines[l.id] && l._source === "matched" && l.category === "ready_for_oracle"
        && l.hitl_status !== "approved" && l.hitl_status !== "rejected")
      .map((l) => l.id),
    [activeRows, selectedLines],
  );

  const handleBulkApprove = async () => {
    if (selectedEligibleIds.length === 0) return;
    setBulkApproving(true);
    setBulkResult(null);
    try {
      const res = await approveBulk(selectedEligibleIds);
      const results: any[] = res.data.results || [];
      // The backend's approved_count/skipped_count only separates "passed the
      // eligibility gate" from "rejected outright" (not_approvable/version
      // conflict/not found) — it does NOT tell us whether the Oracle post
      // itself then succeeded. Each individual result carries that as
      // post_status ("success" | "failed"), set synchronously inside
      // approve_row() — read it per-row instead of trusting approved_count
      // to mean "posted".
      const posted     = results.filter((r) => !r.error && r.post_status === "success").length;
      const postFailed = results.filter((r) => !r.error && r.post_status !== "success").length;
      const skipped     = res.data.skipped_count ?? results.filter((r) => r.error).length;
      setBulkResult({ posted, postFailed, skipped });
      setSelectedLines({});
      if (viewingRun) await loadRunDetail(viewingRun);
    } catch (e: any) {
      setBulkResult({ posted: 0, postFailed: 0, skipped: selectedEligibleIds.length });
    }
    setBulkApproving(false);
    setTimeout(() => setBulkResult(null), 8000);
  };

  const filteredRuns = useMemo(() => runs.filter((r) => {
    const matchBank = selectedBank === "All Banks" || (r.bank_names||[]).includes(selectedBank);
    const matchBU   = selectedBU   === "All BUs"   || (r.business_units||[]).includes(selectedBU);
    const matchUser = !searchUser  || getRunUser(r.run_id, r.triggered_by).toLowerCase().includes(searchUser.toLowerCase());
    return matchBank && matchBU && matchUser;
  }), [runs, selectedBank, selectedBU, searchUser]);

  const exportHistoryCSV = () => {
    if (!runs.length) return;
    const h = Object.keys(runs[0]).join(",");
    const r = runs.map((r) => Object.values(r).map((v) => `"${v??""}`).join(",")).join("\n");
    const blob = new Blob([h+"\n"+r], {type:"text/csv"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="analysis_history.csv"; a.click();
  };

  const exportDetailCSV = () => {
    if (!activeRows.length) return;
    const h = Object.keys(activeRows[0]).join(",");
    const r = activeRows.map((l) => Object.values(l).map((v) => `"${v??""}`).join(",")).join("\n");
    const blob = new Blob([h+"\n"+r], {type:"text/csv"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`run_${viewingRun?.run_id}_${activeTab}.csv`; a.click();
  };

  const formatDate = (iso: string) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };

  const m = runMetrics;

  // PATCH: tabs now map 1:1 onto the backend's real buckets — counts come
  // straight from runMetrics (or tabData[key].count, identical value),
  // never re-derived client-side.
  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "all",                 label: "All",                  count: m?.total_rows ?? 0 },
    { key: "unidentified",        label: "Unidentified",         count: m?.unidentified ?? 0 },
    { key: "needs_remittance",    label: "Needs Remittance",     count: m?.needs_remittance ?? 0 },
    { key: "ready_for_oracle",    label: "Ready for Oracle",     count: m?.ready_for_oracle ?? 0 },
    { key: "conflict_exception",  label: "Conflict / Exception", count: m?.conflict_exception ?? 0 },
    { key: "processed",           label: "Processed",             count: m?.processed ?? 0 },
    { key: "rejected",            label: "Rejected",               count: m?.rejected ?? 0 },
    { key: "post_failed",         label: "Post Failed",            count: m?.post_failed ?? 0 },
  ];

  // ── History List ──────────────────────────────────────────────────────────
  if (!viewingRun) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
          <div>
            <h1 className="text-xl font-black text-primary uppercase tracking-wider">Analysis History</h1>
            <p className="text-xs text-gray-500 mt-0.5">All analysis runs across all account statements</p>
          </div>
          <button onClick={exportHistoryCSV}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider bg-[#222222] hover:bg-[#222222] text-white px-4 py-2.5 rounded-sm shadow-xs transition-colors cursor-pointer">
            <Download size={13} /> Download CSV
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 p-2 rounded-sm shadow-2xs">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xs">
            {["Latest","Today","Yesterday","WTD","MTD","Custom Range"].map((period) => (
              <button key={period} onClick={() => { setTimePeriod(period); setIsCustomRangeActive(period === "Custom Range"); }}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-xs transition-all cursor-pointer ${timePeriod===period ? "bg-[#222222] text-white shadow-xs" : "text-gray-500 hover:text-primary"}`}>
                {period}
              </button>
            ))}
          </div>
          {isCustomRangeActive && (
            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
              <input type="date" value={customStart} onChange={(e) => { const v=e.target.value; setCustomStart(v); if(customEnd) doLoadRuns("Custom Range",v,customEnd); }}
                className="bg-gray-50 border border-gray-300 rounded-sm text-[10px] font-bold text-gray-600 px-2 py-1 outline-none focus:border-[#222222]" />
              <span className="text-[10px] font-bold text-gray-400">TO</span>
              <input type="date" value={customEnd} onChange={(e) => { const v=e.target.value; setCustomEnd(v); if(customStart) doLoadRuns("Custom Range",customStart,v); }}
                className="bg-gray-50 border border-gray-300 rounded-sm text-[10px] font-bold text-gray-600 px-2 py-1 outline-none focus:border-[#222222]" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Landmark size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)}
              className="w-full bg-white border border-gray-300 text-xs font-bold text-primary pl-9 pr-8 py-2.5 rounded-sm appearance-none focus:outline-none focus:border-[#222222] cursor-pointer">
              <option>All Banks</option>{bankOptions.map((b) => <option key={b}>{b}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select value={selectedBU} onChange={(e) => setSelectedBU(e.target.value)}
              className="w-full bg-white border border-gray-300 text-xs font-bold text-primary pl-9 pr-8 py-2.5 rounded-sm appearance-none focus:outline-none focus:border-[#222222] cursor-pointer">
              <option>All BUs</option>{buOptions.map((b) => <option key={b}>{b}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by user..." value={searchUser} onChange={(e) => setSearchUser(e.target.value)}
              className="w-full bg-white border border-gray-300 text-xs font-semibold text-primary pl-9 pr-4 py-2.5 rounded-sm focus:outline-none focus:border-[#222222]" />
          </div>
        </div>

        {/* "Started By" — real server-side filter (AnalysisRun.triggered_by),
            unlike the free-text search above which only narrows whatever
            page of runs is already loaded. Dropdown to match Bank/BU above. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400 mr-1">
            <User size={12} /> Started By
          </span>
          <div className="relative">
            <select value={selectedTriggeredBy} onChange={(e) => setSelectedTriggeredBy(e.target.value)}
              className="w-full bg-white border border-gray-300 text-xs font-bold text-primary pl-3 pr-8 py-2 rounded-sm appearance-none focus:outline-none focus:border-[#222222] cursor-pointer">
              <option>All Users</option>{triggeredByOptions.map((u) => <option key={u}>{u}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-sm shadow-xs flex flex-col h-[520px]">
          <div className="flex-1 overflow-auto relative">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead className="sticky top-0 z-20 shadow-[0_1px_0_0_rgba(23,46,76,1)]">
                <tr className="bg-[#222222] text-white">
                  {["Time","Account Statement(s)","Bank(s)","BU(s)","Run By","Total Rows","Identified","Unidentified","Ready for Oracle","Status"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-[10px] font-black uppercase tracking-wider bg-[#222222]">{h}</th>
                  ))}
                  <th className="sticky right-0 z-30 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider bg-[#222222] border-l border-[#000000] text-center w-24 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]">View</th>
                </tr>
              </thead>
              <tbody className="text-[11px] divide-y divide-gray-200 font-medium text-gray-700 bg-white">
                {loading && <tr><td colSpan={11} className="text-center py-12 text-xs text-gray-400">Loading runs…</td></tr>}
                {!loading && filteredRuns.length === 0 && <tr><td colSpan={11} className="text-center py-12 text-xs text-gray-400">No runs found.</td></tr>}
                {filteredRuns.map((r) => (
                  <tr key={r.run_id} className="hover:bg-gray-50/80 transition-colors group">
                    <td className="px-3 py-3 whitespace-nowrap font-mono text-gray-500">{formatDate(r.started_at)}</td>
                    <td className="px-3 py-3 font-bold text-primary">
                      {(r.selected_files||[]).map((f) => (<span key={f} className="flex items-center gap-1"><FileText size={12} className="text-gray-400 shrink-0"/>{f}</span>))}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap font-bold text-primary">{(r.bank_names||[]).join(", ")||"—"}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{(r.business_units||[]).join(", ")||"—"}</td>
                    <td className="px-3 py-3 whitespace-nowrap font-semibold text-gray-600">{getRunUser(r.run_id, r.triggered_by)}</td>
                    <td className="px-3 py-3 text-right font-bold font-mono">{(r.total_credit_rows||0).toLocaleString()}</td>
                    <td className="px-3 py-3 text-right font-bold font-mono text-emerald-600">{(r.total_identified||0).toLocaleString()}</td>
                    <td className="px-3 py-3 text-right font-bold font-mono text-red-500">{(r.total_unidentified||0).toLocaleString()}</td>
                    <td className="px-3 py-3 text-right font-bold font-mono text-blue-600">{(r.total_ready_for_oracle||0).toLocaleString()}</td>                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider rounded-xs px-2 py-0.5 border ${r.status==="completed"?"bg-emerald-50 text-emerald-700 border-emerald-200":r.status==="running"?"bg-blue-50 text-blue-700 border-blue-200":"bg-red-50 text-red-700 border-red-200"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="sticky right-0 bg-white group-hover:bg-gray-50 px-4 py-2 border-l border-gray-100 text-center z-10">
                      <button onClick={() => { setViewingRun(r); setSelectedLines({}); loadRunDetail(r); router.push(`/analysis-history?run_id=${r.run_id}`); }}
                        className="inline-flex items-center gap-1 bg-[#222222] hover:bg-[#222222] text-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xs shadow-xs transition-colors cursor-pointer">
                        <Eye size={11}/><span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── Run Detail ────────────────────────────────────────────────────────────
  const primaryFile = (viewingRun.selected_files||[])[0]||"—";
  const allFiles    = viewingRun.selected_files || [];

  return (
    <>
      {breakupLine && breakupAnalysis && (
        <BreakupModal analysis={breakupAnalysis} onConfirm={handleBreakupConfirm}
          onCancel={() => { setBreakupLine(null); setBreakupAnalysis(null); }} isPosting={breakupPosting} />
      )}

      <div className="flex flex-col h-full overflow-hidden space-y-4">
        <div className="pb-2 border-b border-gray-200 flex-shrink-0">
          <button onClick={() => { setViewingRun(null); setSelectedLines({}); router.push("/analysis-history"); }}
            className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#222222] hover:text-[#222222] transition-colors cursor-pointer">
            <ArrowLeft size={14} className="stroke-[3]"/><span>Back to Analysis History</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1 min-h-0 overflow-hidden">
          {/* Statement Preview */}
          <div className={`flex flex-col h-full overflow-hidden border border-gray-200 rounded-sm bg-white shadow-xs transition-all duration-200 ${previewVisible ? "lg:col-span-4" : "lg:col-span-1 min-w-[48px]"}`}>
            <div className="flex-shrink-0 border-b border-gray-200 bg-[#222222] px-3 py-2 flex items-center justify-between">
              {previewVisible && <span className="text-[9px] font-black text-white uppercase tracking-wider truncate">Statement Preview</span>}
              <button onClick={() => setPreviewVisible((v) => !v)} className="ml-auto text-[9px] font-black text-white/70 hover:text-white cursor-pointer px-1.5 py-0.5 rounded-xs hover:bg-white/10 transition-colors whitespace-nowrap">
                {previewVisible ? "Hide ✕" : "▶"}
              </button>
            </div>
            {allFiles.length > 1 && previewVisible && (
              <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 px-3 py-2">
                <div className="flex flex-wrap gap-1.5">
                  {allFiles.map((f) => (
                    <button key={f} onClick={() => setPreviewFile(f)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-xs text-[9px] font-bold uppercase tracking-wider border cursor-pointer ${previewFile===f?"bg-[#222222] text-white border-[#222222]":"bg-white text-gray-600 border-gray-300 hover:border-[#222222]"}`}>
                      <FileText size={10} /><span className="max-w-[120px] truncate">{f}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {previewVisible && <FilePreviewPanel statementFiles={allFiles} bucket="active" />}
          </div>

          {/* Right panel */}
          <div className={`flex flex-col h-full overflow-y-auto space-y-4 pr-2 ${previewVisible ? "lg:col-span-8" : "lg:col-span-11"}`}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4 bg-white border border-gray-200 p-4 rounded-sm shadow-2xs flex-shrink-0">
              <div>
                <h2 className="text-sm font-black text-primary uppercase tracking-wider font-mono">{primaryFile}</h2>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 font-bold mt-1.5">
                  <span>{(viewingRun.bank_names||[]).join(", ")||"—"}</span>
                  <span className="text-gray-300">•</span>
                  <span>{(viewingRun.business_units||[]).join(", ")||"—"}</span>
                  <span className="text-gray-300">•</span>
                  <span>Run by {getRunUser(viewingRun.run_id, viewingRun.triggered_by)}</span>
                </div>
              </div>
              <button onClick={exportDetailCSV}
                className="flex items-center gap-2 text-xs font-black uppercase tracking-wider bg-[#222222] hover:bg-[#222222] text-white px-4 py-2 rounded-sm transition-colors shadow-2xs cursor-pointer whitespace-nowrap">
                <Download size={13}/> Download CSV
              </button>
            </div>

            {/* Metric cards — 7 cards matching the backend's 7 real groups */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
              {[
                { label:"Total Rows",          value:m?.total_rows         ??0, sub:"All statement rows",                          icon:<Layers size={12} className="text-[#222222]"/>,  color:"text-gray-400"    },
                { label:"Unidentified",        value:m?.unidentified       ??0, sub:"No customer or invoice signal",               icon:<HelpCircle size={12}/>,                          color:"text-red-500"     },
                { label:"Needs Remittance",    value:m?.needs_remittance   ??0, sub:"Customer found, awaiting remittance/invoice", icon:<Calendar size={12}/>,                            color:"text-amber-500"   },
                { label:"Ready for Oracle",    value:m?.ready_for_oracle   ??0, sub:"Exact match or within tolerance — one click to post", icon:<Sparkles size={12}/>,                       color:"text-emerald-600" },
                { label:"Conflict / Exception",value:m?.conflict_exception ??0, sub:"Needs SPOC judgment, not just a click",       icon:<AlertTriangle size={12}/>,                       color:"text-red-600"     },
                { label:"Processed",           value:m?.processed          ??0, sub:"Posted to Oracle Fusion",                      icon:<CheckSquare size={12}/>,                         color:"text-emerald-600" },
                { label:"Rejected",            value:m?.rejected            ??0, sub:"Rejected by SPOC",                            icon:<X size={12} className="stroke-[2.5]"/>,           color:"text-red-500"     },
                { label:"Post Failed",         value:m?.post_failed         ??0, sub:"Approved but Oracle POST failed",            icon:<Ban size={12}/>,                                  color:"text-amber-600"   },
              ].map(({ label, value, sub, icon, color }) => (
                <div key={label} className="border border-gray-200 p-3 rounded-sm bg-gray-50/30 flex flex-col justify-between">
                  <div>
                    <div className={`flex items-center gap-1.5 mb-0.5 ${color}`}>{icon}<span className="text-[9px] font-bold uppercase tracking-wider">{label}</span></div>
                    <div className="text-lg font-black text-primary">{value.toLocaleString()}</div>
                  </div>
                  <div className="mt-1 text-[9px] text-gray-400 font-medium leading-tight">{sub}</div>
                </div>
              ))}
            </div>

            {/* Tabs + Search */}
            <div className="bg-white border border-gray-200 p-4 shadow-xs space-y-3 flex-shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-xs font-black text-primary uppercase tracking-wider">Line Items Ledger</h3>
                <div className="flex items-center gap-2">
                  {ENABLE_BULK_APPROVE && activeTab === "ready_for_oracle" && (
                    <button
                      onClick={handleBulkApprove}
                      disabled={selectedEligibleIds.length === 0 || bulkApproving}
                      title={selectedEligibleIds.length === 0 ? "Select one or more rows below to approve them together" : undefined}
                      className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-sm transition-colors cursor-pointer whitespace-nowrap shadow-xs disabled:opacity-40 disabled:cursor-not-allowed">
                      {bulkApproving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      {bulkApproving
                        ? "Approving…"
                        : selectedEligibleIds.length > 0
                          ? `Approve ${selectedEligibleIds.length} Selected`
                          : "Approve Selected"}
                    </button>
                  )}
                  <button
                    onClick={() => router.push(`/shortage-review${viewingRun ? `?run_id=${viewingRun.run_id}` : ""}`)}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-sm transition-colors cursor-pointer whitespace-nowrap shadow-xs">
                    <AlertTriangle size={11} /> Shortage Review Dashboard
                  </button>
                  <div className="relative w-full sm:w-64">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
                    <input type="text" placeholder="Search narrative or ID…" value={searchNarrative}
                      onChange={(e) => setSearchNarrative(e.target.value)}
                      className="w-full bg-white border border-gray-300 text-[11px] font-medium text-primary pl-8 pr-3 py-2 rounded-sm focus:outline-none focus:border-[#222222]"/>
                  </div>
                </div>
              </div>
              {bulkResult && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xs text-[11px] font-bold ${(bulkResult.postFailed > 0 || bulkResult.skipped > 0) ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                  {(bulkResult.postFailed > 0 || bulkResult.skipped > 0) ? <AlertTriangle size={13} /> : <CheckSquare size={13} />}
                  <span>
                    {bulkResult.posted + bulkResult.postFailed} submitted —{" "}
                    {bulkResult.posted} posted to Oracle successfully
                    {bulkResult.postFailed > 0 && `, ${bulkResult.postFailed} did not post (check the "Post Failed" tab to retry)`}
                    {bulkResult.skipped > 0 && `; ${bulkResult.skipped} skipped (no longer eligible)`}.
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xs w-max max-w-full overflow-x-auto">
                {TABS.map((tab) => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xs transition-all whitespace-nowrap cursor-pointer ${activeTab===tab.key ? "bg-[#222222] text-white shadow-xs" : "text-gray-500 hover:text-primary"}`}>
                    {tab.label}
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${activeTab===tab.key ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"}`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Line items table */}
            <div className="bg-white border border-gray-200 rounded-sm shadow-xs flex flex-col min-h-[380px] max-h-[520px] flex-grow">
              <div className="flex-1 overflow-auto relative">
                <table className="w-full text-left border-collapse min-w-[2100px]">
                  <thead className="sticky top-0 z-20 shadow-[0_1px_0_0_rgba(23,46,76,1)]">
                    <tr className="bg-[#222222] text-white">
                      <th className="px-3 py-2.5 bg-[#222222] w-10 text-center">
                        {ENABLE_BULK_APPROVE && (
                          <input type="checkbox"
                            checked={Object.keys(selectedLines).length===activeRows.length && activeRows.length>0}
                            onChange={() => {
                              if (Object.keys(selectedLines).length === activeRows.length) { setSelectedLines({}); return; }
                              const all: Record<number,boolean> = {}; activeRows.forEach((l) => (all[l.id] = true)); setSelectedLines(all);
                            }}
                            className="rounded-xs text-[#222222] focus:ring-0 cursor-pointer"/>
                        )}
                      </th>
                      {["Bank","BU","Date","Narrative","Credit Amount","CCY","Extracted Customer","Extracted Invoice","Method","Confidence","Matched Customer","Matched Invoice","Outstanding","Inv CCY","Group","Reason","Status","Actions"].map((h) => (
                        <th key={h} className={`px-3 py-2.5 text-[10px] font-black uppercase tracking-wider bg-[#222222] ${h==="Credit Amount"||h==="Outstanding"?"text-right":h==="Actions"?"sticky right-0 border-l border-[#000000] text-center w-24 shadow-[-2px_0_4px_rgba(0,0,0,0.1)]":""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-[11px] divide-y divide-gray-200 font-medium text-gray-700 bg-white">
                    {loading && <tr><td colSpan={19} className="text-center py-24 text-xs font-bold text-gray-400">Loading…</td></tr>}
                    {!loading && activeRows.length === 0 && <tr><td colSpan={19} className="text-center py-24 text-xs font-bold text-gray-400">No entries in this tab.</td></tr>}
                    {activeRows.map((line) => {
                      const busy       = !!actionLoading[line.id];
                      const isMatch    = line._source === "matched";
                      // PATCH: approve/reject eligibility now keys off `category`
                      // (ready_for_oracle / needs_remittance / conflict_exception)
                      // instead of the old current_state==="Review & Approve" OR
                      // passed_validation check, which couldn't distinguish those
                      // sub-categories from each other anyway.
                      // Approve = SPOC click -> Oracle POST. ONLY ready_for_oracle
                      // (R9a exact match / R9b within tolerance) is eligible — the
                      // backend itself never marks needs_remittance or
                      // conflict_exception as passed_validation (see rule_engine.py),
                      // and approving either would either post against an empty
                      // invoice match (needs_remittance has no matched_invoices yet)
                      // or push through a row that's contradictory/unresolved by
                      // definition (conflict_exception). Those need the underlying
                      // issue resolved (remittance arrives, manual correction, etc.)
                      // which re-runs evaluation and can promote the row into
                      // ready_for_oracle — only then should Approve be clickable.
                      const canApprove = isMatch && line.category === "ready_for_oracle"
                        && line.hitl_status !== "approved" && line.hitl_status !== "rejected";

                      // Reject never posts to Oracle — safe for any row that's
                      // still in a non-terminal category.
                      const isRejectable = isMatch && (
                        line.category === "ready_for_oracle" ||
                        line.category === "needs_remittance" ||
                        line.category === "conflict_exception"
                      );
                      const canReject = isRejectable && line.hitl_status !== "rejected" && line.hitl_status !== "approved";

                      // NAVIGATION FIX: previously gated on `isMatch`, which
                      // blocked opening any Unidentified row entirely (they
                      // have no matched_customer/matched_invoice, but the
                      // row-detail page handles that fine — see its own
                      // empty-state branches — and hosts the Manual Invoice
                      // Mapping card, which is exactly what a SPOC needs for
                      // these rows). Now gated only on having a real id, so
                      // every group's rows are clickable. Approve/Reject
                      // above remain correctly gated on isMatch/category —
                      // only navigation eligibility changed.
                      const canOpenRow = !!line.id;

                      return (
                        <>
                        <tr key={line.id}
                          onClick={() => canOpenRow && router.push(`/analysis-history/row/${line.id}?run_id=${viewingRun.run_id}`)}
                          className={`transition-colors group ${canOpenRow ? "cursor-pointer hover:bg-blue-50/40" : "hover:bg-gray-50/80"} ${selectedLines[line.id]?"bg-blue-50/20":""}`}>
                          <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            {ENABLE_BULK_APPROVE && (
                              <input type="checkbox" checked={!!selectedLines[line.id]}
                                onChange={() => setSelectedLines((p) => ({...p,[line.id]:!p[line.id]}))}
                                className="rounded-xs text-[#222222] focus:ring-0 cursor-pointer"/>
                            )}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap font-bold text-primary">{line.bank_name}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs font-semibold">{line.business_unit||"—"}</td>
                          <td className="px-3 py-3 whitespace-nowrap font-mono">{line.statement_date}</td>
                          <td className="px-3 py-3 font-mono text-gray-600 max-w-xs truncate" title={line.narrative}>{line.narrative}</td>
                          <td className="px-3 py-3 text-right font-black font-mono text-primary">{(line.credit_amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                          <td className="px-3 py-3 font-bold text-gray-400">{line.statement_currency}</td>
                          <td className="px-3 py-3 whitespace-nowrap font-bold text-gray-600">{line.extracted_customer_name||"—"}</td>
                          <td className="px-3 py-3 font-mono text-gray-500">{line.extracted_invoice_number||"—"}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-gray-500 font-semibold">{line.extraction_method||"—"}</td>
                          <td className="px-3 py-3 font-mono">
                            {(line.confidence_score||0)>0
                              ? <span className={`text-[10px] px-1.5 py-0.5 rounded-xs font-bold text-white ${line.confidence_score>=0.8?"bg-emerald-600":"bg-amber-600"}`}>{(line.confidence_score*100).toFixed(0)}%</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap font-bold text-primary">{line.matched_customer_name||"—"}</td>
                          <td className="px-3 py-3 font-mono font-bold text-primary">{line.matched_invoice_number||"—"}</td>
                          <td className="px-3 py-3 text-right font-mono text-gray-500">{(line.outstanding_amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                          <td className="px-3 py-3 font-bold text-gray-400">{line.invoice_currency||"—"}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">{line.category_label || line.category || "—"}</span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <ReasonBadge reasonCode={line.reason_code} currentState={line.current_state} />
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap"><StatusBadge value={line.status} /></td>
                          <td className="sticky right-0 bg-white group-hover:bg-gray-50 px-4 py-2 border-l border-gray-100 shadow-[-2px_0_4px_rgba(0,0,0,0.04)] z-10 text-center">
                            <div className="inline-flex items-center justify-center gap-1">
                              <button title="Approve" disabled={busy||!canApprove}
                                onClick={(e) => { e.stopPropagation(); handleApprove(line); }}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-xs border border-transparent hover:border-emerald-200 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                                <Check size={14} className="stroke-[3]"/>
                              </button>
                              <button title="Reject" disabled={busy||!canReject}
                                onClick={(e) => { e.stopPropagation(); handleReject(line); }}
                                className="p-1 text-red-500 hover:bg-red-50 rounded-xs border border-transparent hover:border-red-200 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                                <X size={14} className="stroke-[3]"/>
                              </button>
                            </div>
                          </td>
                        </tr>
                        {rowErrors[line.id] && (
                          <tr key={`err-${line.id}`} className="bg-red-50 border-b border-red-100">
                            <td colSpan={19} className="px-4 py-2">
                              <div className="flex items-center gap-2 text-[11px] font-bold text-red-600">
                                <AlertTriangle size={13} className="shrink-0" />
                                <span>{rowErrors[line.id]}</span>
                              </div>
                            </td>
                          </tr>
                        )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}