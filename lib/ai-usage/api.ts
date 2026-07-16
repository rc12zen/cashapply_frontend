/**
 * lib/ai-usage/api.ts
 * =====================
 * AI token consumption + cost tracking — backs the dashboard's
 * "AI Run Details" panel (app/home/page.tsx), which previously
 * showed entirely hardcoded placeholder values (Model, Tokens In/Out,
 * Estimated Cost, Latency were static strings, never fetched from
 * anywhere). Real data now comes from GET /api/ai-usage/summary, backed
 * by app/ai_usage/ on the backend — one row per Claude API call made
 * during Layer 2B AI extraction (extraction/layer_2b_ai.py).
 *
 * Scoping mirrors the dashboard's time pills: pass runId ("Last Analysis")
 * OR a dateFrom/dateTo range (Today/WTD/MTD/Custom). Totals (/totals) are
 * global and independent of that scope — they back the all-time / this-month
 * tiles. CSV export (/export) honors the same scope.
 *
 * Model name and per-token cost are configured entirely via the
 * backend's .env (CLAUDE_MODEL / AI_COST_PER_INPUT_TOKEN /
 * AI_COST_PER_OUTPUT_TOKEN — see db/settings.py) — nothing hardcoded
 * here or on the frontend.
 */
import { API } from "@/lib/api";

export interface AiUsageByModel {
  model: string;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface AiUsageSummary {
  model: string;
  call_count: number;
  failed_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number | null;
  cost_per_input_token: number;
  cost_per_output_token: number;
  by_model: AiUsageByModel[];
}

export interface AiUsageTotals {
  all_time_cost_usd: number;
  all_time_tokens: number;
  all_time_call_count: number;
  month_cost_usd: number;
  month_tokens: number;
  month_call_count: number;
}

export interface AiUsageRecentRun {
  run_id: number;
  completed_at: string | null;
  triggered_by: string | null;
  model: string | null;
  call_count: number;
  total_tokens: number;
  total_cost_usd: number;
}

/**
 * Scope: pass runId for a single run, or dateFrom/dateTo ('YYYY-MM-DD') for a
 * date range, and/or user (matches AnalysisRun.triggered_by — ignored when
 * runId is set, same reasoning as the Overview page's User filter). Omit all
 * four for an all-time total.
 */
export const getAiUsageSummary = (
  runId?: number,
  dateFrom?: string,
  dateTo?: string,
  user?: string,
) =>
  API.get<AiUsageSummary>("/api/ai-usage/summary", {
    params: {
      ...(runId ? { run_id: runId } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
      ...(user ? { user } : {}),
    },
  });

/** Per-run AI usage for the last `limit` completed runs, optionally scoped to one user. */
export const getAiUsageRecentRuns = (user?: string, limit = 5) =>
  API.get<{ runs: AiUsageRecentRun[] }>("/api/ai-usage/recent", {
    params: { ...(user ? { user } : {}), limit },
  });

/** Global all-time + current-month totals (independent of the panel scope). */
export const getAiUsageTotals = () =>
  API.get<AiUsageTotals>("/api/ai-usage/totals");

/**
 * Download the usage CSV (aggregated by model) for the given scope. Fetched as
 * a blob through the shared axios instance so the X-Dev-User auth header is
 * attached (a plain <a href> download would omit it), then triggers a browser
 * save.
 */
export const downloadAiUsageCsv = async (
  runId?: number,
  dateFrom?: string,
  dateTo?: string,
  user?: string,
) => {
  const res = await API.get("/api/ai-usage/export", {
    responseType: "blob",
    params: {
      ...(runId ? { run_id: runId } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
      ...(user ? { user } : {}),
    },
  });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "ai-usage.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};
