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
 * Not run-scoped (there's no specific analysis run being viewed here) — shows
 * this month + all-time totals from GET /api/ai-usage/totals, and the
 * overall model/token breakdown from GET /api/ai-usage/summary (no scope =
 * all-time, per that endpoint's own contract).
 */
import { useEffect, useState } from "react";
import { ChevronRight, Download, Sparkles } from "lucide-react";
import {
  getAiUsageSummary, getAiUsageTotals, downloadAiUsageCsv,
  type AiUsageSummary, type AiUsageTotals,
} from "@/lib/ai-usage/api";
import { getErrorMessage } from "@/lib/errorMessage";

export default function AiUsagePage() {
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [totals, setTotals]   = useState<AiUsageTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [techOpen, setTechOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([getAiUsageSummary(), getAiUsageTotals()])
      .then(([s, t]) => { setSummary(s.data); setTotals(t.data); })
      .catch((e) => setError(getErrorMessage(e, "Could not load AI usage data.")))
      .finally(() => setLoading(false));
  }, []);

  const fmtCost = (v: number | undefined) => `$${(v ?? 0).toFixed(4)}`;
  const fmtTokens = (v: number | undefined) => (v ?? 0).toLocaleString();

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadAiUsageCsv();
    } catch (e) {
      setError(getErrorMessage(e, "Failed to download AI usage CSV."));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-[#222222] flex items-center gap-2">
          <Sparkles size={18} className="text-[#222222]" /> AI Usage
        </h1>
        <p className="text-sm text-[#6B7688] mt-1">
          Token consumption and cost from Claude's Layer 2B AI extraction fallback, across all analyses.
        </p>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2.5 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white border border-[#E3E7ED] rounded-lg overflow-hidden">
          <div className="flex items-start justify-between px-5 pt-[18px] pb-4 border-b border-[#E3E7ED]">
            <div>
              <p className="text-[15px] font-bold text-[#222222] mb-1">AI Usage &amp; Cost</p>
              <p className="text-[13px] text-[#6B7688]">
                How much CashApply has relied on AI, and what it's cost so far
                {summary && summary.call_count === 0 ? " — no AI fallback calls have been needed yet (Layer 2A regex has resolved everything)." : "."}
              </p>
            </div>
            <div className="flex items-center gap-4 pt-0.5 shrink-0">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="text-xs text-[#222222] hover:underline cursor-pointer disabled:opacity-50 flex items-center gap-1"
              >
                <Download size={12} /> {downloading ? "Downloading…" : "Download CSV"}
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#F0F2F6]">
            <div className="bg-[#F7FAFF] p-5">
              <div className="text-[11px] font-bold tracking-wide text-[#8A93A6] uppercase mb-2">Total Cost to Date</div>
              <div className="text-[22px] font-bold text-[#1F9254]">{fmtCost(totals?.all_time_cost_usd)}</div>
            </div>
            <div className="bg-white p-5">
              <div className="text-[11px] font-bold tracking-wide text-[#8A93A6] uppercase mb-2">Cost This Month</div>
              <div className="text-[22px] font-bold text-[#1F9254]">{fmtCost(totals?.month_cost_usd)}</div>
            </div>
            <div className="bg-white p-5">
              <div className="text-[11px] font-bold tracking-wide text-[#8A93A6] uppercase mb-2">AI Calls This Month</div>
              <div className="text-[22px] font-bold text-[#222222]">{(totals?.month_call_count ?? 0).toLocaleString()}</div>
              <div className="text-[11px] text-[#9AA3B5] mt-1">{fmtTokens(totals?.month_tokens)} tokens</div>
            </div>
            <div className="bg-white p-5">
              <div className="text-[11px] font-bold tracking-wide text-[#8A93A6] uppercase mb-2">AI Calls All Time</div>
              <div className="text-[22px] font-bold text-[#222222]">{(totals?.all_time_call_count ?? 0).toLocaleString()}</div>
              <div className="text-[11px] text-[#9AA3B5] mt-1">{fmtTokens(totals?.all_time_tokens)} tokens</div>
            </div>
          </div>

          {/* Per-model breakdown, when there's more than a trivial amount of usage */}
          {summary && summary.by_model.length > 0 && (
            <div className="px-5 py-4 border-t border-[#E3E7ED] space-y-2">
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
            className="w-full flex items-center gap-2 px-5 py-[13px] text-xs font-bold tracking-wide text-[#6B7688] uppercase bg-[#FAFBFC] border-t border-[#E3E7ED] cursor-pointer"
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
              <div className="col-span-full text-xs text-[#9AA3B5] bg-[#F4F6F9] rounded-md px-3.5 py-2.5">
                ⓘ&nbsp; "Data Processed" is measured in tokens — the AI's unit of usage, similar to minutes on a phone plan.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
