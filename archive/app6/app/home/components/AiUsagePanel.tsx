"use client";
import type { AiUsageSummary, AiUsageTotals } from "@/lib/ai-usage/api";
import { downloadAiUsageCsv } from "@/lib/ai-usage/api";

interface AiUsagePanelProps {
  aiUsage: AiUsageSummary | null;
  aiTotals: AiUsageTotals | null;
  aiPanelVisible: boolean;
  setAiPanelVisible: (updater: (v: boolean) => boolean) => void;
  aiScope: { runId?: number; dateFrom?: string; dateTo?: string };
  showSuccess: (msg: string) => void;
  setError: (msg: string) => void;
}

/** "AI Run Details" — Layer 2B AI extraction token consumption and cost breakdown. */
export default function AiUsagePanel({
  aiUsage, aiTotals, aiPanelVisible, setAiPanelVisible, aiScope, showSuccess, setError,
}: AiUsagePanelProps) {
  return (
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
  );
}
