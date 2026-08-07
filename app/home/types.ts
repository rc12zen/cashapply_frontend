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
  // Matched config key. Present even when ingest_status="unrecognized" if the
  // FORMAT matched and ingestion was refused only because some account in the
  // file has no config yet (detector's INCOMPLETE_ACCOUNTS) — this is how the UI
  // distinguishes "add the missing account" from "this format is unknown".
  bank_config_key?:     string | null;
  // ── Duplicate detection / ingestion status (additive) ────────────────────
  source_file_id?:      number;
  ingest_status?:       "processing" | "ready" | "error" | "unrecognized" | null;
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
 * ── Run preflight (GET /api/run/preflight) ─────────────────────────────────
 * Backs ConfirmRunDialog. An analysis run is IRREVERSIBLE — the orchestrator
 * stamps consumed_by_run_id on every row it processes and /start refuses to
 * run an account with no unconsumed rows left, so there is no undo and no
 * re-run. That makes the confirm dialog the last place a wrong run can be
 * caught, which is why the backend resolves the FULL run context here (the
 * settings that actually shape the results, not just which accounts are in
 * scope) and returns it in one payload.
 *
 * `blockers` mirror what POST /run/start itself rejects — a preview of a real
 * refusal, never a second opinion that could disagree with it. `warnings` are
 * things that will degrade the results but not stop the run; the person
 * decides. `can_start` is simply `blockers.length === 0`.
 */
export interface PreflightCreditRule {
  type: "amount_positive" | "column_not_blank" | "flag_matches" | string;
  column: string;
  pattern: string | null;
  description: string;
}

export interface PreflightRecipe {
  format: string;              // xlsx | xls | csv | pdf
  recipe_version: number;
  credit_rule: PreflightCreditRule | null;
}

export interface PreflightAccount extends AccountGroup {
  runnable: boolean;
  /** OrganizationUnit.functional_currency — what every amount converts INTO. */
  functional_currency: string | null;
  /** BankAccount.currency — the statement's own currency. Unrelated to above. */
  account_currency: string | null;
  /** Extra Business Units for a multi-BU account (primary is business_unit). */
  additional_business_units: { ou_name: string; ou_number: string; functional_currency: string }[];
  /** Latest recipe per file format this run actually uses. */
  credit_rules: PreflightRecipe[];
  /** Sum of credit_amount over the unconsumed rows, in account_currency. */
  pending_credit_total: number | null;
  /** statement_date span of the unconsumed rows (ISO), null if undated. */
  pending_date_from: string | null;
  pending_date_to: string | null;
  /** Most recent run that consumed any row of this account (any state). */
  last_run_id: number | null;
  last_run_at: string | null;
}

export interface PreflightIssue {
  code: string;
  message: string;
  accounts?: string[];
}

export interface PreflightSettlementIdentifier {
  id: number;
  pattern: string | null;
  provider_name: string | null;
  sub_customer_count: number;
}

export interface RunPreflight {
  // NOTE: the backend re-derives these from the selected filenames rather than
  // trusting the client's grouping, so this list is authoritative — the dialog
  // renders it directly instead of the locally-built AccountGroup[].
  accounts: PreflightAccount[];
  totals: {
    accounts: number;
    runnable_accounts: number;
    statements: number;
    pending_rows: number;
    /** Rows skipped as already-ingested duplicates on this upload. */
    duplicate_rows_ignored: number;
    /** Total incoming money grouped by statement currency (never summed across). */
    credit_by_currency: Record<string, number>;
    /** Widest statement-date span across all runnable accounts (ISO). */
    date_from: string | null;
    date_to: string | null;
  };
  context: {
    aging: { loaded: boolean; row_count: number; filename: string | null; loaded_at: string | null };
    ai: {
      provider: string | null; model: string | null;
      enabled: boolean; configured: boolean; active: boolean;
      message: string | null;
    };
    settlement_identifiers: {
      third_party_provider?: PreflightSettlementIdentifier[];
      card_narrative?:       PreflightSettlementIdentifier[];
      cheque_narrative?:     PreflightSettlementIdentifier[];
    };
    tolerances: { short_payment_tolerance_pct: number };
  };
  /** Statements whose rows span several accounts — all processed together. */
  multi_account_files: string[];
  blockers: PreflightIssue[];
  warnings: PreflightIssue[];
  can_start: boolean;
}

/**
 * One uploaded STATEMENT, with every account its rows belong to.
 *
 * The Account Statements list is about files — a person uploads one file and
 * expects one entry. Rendering files nested under accounts made a statement whose
 * account-number column holds 6 accounts appear 6 times. Accounts are shown
 * INSIDE the statement instead, which also matches how selection now works: a
 * run is started with filenames and the orchestrator processes every account a
 * file has rows for, so the accounts of one statement select together.
 *
 * `accounts` is empty while a file is still ingesting or has no config yet.
 */
export interface StatementGroup {
  filename: string;
  file: FileInfo;
  accounts: AccountGroup[];
  /** Account keys this statement covers — the unit of run selection. */
  accountKeys: string[];
  pending_row_count: number;
}

/** Runnable when any of its accounts is (see isAccountRunnable). */
export const isStatementRunnable = (s: StatementGroup): boolean =>
  s.accounts.some(isAccountRunnable);

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
  unidentified:       { name: "Unidentified",         color: "#090738" },
  needsRemittance:    { name: "Needs Remittance",     color: "#F0A83C" },
  readyForOracle:     { name: "Ready for Oracle",     color: "#1F9254" },
  conflictException:  { name: "Conflict / Exception", color: "#C0392B" },
  processed:          { name: "Processed",            color: "#222222" },
  rejected:           { name: "Rejected",             color: "#8A93A6" },
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