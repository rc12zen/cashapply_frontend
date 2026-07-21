"use client";
/**
 * Shortage & Reconciliation Audit — /app/shortage-review
 *
 * Finance team post-processing hub for all Processed records.
 * Split into two tabs:
 *   Tab A — Shortage Records (88–99.9%): residual balance remains in Oracle
 *   Tab B — Fully Cleared (100%): no action needed, read-only archive
 *
 * Data source: GET /api/results/processed-shortage-summary
 */
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, CheckCircle2,
  Download, ExternalLink, RefreshCw, Search, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getProcessedShortages, getFilterOptions } from "@/lib/api";
import { usePageGuard } from "@/lib/usePageGuard";
import PageAccessDenied from "@/components/PageAccessDenied";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApplicationRecord {
  invoice_number:    string;
  amount_outstanding: number;
  amount_applied:    number;
  shortage_amount:   number;
  is_full_payment:   boolean;
  status:            string;
  application_id:    string | null;
  error:             string | null;
}

interface ProcessedRecord {
  id:                  number;
  run_id:              number;
  bank_name:           string;
  statement_date:      string;
  narrative:           string;
  bank_reference:      string;
  credit_amount:       number;
  currency:            string;
  customer_name:       string;
  primary_invoice:     string;
  sum_outstanding:     number;
  oracle_ref_no:       string | null;
  standard_receipt_id: string | null;
  oracle_posted_at:    string | null;
  variance:            number;
  ratio_pct:           number;
  is_full_payment:     boolean;
  total_shortage:      number;
  business_unit:       string;
  applications:        ApplicationRecord[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dp = 2) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}

// Same preset logic as home / analysis-history / executive-summary pages —
// kept local rather than imported since none of those export it.
const TIME_PERIODS = ["All Time", "Today", "Yesterday", "WTD", "MTD", "Custom Date"] as const;

function buildDateRange(period: string, cStart: string, cEnd: string) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date(); const today = fmt(now);
  if (period === "Today") return { date_from: today, date_to: today };
  if (period === "Yesterday") { const y = new Date(now); y.setDate(y.getDate() - 1); const ys = fmt(y); return { date_from: ys, date_to: ys }; }
  if (period === "WTD") { const m = new Date(now); m.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return { date_from: fmt(m), date_to: today }; }
  if (period === "MTD") { return { date_from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), date_to: today }; }
  if (period === "Custom Date") { return { date_from: cStart || undefined, date_to: cEnd || undefined }; }
  return {};
}

// ── Shortage Detail Drawer ────────────────────────────────────────────────────

