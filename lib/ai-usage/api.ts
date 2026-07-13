/**
 * lib/ai-usage/api.ts
 * =====================
 * AI token consumption + cost tracking — backs the dashboard's
 * "AI Run Details" panel (app/dashboard/page.tsx), which previously
 * showed entirely hardcoded placeholder values (Model, Tokens In/Out,
 * Estimated Cost, Latency were static strings, never fetched from
 * anywhere). Real data now comes from GET /api/ai-usage/summary, backed
 * by app/ai_usage/ on the backend — one row per Claude API call made
 * during Layer 2B AI extraction (extraction/layer_2b_ai.py).
 *
 * Model name and per-token cost are configured entirely via the
 * backend's .env (CLAUDE_MODEL / AI_COST_PER_INPUT_TOKEN /
 * AI_COST_PER_OUTPUT_TOKEN — see db/settings.py) — nothing hardcoded
 * here or on the frontend.
 */
import { API } from "@/lib/api";

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
}

/** Pass runId to scope to one analysis run; omit for an all-time total. */
export const getAiUsageSummary = (runId?: number) =>
  API.get<AiUsageSummary>("/api/ai-usage/summary", {
    params: runId ? { run_id: runId } : {},
  });