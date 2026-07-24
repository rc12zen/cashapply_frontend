"use client";
/**
 * AI Usage — /app/ai-usage/page.tsx
 * ====================================
 * Standalone page (moved out of the Home dashboard, where it lived embedded
 * inside DashboardMetricsCard as "AI Run Details"). Styled per the
 * AI_Usage_Cost_Section.html reference: front-and-center stat tiles, then a
 * collapsed-by-default "Technical details" section for the model/token/
 * latency specifics most people don't need at a glance.
 *
 * Filters: period pills (mirroring the Overview page's) + a User dropdown —
 * both apply to the main summary tiles and the per-model breakdown. Backed
 * by GET /api/ai-usage/summary's new `user` param, which matches
 * AnalysisRun.triggered_by (same convention as the Overview page's User
 * filter) and is ignored whenever a specific run is pinned.
 *
 * "Last 5 Analyses" below shows per-run AI cost/usage for the most recent
 * completed runs (GET /api/ai-usage/recent) — also respects the User filter.
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Download, Sparkles, User as UserIcon } from "lucide-react";
import {
  getAiUsageSummary, getAiUsageTotals, downloadAiUsageCsv, getAiUsageRecentRuns,
  type AiUsageSummary, type AiUsageTotals, type AiUsageRecentRun,
} from "@/lib/ai-usage/api";
import { getFilterOptions } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";

const PERIODS = ["Last Analysis", "Today", "Yesterday", "WTD", "MTD", "Custom Date"];

function buildDateRange(period: string, cStart: string, cEnd: string) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date(); const today = fmt(now);
  if (period === "Today") return { date_from: today, date_to: today };
  if (period === "Yesterday") { const y = new Date(now); y.setDate(y.getDate() - 1); const ys = fmt(y); return { date_from: ys, date_to: ys }; }
  if (period === "WTD") { const m = new Date(now); m.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return { date_from: fmt(m), date_to: today }; }
  if (period === "MTD") { return { date_from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), date_to: today }; }
  if (period === "Custom Date") { return { date_from: cStart || undefined, date_to: cEnd || undefined }; }
  return { date_from: undefined, date_to: undefined };
}

import { usePageGuard } from "@/lib/usePageGuard";
import PageAccessDenied from "@/components/PageAccessDenied";

export default function AiUsagePage() {
  const { allowed, checking } = usePageGuard("run:view");
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [totals, setTotals]   = useState<AiUsageTotals | null>(null);
  const [recentRuns, setRecentRuns] = useState<AiUsageRecentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [techOpen, setTechOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [timePeriod, setTimePeriod] = useState("Last Analysis");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState("");
  const [userOptions, setUserOptions] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState("All Users");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const userFilter = selectedUser !== "All Users" ? selectedUser : undefined;
      let dateFrom: string | undefined, dateTo: string | undefined;
      if (timePeriod !== "Last Analysis") {
        const dr = buildDateRange(timePeriod, customStart, customEnd);
        dateFrom = dr.date_from; dateTo = dr.date_to;
      }
      const [s, t, r] = await Promise.all([
        getAiUsageSummary(undefined, dateFrom, dateTo, userFilter),
        getAiUsageTotals(),
        getAiUsageRecentRuns(userFilter, 5),
      ]);
      setSummary(s.data);
      setTotals(t.data);
      setRecentRuns(r.data.runs ?? []);
      setError("");
    } catch (e) {
      setError(getErrorMessage(e, "Could not load AI usage data."));
    } finally {
      setLoading(false);
    }
  }, [timePeriod, customStart, customEnd, selectedUser]);

  useEffect(() => {
    getFilterOptions().then((res) => setUserOptions(res.data.users || [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fmtCost = (v: number | undefined) => `$${(v ?? 0).toFixed(4)}`;
  const fmtTokens = (v: number | undefined) => (v ?? 0).toLocaleString();

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const userFilter = selectedUser !== "All Users" ? selectedUser : undefined;
      let dateFrom: string | undefined, dateTo: string | undefined;
      if (timePeriod !== "Last Analysis") {
        const dr = buildDateRange(timePeriod, customStart, customEnd);
        dateFrom = dr.date_from; dateTo = dr.date_to;
      }
      await downloadAiUsageCsv(undefined, dateFrom, dateTo, userFilter);
    } catch (e) {
      setError(getErrorMessage(e, "Failed to download AI usage CSV."));
    } finally {
      setDownloading(false);
    }
  };

  if (checking) return null;
  if (!allowed) return <PageAccessDenied />;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-[#222222] flex items-center gap-2">
          <Sparkles size={18} className="text-[#222222]" /> AI Usage
        </h1>
        {/* <p className="text-sm text-[#6B7688] mt-1">
          Token consumption and cost from Claude's Layer 2B AI extraction fallback, across all analyses.
        </p> */}
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2.5 rounded">
          {error}
        </div>
      )}

      {/* Filters — period pills + user, mirroring the Overview page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-sm w-max">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setTimePeriod(p)}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xs transition-all cursor-pointer whitespace-nowrap ${timePeriod === p ? "bg-[#222222] text-white shadow-xs" : "text-gray-500 hover:text-[#222222]"}`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-56">
          <UserIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full bg-white border border-gray-300 text-xs font-bold text-[#222222] pl-8 pr-7 py-2 rounded-sm appearance-none focus:outline-none focus:border-[#222222] cursor-pointer"
          >
            <option>All Users</option>
            {userOptions.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      {timePeriod === "Custom Date" && (
        <div className="flex items-center gap-2 text-xs">
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
            className="border border-gray-300 rounded-sm px-2 py-1.5 text-xs" />
          <span className="text-gray-400">to</span>
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
            className="border border-gray-300 rounded-sm px-2 py-1.5 text-xs" />
        </div>
      )}

      {loading && !summary ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-start justify-between px-5 pt-[18px] pb-4 border-b border-gray-100">
            <div>
              <p className="text-[15px] font-bold text-[#222222] mb-1">AI Usage &amp; Cost</p>
              <p className="text-[13px] text-[#6B7688]">
                How much CashApply has relied on AI, and what it's cost, for the selected period and user
                {summary && summary.call_count === 0 ? " — no AI fallback calls in this scope (Layer 2A regex resolved everything)." : "."}
              </p>
            </div>
            <div className="flex items-center gap-4 pt-0.5 shrink-0">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="text-xs text-[#222222] hover:underline cursor-pointer disabled:opacity-50 flex items-center gap-1 font-bold"
              >
                <Download size={12} /> {downloading ? "Downloading…" : "Download CSV"}
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100">
            <div className="bg-[#F7FAFF] p-5">
              <div className="text-[11px] font-bold tracking-wide text-[#8A93A6] uppercase mb-2">Cost (Selected Scope)</div>
              <div className="text-[22px] font-bold text-[#1F9254]">{fmtCost(summary?.total_cost_usd)}</div>
            </div>
            <div className="bg-white p-5">
              <div className="text-[11px] font-bold tracking-wide text-[#8A93A6] uppercase mb-2">Cost This Month</div>
              <div className="text-[22px] font-bold text-[#1F9254]">{fmtCost(totals?.month_cost_usd)}</div>
            </div>
            <div className="bg-white p-5">
              <div className="text-[11px] font-bold tracking-wide text-[#8A93A6] uppercase mb-2">Total Cost to Date</div>
              <div className="text-[22px] font-bold text-[#1F9254]">{fmtCost(totals?.all_time_cost_usd)}</div>
            </div>
            <div className="bg-white p-5">
              <div className="text-[11px] font-bold tracking-wide text-[#8A93A6] uppercase mb-2">Times AI Was Used</div>
              <div className="text-[22px] font-bold text-[#222222]">{(summary?.call_count ?? 0).toLocaleString()}</div>
              <div className="text-[11px] text-[#9AA3B5] mt-1">In the selected scope</div>
            </div>
          </div>

          {/* Per-model breakdown, when there's more than a trivial amount of usage */}
          {summary && summary.by_model.length > 0 && (
            <div className="px-5 py-4 border-t border-gray-100 space-y-2">
              <div className="text-[11px] font-bold text-[#8A93A6] uppercase tracking-wide">By Model</div>
              {summary.by_model.map((m) => (
                <div key={m.model} className="flex items-center justify-between text-[13px]">
                  <span className="font-semibold text-[#222222]">{m.model}</span>
                  <span className="text-[#6B7688]">
                    {m.call_count.toLocaleString()} calls · {(m.input_tokens + m.output_tokens).toLocaleString()} tok ·{" "}
                    <span className="text-[#1F9254] font-bold">{fmtCost(m.cost_usd)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Technical details — collapsed by default */}
          <button
            onClick={() => setTechOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-5 py-[13px] text-xs font-bold tracking-wide text-[#6B7688] uppercase bg-gray-50 border-t border-gray-100 cursor-pointer"
          >
            <ChevronRight size={11} className={`text-[#8A93A6] transition-transform ${techOpen ? "rotate-90" : ""}`} />
            Technical details
          </button>
          {techOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 px-5 pt-[18px] pb-[22px]">
              <div>
                <div className="text-[11px] font-bold text-[#8A93A6] uppercase tracking-wide mb-1.5">AI Model</div>
                <div className="text-sm font-semibold text-[#222222]">{summary?.model ?? "—"}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#8A93A6] uppercase tracking-wide mb-1.5">Data Processed</div>
                <div className="text-sm font-semibold text-[#222222]">
                  {fmtTokens(summary?.total_input_tokens)} in · {fmtTokens(summary?.total_output_tokens)} out
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#8A93A6] uppercase tracking-wide mb-1.5">Avg Response Time</div>
                <div className="text-sm font-semibold text-[#222222]">
                  {summary?.avg_latency_ms != null ? `${(summary.avg_latency_ms / 1000).toFixed(1)} sec` : "—"}
                </div>
              </div>
              <div className="col-span-full text-xs text-[#9AA3B5] bg-gray-50 rounded-md px-3.5 py-2.5">
                ⓘ&nbsp; "Data Processed" is measured in tokens — the AI's unit of usage, similar to minutes on a phone plan.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Last 5 Analyses */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-[15px] font-bold text-[#222222] mb-1">Last 5 Analyses</p>
          <p className="text-[13px] text-[#6B7688]">
            AI cost and usage for the most recent completed runs{selectedUser !== "All Users" ? ` by ${selectedUser}` : ""}.
          </p>
        </div>
        {recentRuns.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-gray-400">No completed analyses yet.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Run", "Completed", "Started By", "Model", "AI Calls", "Tokens", "Cost"].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => (
                <tr key={r.run_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-5 py-3 text-xs font-mono font-bold text-[#222222]">
                    <a href={`/analysis-history/row/${r.run_id}`} className="hover:underline">#{r.run_id}</a>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{r.triggered_by || "—"}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">{r.model || "—"}</td>
                  <td className="px-5 py-3 text-xs font-bold text-[#222222]">{r.call_count.toLocaleString()}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">{r.total_tokens.toLocaleString()}</td>
                  <td className="px-5 py-3 text-xs font-bold text-[#1F9254]">{fmtCost(r.total_cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
