/**
 * app/home/types.ts
 * ===================
 * Shared types + constants for the Home Dashboard, split out of page.tsx so
 * every sub-component under app/home/components/ can import them without
 * pulling in the whole page.
 */
import type { ReactNode } from "react";

export interface ConfigCandidate {
  config_key: string;
  display_name: string;
}

export interface FileInfo {
  filename:      string;
  bank_name:     string;
  size_mb:       number;
  business_unit: string;
  ou_number:     string;
  bank_account_id?: number | null;
  // ── Duplicate detection / ingestion status (additive) ────────────────────
  source_file_id?:      number;
  ingest_status?:       "processing" | "ready" | "error" | null;
  ingest_error?:        string | null;
  new_row_count?:        number | null;
  duplicate_row_count?:  number | null;
}

/**
 * PATCH: account-level "include in next run" selection. The orchestrator
 * consumes unconsumed rows by bank_account_id, not by file (see
 * rule_engine/orchestrator.py) — a file-level checkbox would silently not
 * match that behavior whenever two files share an account, so selection
 * happens at the account level to match reality.
 */
export interface AccountGroup {
  key: string;                 // String(bank_account_id) or "unresolved"
  bank_account_id: number | null;
  account_number: string | null;
  bank_name: string;
  business_unit: string;
  ou_number: string;
  files: FileInfo[];
  pending_row_count: number;
  // Set (by the backend) only when pending_row_count is 0 for a RECOGNISED
  // account — i.e. every row seen from this account has already gone
  // through a run. Lets the UI tell "genuinely unrecognised, go configure
  // it" apart from "recognised, but this is a duplicate of an
  // already-processed statement" and link straight to that run.
  last_consumed_run_id?: number | null;
}

/**
 * A statement can only be included in a run when its account is RECOGNISED
 * (a config matched → it has a bank_account_id) AND it actually has unconsumed
 * rows to process. An "Unknown"/errored statement (bank_account_id === null,
 * 0 pending rows) must not be runnable — the orchestrator consumes rows by
 * bank_account_id, so an unresolved statement would contribute nothing and a
 * run against only such statements is a no-op. Selection, the Start button,
 * and the run payload all gate on this single predicate.
 */
export const isAccountRunnable = (g: AccountGroup): boolean =>
  g.bank_account_id != null && g.pending_row_count > 0;

/**
 * PATCH: `groups` is the new, unambiguous taxonomy — same one used by
 * compute_run_summary() (run-detail page) and _category_for_row() (HITL
 * approve gate). Legacy top-level fields are kept on the type for
 * backward compatibility with anything else reading this response, but
 * this page only reads `groups` and `total_rows_ingested` now.
 */
export interface Metrics {
  total_rows_ingested: number;
  groups: {
    unidentified:       number;
    needs_remittance:   number;
    ready_for_oracle:   number;
    conflict_exception: number;
    processed:          number;
    rejected:           number;
    post_failed:        number;
  };
  // Amount view — same 7 buckets, values are USD-equivalent totals
  // (each row converted from ITS OWN functional/ledger currency into USD —
  // see bff/metrics.py's _to_usd(). Was labeled INR before, which was wrong
  // the moment any row belonged to a non-Indian OU's functional currency.)
  group_amounts?: {
    unidentified:       number;
    needs_remittance:   number;
    ready_for_oracle:   number;
    conflict_exception: number;
    processed:          number;
    rejected:           number;
    post_failed:        number;
  };
  total_usd_amount?: number;
  // PATCH: identified count for the "Identified" KPI card — every row with
  // SOME signal found (i.e. not in the unidentified bucket). Mirrors
  // total_identified on the Analysis History run-list table.
  identified?:          number;
  // Legacy — unused on this page now, kept for other consumers.
  found?:               number;
  not_found?:           number;
  passed_validation?:   number;
  failed_validation?:   number;
  pending_hitl?:        number;
  approved?:            number;
  rejected?:            number;
  posted_to_oracle?:    number;
  extraction_method_breakdown: Record<string, number>;
  aging_report_loaded:    boolean;
  aging_report_row_count: number;
  total_statements?:      number;
}

export const METRIC_CONFIG = {
  unidentified:       { name: "Unidentified",         color: "#e11d48" },
  needsRemittance:    { name: "Needs Remittance",     color: "#f59e0b" },
  readyForOracle:     { name: "Ready for Oracle",     color: "#10b981" },
  conflictException:  { name: "Conflict / Exception", color: "#dc2626" },
  processed:          { name: "Processed",            color: "#1E3A5F" },
  rejected:           { name: "Rejected",             color: "#6b7280" },
};

export type MetricKey = keyof typeof METRIC_CONFIG;

// Maps each METRIC_CONFIG key to where its value lives in Metrics.groups.
export const METRIC_GROUP_KEY: Record<MetricKey, keyof Metrics["groups"]> = {
  unidentified:      "unidentified",
  needsRemittance:   "needs_remittance",
  readyForOracle:    "ready_for_oracle",
  conflictException: "conflict_exception",
  processed:         "processed",
  rejected:          "rejected",
};

export interface PieDatum {
  id: MetricKey;
  name: string;
  value: number;
  color: string;
}

export interface KpiItem {
  icon: ReactNode;
  label: string;
  value: number;
  sub: string;
  accent: string;
}