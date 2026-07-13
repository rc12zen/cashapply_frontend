"use client";
/**
 * Executive Summary — /app/executive-summary
 *
 * Finance-executive facing view of ONLY records that have actually been
 * posted to Oracle Fusion (oracle_post_status == "success"). This is
 * deliberately narrower than the main Dashboard / Analysis History pages,
 * which also show unidentified / pending / rejected rows — this page exists
 * so a CFO/controller can answer "what actually landed in Oracle, and how
 * was it composed" without wading through the operational worklist.
 *
 * Data source: app.bff.executive_summary
 *   GET /api/executive-summary/filters
 *   GET /api/executive-summary/summary
 *   GET /api/executive-summary/records
 *   GET /api/executive-summary/export   (CSV download)
 */
import {
  AlertTriangle, Briefcase, Calendar, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, Download, Landmark,
  Loader2, RefreshCw, ShieldAlert, User, X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  exportExecutiveCsv, getExecutiveFilters, getExecutiveRecords, getExecutiveSummary,
  getNonPostedRecords, getNonPostedSummary,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PillDef {
  key: string;
  label: string;
}

interface Pill extends PillDef {
  count: number;
}

interface BreakdownEntry {
  count: number;
  amount: number;
}

interface SummaryResponse {
  total_posted: number;
  total_amount: number;
  pills: Pill[];
  by_bank: ({ bank_name: string } & BreakdownEntry)[];
  by_business_unit: ({ business_unit: string } & BreakdownEntry)[];
}

interface PostedRecord {
  id: number;
  run_id: number;
  bank_name: string;
  account_number: string | null;
  business_unit: string;
  ou_number: string;
  statement_date: string | null;
  narrative: string;
  credit_amount: number;
  statement_currency: string;
  invoice_currency: string | null;
  functional_currency: string | null;
  customer_name: string | null;
  invoice_numbers: string;
  target_total: number;
  oracle_ref_no: string | null;
  standard_receipt_id: string | null;
  oracle_posted_at: string | null;
  tags: string[];
  tags_label: string;
}

interface NonPostedRecord {
  id: number;
  run_id: number;
  bank_name: string;
  business_unit: string;
  ou_number: string;
  statement_date: string | null;
  narrative: string;
  credit_amount: number;
  statement_currency: string;
  extracted_customer_name: string | null;
  current_state: string | null;
  hitl_status: string | null;
  reason_code: string | null;
  rule_id: string | null;
  is_cross_ou_currency: boolean;
  category: string;
  category_label: string;
}

interface NonPostedSummaryResponse {
  total_non_posted: number;
  pills: Pill[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return s;
  }
}

const PAGE_SIZE = 50;

export default function ExecutiveSummaryPage() {
  const [bankOptions, setBankOptions] = useState<string[]>([]);
  const [buOptions, setBuOptions] = useState<string[]>([]);
  const [pillDefs, setPillDefs] = useState<PillDef[]>([]);

  const [selectedBank, setSelectedBank] = useState("All Banks");
  const [selectedBU, setSelectedBU] = useState("All BUs");
  const [userOptions, setUserOptions] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState("All Users");
  const [timePeriod, setTimePeriod] = useState("All Time");
  const [isCustomDateActive, setIsCustomDateActive] = useState(false);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [activePill, setActivePill] = useState<string | null>(null);

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [records, setRecords] = useState<PostedRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [viewMode, setViewMode] = useState<"posted" | "non_posted">("posted");
  const [nonPostedSummary, setNonPostedSummary] = useState<NonPostedSummaryResponse | null>(null);
  const [nonPostedRecords, setNonPostedRecords] = useState<NonPostedRecord[]>([]);
  const [nonPostedTotal, setNonPostedTotal] = useState(0);
  const [nonPostedPage, setNonPostedPage] = useState(1);
  const [nonPostedLoading, setNonPostedLoading] = useState(false);
  const [activeNonPostedPill, setActiveNonPostedPill] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const buildDateRange = (period: string, cStart: string, cEnd: string) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date(); const today = fmt(now);
    if (period === "Today") return { date_from: today, date_to: today };
    if (period === "Yesterday") { const y = new Date(now); y.setDate(y.getDate() - 1); const ys = fmt(y); return { date_from: ys, date_to: ys }; }
    if (period === "WTD") { const m = new Date(now); m.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return { date_from: fmt(m), date_to: today }; }
    if (period === "MTD") { return { date_from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), date_to: today }; }
    if (period === "Custom Date") { return { date_from: cStart || undefined, date_to: cEnd || undefined }; }
    return {}; // "All Time" — no date bound
  };

  const filterParams = useCallback(
    () => {
      const dr = buildDateRange(timePeriod, customStartDate, customEndDate);
      return {
        bankName: selectedBank !== "All Banks" ? selectedBank : undefined,
        businessUnit: selectedBU !== "All BUs" ? selectedBU : undefined,
        approvedBy: selectedUser !== "All Users" ? selectedUser : undefined,
        dateFrom: (dr as any).date_from,
        dateTo: (dr as any).date_to,
        category: activePill || undefined,
      };
    },
    [selectedBank, selectedBU, selectedUser, timePeriod, customStartDate, customEndDate, activePill],
  );

  const fetchFilterOptions = useCallback(async (mode: "posted" | "non_posted") => {
    try {
      const res = await getExecutiveFilters(mode);
      setBankOptions(res.data.banks || []);
      setBuOptions(res.data.business_units || []);
      setPillDefs(res.data.pills || []);
      setUserOptions(res.data.users || []);
    } catch {
      // non-fatal — filter dropdowns just stay empty
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await getExecutiveSummary(filterParams());
      setSummary(res.data);
    } catch {
      setError("Could not load Executive Summary metrics.");
    }
  }, [filterParams]);

  const fetchRecords = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const res = await getExecutiveRecords({ ...filterParams(), page: pageNum, pageSize: PAGE_SIZE });
      setRecords(res.data.data || []);
      setTotal(res.data.total || 0);
      setPage(pageNum);
    } catch {
      setError("Could not load posted records.");
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  const nonPostedFilterParams = useCallback(
    () => {
      const dr = buildDateRange(timePeriod, customStartDate, customEndDate);
      return {
        bankName: selectedBank !== "All Banks" ? selectedBank : undefined,
        businessUnit: selectedBU !== "All BUs" ? selectedBU : undefined,
        approvedBy: selectedUser !== "All Users" ? selectedUser : undefined,
        dateFrom: (dr as any).date_from,
        dateTo: (dr as any).date_to,
        category: activeNonPostedPill || undefined,
      };
    },
    [selectedBank, selectedBU, selectedUser, timePeriod, customStartDate, customEndDate, activeNonPostedPill],
  );

  const fetchNonPostedSummary = useCallback(async () => {
    try {
      const res = await getNonPostedSummary(nonPostedFilterParams());
      setNonPostedSummary(res.data);
    } catch {
      setError("Could not load Non-Posted Overview metrics.");
    }
  }, [nonPostedFilterParams]);

  const fetchNonPostedRecords = useCallback(async (pageNum: number) => {
    setNonPostedLoading(true);
    try {
      const res = await getNonPostedRecords({ ...nonPostedFilterParams(), page: pageNum, pageSize: PAGE_SIZE });
      setNonPostedRecords(res.data.data || []);
      setNonPostedTotal(res.data.total || 0);
      setNonPostedPage(pageNum);
    } catch {
      setError("Could not load non-posted records.");
    } finally {
      setNonPostedLoading(false);
    }
  }, [nonPostedFilterParams]);

  const refreshNonPosted = useCallback(async () => {
    setError("");
    await Promise.all([fetchNonPostedSummary(), fetchNonPostedRecords(1)]);
  }, [fetchNonPostedSummary, fetchNonPostedRecords]);

  const refreshAll = useCallback(async () => {
    setError("");
    if (viewMode === "posted") {
      await Promise.all([fetchSummary(), fetchRecords(1)]);
    } else {
      await refreshNonPosted();
    }
  }, [viewMode, fetchSummary, fetchRecords, refreshNonPosted]);

  useEffect(() => {
    fetchFilterOptions(viewMode);
  }, [fetchFilterOptions, viewMode]);

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBank, selectedBU, selectedUser, timePeriod, customStartDate, customEndDate, activePill, activeNonPostedPill, viewMode]);

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const res = await exportExecutiveCsv(filterParams());
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "executive_summary_posted_records.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Could not export CSV.");
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setSelectedBank("All Banks");
    setSelectedBU("All BUs");
    setSelectedUser("All Users");
    setTimePeriod("All Time");
    setIsCustomDateActive(false);
    setCustomStartDate("");
    setCustomEndDate("");
    setActivePill(null);
    setActiveNonPostedPill(null);
  };

  const hasActiveFilters =
    selectedBank !== "All Banks" || selectedBU !== "All BUs" || selectedUser !== "All Users" ||
    timePeriod !== "All Time" || !!activePill || !!activeNonPostedPill;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="bg-white border border-gray-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-sm font-black text-primary uppercase tracking-wider">
            Executive Summary
          </h1>
          <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-2xl">
            {viewMode === "posted" ? (
              <>Audit view of every record actually posted to Oracle Fusion — Full Payment, Acceptable Short Payment, and Cross Currency are the only three categories that ever reach Oracle.</>
            ) : (
              <>Everything that has NOT yet reached Oracle — unidentified rows, rows awaiting remittance, conflicts/exceptions, Cross-OU exposure, rejections, and post failures.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-sm self-start sm:self-auto shrink-0">
          <button
            onClick={() => setViewMode("posted")}
            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-xs transition-all cursor-pointer ${viewMode === "posted" ? "bg-[#1E3A5F] text-white shadow-xs" : "text-gray-500 hover:text-primary"}`}
          >
            Posted Records
          </button>
          <button
            onClick={() => setViewMode("non_posted")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-xs transition-all cursor-pointer ${viewMode === "non_posted" ? "bg-[#1E3A5F] text-white shadow-xs" : "text-gray-500 hover:text-primary"}`}
          >
            <ShieldAlert size={11} /> Non-Posted Overview
          </button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="bg-red-50/50 border-l-4 border-red-600 text-gray-900 px-4 py-3.5 shadow-sm text-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-gray-400 hover:text-gray-600 px-2">×</button>
        </div>
      )}

      {/* FILTERS + TOTALS */}
      <div className="bg-white border border-gray-200 p-6 shadow-xs space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <h2 className="text-xs font-black text-primary uppercase tracking-wider">Filters</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {viewMode === "posted" ? (
                summary ? (
                  <>
                    <span className="font-bold text-primary">{summary.total_posted.toLocaleString()}</span> records posted ·{" "}
                    <span className="font-bold text-primary">{fmtAmount(summary.total_amount)}</span> total credited
                  </>
                ) : (
                  "Loading totals…"
                )
              ) : nonPostedSummary ? (
                <>
                  <span className="font-bold text-primary">{nonPostedSummary.total_non_posted.toLocaleString()}</span> records not yet posted
                </>
              ) : (
                "Loading totals…"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-primary px-3 py-2 cursor-pointer"
              >
                <X size={11} /> Clear Filters
              </button>
            )}
            <button
              onClick={refreshAll}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-primary border border-gray-200 px-3 py-2 rounded-sm cursor-pointer"
            >
              <RefreshCw size={11} /> Refresh
            </button>
            {viewMode === "posted" && (
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 bg-[#1E3A5F] hover:bg-[#172e4c] text-white px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {exporting ? "Exporting…" : "Download CSV"}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Landmark size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="w-full bg-white border border-gray-300 text-xs font-bold text-primary pl-9 pr-8 py-2.5 rounded-sm appearance-none focus:outline-none focus:border-accent cursor-pointer"
            >
              <option>All Banks</option>
              {bankOptions.map((o) => <option key={o}>{o}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          <div className="relative">
            <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={selectedBU}
              onChange={(e) => setSelectedBU(e.target.value)}
              className="w-full bg-white border border-gray-300 text-xs font-bold text-primary pl-9 pr-8 py-2.5 rounded-sm appearance-none focus:outline-none focus:border-accent cursor-pointer"
            >
              <option>All BUs</option>
              {buOptions.map((o) => <option key={o}>{o}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* USER — pill row, same pattern as the Home dashboard's user filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-gray-400 mr-1">
            <User size={12} /> User
          </span>
          <div className="flex flex-wrap items-center gap-1 bg-gray-100 p-1 rounded-sm">
            {["All Users", ...userOptions].map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setSelectedUser(u)}
                className={`px-3 py-1 text-[10px] font-bold rounded-xs transition-all cursor-pointer whitespace-nowrap ${
                  selectedUser === u ? "bg-[#1E3A5F] text-white shadow-xs" : "text-gray-500 hover:text-primary"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* TIME PERIOD */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-sm">
            {["All Time", "Today", "Yesterday", "WTD", "MTD", "Custom Date"].map((p) => (
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
              <Calendar size={12} className="text-gray-400" />
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-gray-50 border border-gray-300 rounded-sm text-[10px] font-bold text-gray-600 px-2 py-1 outline-none focus:border-accent"
              />
              <span className="text-[10px] font-bold text-gray-400">TO</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-gray-50 border border-gray-300 rounded-sm text-[10px] font-bold text-gray-600 px-2 py-1 outline-none focus:border-accent"
              />
            </div>
          )}
        </div>

        {/* AUDIT PILLS */}
        <div className="pt-2 border-t border-gray-100">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">
            {viewMode === "posted"
              ? "Posting Categories — click a pill to filter the ledger below"
              : "Non-Posted Categories — click a pill to filter the table below"}
          </h3>
          <div className="flex flex-wrap gap-2">
            {viewMode === "posted"
              ? (summary?.pills || pillDefs.map((p) => ({ ...p, count: 0 }))).map((pill) => {
                  const active = activePill === pill.key;
                  return (
                    <button
                      key={pill.key}
                      onClick={() => setActivePill(active ? null : pill.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-bold transition-all shadow-xs cursor-pointer ${
                        active ? "bg-[#1E3A5F] text-white border-[#1E3A5F]" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <span>{pill.label}</span>
                      <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                        {pill.count.toLocaleString()}
                      </span>
                    </button>
                  );
                })
              : (nonPostedSummary?.pills || []).map((pill) => {
                  const active = activeNonPostedPill === pill.key;
                  return (
                    <button
                      key={pill.key}
                      onClick={() => setActiveNonPostedPill(active ? null : pill.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-bold transition-all shadow-xs cursor-pointer ${
                        active ? "bg-[#dc2626] text-white border-[#dc2626]" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <span>{pill.label}</span>
                      <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                        {pill.count.toLocaleString()}
                      </span>
                    </button>
                  );
                })}
          </div>
        </div>
      </div>

      {/* POSTED LEDGER */}
      {viewMode === "posted" && (
      <div className="bg-white border border-gray-200 shadow-xs">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-xs font-black text-primary uppercase tracking-wider">Posted Records</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {total.toLocaleString()} record{total === 1 ? "" : "s"} match the current filters
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => page > 1 && fetchRecords(page - 1)}
              disabled={page <= 1 || loading}
              className="p-1.5 border border-gray-200 rounded-sm text-gray-500 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[11px] font-bold text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => page < totalPages && fetchRecords(page + 1)}
              disabled={page >= totalPages || loading}
              className="p-1.5 border border-gray-200 rounded-sm text-gray-500 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50/60 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <th className="text-left px-4 py-2.5">Posted Date</th>
                <th className="text-left px-4 py-2.5">Bank</th>
                <th className="text-left px-4 py-2.5">Business Unit</th>
                <th className="text-left px-4 py-2.5">OU</th>
                <th className="text-left px-4 py-2.5">Customer</th>
                <th className="text-left px-4 py-2.5">Invoice(s)</th>
                <th className="text-right px-4 py-2.5">Credit Amount</th>
                <th className="text-left px-4 py-2.5">Oracle Ref</th>
                <th className="text-left px-4 py-2.5">Audit Tags</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-gray-400">
                    <Loader2 size={18} className="animate-spin inline-block" />
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-gray-400 font-medium">
                    No posted records match the current filters.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.oracle_posted_at)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-bold text-primary">{r.bank_name}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.business_unit || "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.ou_number || "—"}</td>
                    <td className="px-4 py-2.5 max-w-[160px] truncate">{r.customer_name || "—"}</td>
                    <td className="px-4 py-2.5 max-w-[160px] truncate font-mono text-[11px]">{r.invoice_numbers || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-bold whitespace-nowrap">
                      {fmtAmount(r.credit_amount)} {r.statement_currency}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11px]">{r.oracle_ref_no || "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {r.tags.map((t) => (
                          <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold whitespace-nowrap">
                            {t.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* NON-POSTED OVERVIEW TABLE */}
      {viewMode === "non_posted" && (
      <div className="bg-white border border-gray-200 shadow-xs">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-xs font-black text-primary uppercase tracking-wider">Non-Posted Records</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {nonPostedTotal.toLocaleString()} record{nonPostedTotal === 1 ? "" : "s"} match the current filters
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => nonPostedPage > 1 && fetchNonPostedRecords(nonPostedPage - 1)}
              disabled={nonPostedPage <= 1 || nonPostedLoading}
              className="p-1.5 border border-gray-200 rounded-sm text-gray-500 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[11px] font-bold text-gray-500">
              Page {nonPostedPage} of {Math.max(1, Math.ceil(nonPostedTotal / PAGE_SIZE))}
            </span>
            <button
              onClick={() => nonPostedPage < Math.ceil(nonPostedTotal / PAGE_SIZE) && fetchNonPostedRecords(nonPostedPage + 1)}
              disabled={nonPostedPage >= Math.ceil(nonPostedTotal / PAGE_SIZE) || nonPostedLoading}
              className="p-1.5 border border-gray-200 rounded-sm text-gray-500 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50/60 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <th className="text-left px-4 py-2.5">Statement Date</th>
                <th className="text-left px-4 py-2.5">Bank</th>
                <th className="text-left px-4 py-2.5">Business Unit</th>
                <th className="text-left px-4 py-2.5">OU</th>
                <th className="text-left px-4 py-2.5">Customer</th>
                <th className="text-right px-4 py-2.5">Credit Amount</th>
                <th className="text-left px-4 py-2.5">Reason</th>
                <th className="text-left px-4 py-2.5">Category</th>
              </tr>
            </thead>
            <tbody>
              {nonPostedLoading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400">
                    <Loader2 size={18} className="animate-spin inline-block" />
                  </td>
                </tr>
              ) : nonPostedRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400 font-medium">
                    No non-posted records match the current filters.
                  </td>
                </tr>
              ) : (
                nonPostedRecords.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.statement_date)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-bold text-primary">{r.bank_name}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.business_unit || "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.ou_number || "—"}</td>
                    <td className="px-4 py-2.5 max-w-[160px] truncate">{r.extracted_customer_name || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-bold whitespace-nowrap">
                      {fmtAmount(r.credit_amount)} {r.statement_currency}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{r.reason_code || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded-full text-[10px] font-bold whitespace-nowrap">
                        {r.category_label}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}