function ShortageDrawer({ record, onClose }: { record: ProcessedRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-xs" onClick={onClose} />
      {/* Drawer */}
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#222222] text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-0.5">Shortage Review</div>
            <div className="text-sm font-black uppercase tracking-wider">ID {record.id}</div>
            <div className="text-[10px] text-gray-300 font-mono mt-0.5 truncate max-w-xs">{record.narrative}</div>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-2 rounded-sm cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Summary comparison */}
          <div className="bg-amber-50 border border-amber-200 rounded-sm p-4">
            <div className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-3">
              Comparative Ledger Summary
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white border border-amber-100 rounded-xs px-3 py-2.5">
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Total Outstanding</div>
                <div className="text-[13px] font-mono font-black text-[#222222]">{fmt(record.sum_outstanding)}</div>
                <div className="text-[9px] text-gray-400 mt-0.5">{record.currency} · Ageing Report</div>
              </div>
              <div className="bg-white border border-amber-100 rounded-xs px-3 py-2.5">
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Total Applied</div>
                <div className="text-[13px] font-mono font-black text-emerald-700">{fmt(record.credit_amount)}</div>
                <div className="text-[9px] text-gray-400 mt-0.5">{record.currency} · Bank Credit</div>
              </div>
              <div className="bg-amber-100 border border-amber-300 rounded-xs px-3 py-2.5">
                <div className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Variance Gap</div>
                <div className="text-[13px] font-mono font-black text-amber-700">{fmt(record.total_shortage)}</div>
                <div className="text-[9px] text-amber-600 mt-0.5">{record.ratio_pct.toFixed(2)}% applied</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-amber-200 text-[10px] text-amber-700 font-medium leading-relaxed">
              A residual balance of <span className="font-black">{fmt(record.total_shortage)} {record.currency}</span> remains
              open in Oracle Fusion AR. Please log into the Oracle Fusion portal to resolve
              this balance via a dispute, markdown, or write-off.
            </div>
          </div>

          {/* Oracle receipt details */}
          <div>
            <div className="text-[10px] font-black text-[#222222] uppercase tracking-wider mb-2">Oracle Receipt</div>
            <div className="bg-gray-50 border border-gray-200 rounded-sm divide-y divide-gray-100 text-[11px]">
              {[
                ["Receipt Number",      record.oracle_ref_no],
                ["Standard Receipt ID", record.standard_receipt_id],
                ["Posted At",           fmtDate(record.oracle_posted_at)],
                ["Business Unit",       record.business_unit],
                ["Bank Reference",      record.bank_reference],
              ].map(([label, val]) => (
                <div key={label as string} className="flex items-center justify-between px-3 py-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
                  <span className="font-mono font-bold text-primary">{val || "—"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-invoice application breakdown */}
          {record.applications.length > 0 && (
            <div>
              <div className="text-[10px] font-black text-[#222222] uppercase tracking-wider mb-2">
                Invoice Application Breakdown
              </div>
              <div className="border border-gray-200 rounded-sm overflow-hidden">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="bg-[#222222] text-white">
                      {["Invoice #","Outstanding","Applied","Shortage","Status"].map(h => (
                        <th key={h} className={`px-3 py-2 text-[9px] font-black uppercase tracking-wider ${
                          h === "Invoice #" ? "text-left" : "text-right"
                        } ${h === "Status" ? "text-center" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {record.applications.map((app, i) => (
                      <tr key={i} className={app.is_full_payment ? "bg-emerald-50/40" : "bg-amber-50/40"}>
                        <td className="px-3 py-2 font-mono font-bold text-[#222222]">{app.invoice_number}</td>
                        <td className="px-3 py-2 font-mono text-right text-gray-500">{fmt(app.amount_outstanding)}</td>
                        <td className="px-3 py-2 font-mono font-bold text-right text-emerald-700">{fmt(app.amount_applied)}</td>
                        <td className={`px-3 py-2 font-mono font-bold text-right ${app.shortage_amount > 0.01 ? "text-amber-700" : "text-emerald-600"}`}>
                          {app.shortage_amount > 0.01 ? fmt(app.shortage_amount) : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-xs ${
                            app.status === "SUCCESS"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}>
                            {app.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                    <tr>
                      <td className="px-3 py-1.5 text-[9px] font-black text-gray-500 uppercase">Total</td>
                      <td className="px-3 py-1.5 font-mono font-black text-right text-gray-600">
                        {fmt(record.applications.reduce((s, a) => s + a.amount_outstanding, 0))}
                      </td>
                      <td className="px-3 py-1.5 font-mono font-black text-right text-emerald-700">
                        {fmt(record.applications.reduce((s, a) => s + a.amount_applied, 0))}
                      </td>
                      <td className="px-3 py-1.5 font-mono font-black text-right text-amber-700">
                        {fmt(record.total_shortage)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Revisit action */}
          <div className="border border-amber-200 bg-amber-50 rounded-sm p-4 flex items-start gap-3">
            <ArrowUpRight size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">
                Action Required in Oracle Fusion
              </div>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Navigate to Oracle Fusion AR → Receipts → search for receipt{" "}
                <span className="font-mono font-black">{record.oracle_ref_no}</span>.
                Apply the residual balance of{" "}
                <span className="font-black">{fmt(record.total_shortage)} {record.currency}</span>{" "}
                via a Dispute, Credit Memo, or Write-off as appropriate.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type TabKey = "shortage" | "full_payment";

export default function ShortageReviewPage() {
  return (
    <Suspense fallback={null}>
      <ShortageReviewPageInner />
    </Suspense>
  );
}

function ShortageReviewPageInner() {
  const { allowed, checking } = usePageGuard("canViewData");
  const router       = useRouter();
  const searchParams = useSearchParams();
  const runId        = searchParams.get("run_id") ? Number(searchParams.get("run_id")) : undefined;

  const [data, setData]         = useState<{ shortage: { rows: ProcessedRecord[] }; full_payment: { rows: ProcessedRecord[] }; total: number } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("shortage");
  const [search, setSearch]     = useState("");
  const [drawer, setDrawer]     = useState<ProcessedRecord | null>(null);

  // ── Timeline + Bank/BU filters (previously this page had none at all) ──────
  const [timePeriod, setTimePeriod]           = useState<(typeof TIME_PERIODS)[number]>("All Time");
  const [customStart, setCustomStart]         = useState("");
  const [customEnd, setCustomEnd]             = useState("");
  const [bankOptions, setBankOptions]         = useState<string[]>([]);
  const [buOptions, setBuOptions]             = useState<string[]>([]);
  const [selectedBank, setSelectedBank]       = useState("All Banks");
  const [selectedBU, setSelectedBU]           = useState("All BUs");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dr = buildDateRange(timePeriod, customStart, customEnd);
      const bankFilter = selectedBank !== "All Banks" ? selectedBank : undefined;
      const buFilter   = selectedBU   !== "All BUs"   ? selectedBU   : undefined;
      const res = await getProcessedShortages(
        runId, (dr as any).date_from, (dr as any).date_to, bankFilter, buFilter,
      );
      setData(res.data);
    } catch {
      setData(null);
    }
    setLoading(false);
  }, [runId, timePeriod, customStart, customEnd, selectedBank, selectedBU]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getFilterOptions(runId).then((res) => {
      setBankOptions(res.data.banks || []);
      setBuOptions(res.data.business_units || []);
    }).catch(() => {});
  }, [runId]);

  const activeRows = useMemo(() => {
    const rows = activeTab === "shortage"
      ? data?.shortage.rows || []
      : data?.full_payment.rows || [];
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.narrative?.toLowerCase().includes(q) ||
      r.primary_invoice?.toLowerCase().includes(q) ||
      r.customer_name?.toLowerCase().includes(q) ||
      String(r.id).includes(q)
    );
  }, [data, activeTab, search]);

  const exportCSV = () => {
    if (!activeRows.length) return;
    const cols = ["id","bank_name","statement_date","customer_name","primary_invoice",
                  "credit_amount","sum_outstanding","variance","ratio_pct","oracle_ref_no","oracle_posted_at"];
    const h = cols.join(",");
    const r = activeRows.map(row =>
      cols.map(c => `"${(row as any)[c] ?? ""}"`).join(",")
    ).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([h + "\n" + r], { type: "text/csv" }));
    a.download = `shortage_review_${activeTab}.csv`;
    a.click();
  };

  const backHref = runId ? `/analysis-history?run_id=${runId}` : "/analysis-history";

  const shortageCount     = data?.shortage.rows.length || 0;
  const fullPaymentCount  = data?.full_payment.rows.length || 0;
  const totalShortageAmt  = (data?.shortage.rows || []).reduce((s, r) => s + r.total_shortage, 0);

  if (checking) return null;
  if (!allowed) return <PageAccessDenied />;

  return (
    <>
      {drawer && <ShortageDrawer record={drawer} onClose={() => setDrawer(null)} />}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <button onClick={() => router.push(backHref)}
              className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 hover:text-[#222222] uppercase tracking-wider cursor-pointer mb-2 transition-colors">
              <ArrowLeft size={12} className="stroke-[3]" /> Back to Analysis History
            </button>
            <h1 className="text-xl font-black text-[#222222] uppercase tracking-wider">
              Shortage & Reconciliation Audit
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              All Processed records — track residual balances requiring Oracle Fusion action
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#222222] cursor-pointer border border-gray-300 hover:border-[#222222] px-3 py-2 rounded-sm transition-colors">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button onClick={exportCSV}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider bg-[#222222] hover:bg-[#222222] text-white px-4 py-2 rounded-sm transition-colors cursor-pointer">
              <Download size={13} /> Export CSV
            </button>
          </div>
        </div>

        {/* Summary KPI strip */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-amber-50 border border-amber-200 rounded-sm px-4 py-3">
            <div className="text-[9px] font-black text-amber-600 uppercase tracking-wider mb-0.5">Shortage Records</div>
            <div className="text-2xl font-black text-amber-700">{shortageCount}</div>
            <div className="text-[10px] text-amber-600 mt-0.5">Require Oracle attention</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-sm px-4 py-3">
            <div className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-0.5">Fully Cleared</div>
            <div className="text-2xl font-black text-emerald-700">{fullPaymentCount}</div>
            <div className="text-[10px] text-emerald-600 mt-0.5">No action required</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-sm px-4 py-3">
            <div className="text-[9px] font-black text-red-500 uppercase tracking-wider mb-0.5">Total Variance</div>
            <div className="text-2xl font-black text-red-600">{fmt(totalShortageAmt)}</div>
            <div className="text-[10px] text-red-500 mt-0.5">Across all shortage records</div>
          </div>
        </div>

        {/* Timeline + Bank/BU filter bar */}
        <div className="bg-white border border-gray-200 rounded-sm p-3 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xs w-max overflow-x-auto">
            {TIME_PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setTimePeriod(p)}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xs transition-all cursor-pointer whitespace-nowrap ${
                  timePeriod === p ? "bg-[#222222] text-white shadow-xs" : "text-gray-500 hover:text-primary"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {timePeriod === "Custom Date" && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="bg-gray-50 border border-gray-300 rounded-sm text-xs font-bold text-primary px-2 py-1.5 outline-none focus:border-[#222222]" />
              <span className="text-[10px] text-gray-400 font-black uppercase">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-gray-50 border border-gray-300 rounded-sm text-xs font-bold text-primary px-2 py-1.5 outline-none focus:border-[#222222]" />
            </div>
          )}

          <div className="flex items-center gap-2 lg:ml-auto">
            <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)}
              className="bg-gray-50 border border-gray-300 text-xs font-bold text-primary px-3 py-1.5 rounded-sm outline-none focus:border-[#222222] cursor-pointer">
              <option>All Banks</option>
              {bankOptions.map((b) => <option key={b}>{b}</option>)}
            </select>
            <select value={selectedBU} onChange={(e) => setSelectedBU(e.target.value)}
              className="bg-gray-50 border border-gray-300 text-xs font-bold text-primary px-3 py-1.5 rounded-sm outline-none focus:border-[#222222] cursor-pointer">
              <option>All BUs</option>
              {buOptions.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
        </div>

        {/* Tab + Search bar */}
        <div className="bg-white border border-gray-200 rounded-sm p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xs">
            <button onClick={() => setActiveTab("shortage")}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${
                activeTab === "shortage"
                  ? "bg-amber-500 text-white shadow-xs"
                  : "text-gray-500 hover:text-amber-600"
              }`}>
              <AlertTriangle size={11} />
              Shortage Records
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                activeTab === "shortage" ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
              }`}>{shortageCount}</span>
            </button>
            <button onClick={() => setActiveTab("full_payment")}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${
                activeTab === "full_payment"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-gray-500 hover:text-emerald-700"
              }`}>
              <CheckCircle2 size={11} />
              Fully Cleared
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                activeTab === "full_payment" ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
              }`}>{fullPaymentCount}</span>
            </button>
          </div>
          <div className="relative w-full sm:w-64">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search narrative, invoice, customer…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-gray-300 text-[11px] pl-8 pr-3 py-2 rounded-sm focus:outline-none focus:border-[#222222]" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-3">
              <RefreshCw size={20} className="animate-spin" />
              <span className="text-sm font-bold">Loading…</span>
            </div>
          ) : activeRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
              <CheckCircle2 size={40} className={activeTab === "shortage" ? "text-amber-300" : "text-emerald-300"} />
              <span className="text-sm font-black uppercase tracking-wider">
                {activeTab === "shortage" ? "No shortage records" : "No fully cleared records"}
              </span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-[#222222] text-white">
                    {(activeTab === "shortage"
                      ? ["ID","Bank","Date","Customer","Invoice(s)","Outstanding","Applied","Shortage","Ratio %","Oracle Ref","Posted At","Action"]
                      : ["ID","Bank","Date","Customer","Invoice(s)","Outstanding","Applied","Ratio %","Oracle Ref","Standard Receipt ID","Posted At"]
                    ).map(h => (
                      <th key={h} className={`px-3 py-2.5 text-[9px] font-black uppercase tracking-wider bg-[#222222] ${
                        ["Outstanding","Applied","Shortage"].includes(h) ? "text-right" : ""
                      }`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px]">
                  {activeRows.map((row, i) => (
                    <tr key={row.id}
                      className={`transition-colors hover:bg-gray-50/80 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}>
                      <td className="px-3 py-3 font-mono font-bold text-[#222222]">#{row.id}</td>
                      <td className="px-3 py-3 font-bold text-primary whitespace-nowrap">{row.bank_name}</td>
                      <td className="px-3 py-3 font-mono text-gray-500 whitespace-nowrap">{row.statement_date}</td>
                      <td className="px-3 py-3 text-gray-700 max-w-[160px] truncate" title={row.customer_name}>{row.customer_name || "—"}</td>
                      <td className="px-3 py-3 font-mono text-gray-500 max-w-[180px] truncate" title={row.primary_invoice}>{row.primary_invoice || "—"}</td>
                      <td className="px-3 py-3 font-mono font-bold text-right text-[#222222]">{fmt(row.sum_outstanding)}</td>
                      <td className="px-3 py-3 font-mono font-bold text-right text-emerald-700">{fmt(row.credit_amount)}</td>
                      {activeTab === "shortage" && (
                        <td className="px-3 py-3 font-mono font-bold text-right text-amber-700">{fmt(row.total_shortage)}</td>
                      )}
                      <td className="px-3 py-3 text-center">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                          row.is_full_payment
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {row.ratio_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-gray-500 text-[10px] max-w-[160px] truncate">{row.oracle_ref_no || "—"}</td>
                      {activeTab === "full_payment" && (
                        <td className="px-3 py-3 font-mono text-gray-400 text-[10px] max-w-[160px] truncate">{row.standard_receipt_id || "—"}</td>
                      )}
                      <td className="px-3 py-3 font-mono text-gray-400 text-[10px] whitespace-nowrap">{fmtDate(row.oracle_posted_at)}</td>
                      {activeTab === "shortage" && (
                        <td className="px-3 py-3">
                          <button onClick={() => setDrawer(row)}
                            className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-xs cursor-pointer transition-colors whitespace-nowrap">
                            <ExternalLink size={10} /> Revisit in Fusion
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer note for shortage tab */}
        {activeTab === "shortage" && !loading && shortageCount > 0 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-sm px-4 py-3 text-[11px] text-amber-700">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-500" />
            <span>
              <span className="font-black">{shortageCount} record{shortageCount !== 1 ? "s" : ""}</span> have residual balances
              in Oracle Fusion AR. Click <span className="font-black">Revisit in Fusion</span> on each row to view the full
              variance breakdown and take action in Oracle.
            </span>
          </div>
        )}
      </div>
    </>
  );
}