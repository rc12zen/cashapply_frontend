/**
 * lib/types.ts
 * =============
 * Single source of truth for all TypeScript interfaces shared across pages
 * and components. Import from here — never define types inline in page files.
 *
 * Layer map:
 *   AnalysisRun / RunMetrics  → analysis-history/page.tsx, home/page.tsx
 *   LineItem                  → analysis-history/page.tsx, row/[id]/page.tsx
 *   RowDetail                 → row/[id]/page.tsx
 *   BreakupInvoice            → BreakupModal.tsx
 *   HitlEntry                 → activity-log/page.tsx
 *   ShortageEntry             → shortage-review/page.tsx
 *   FileInfo / AgingStatus    → home/page.tsx, config/page.tsx
 *   Metrics                   → home/page.tsx
 */

// ── Run ───────────────────────────────────────────────────────────────────────

export interface AnalysisRun {
  run_id: number;
  started_at: string;
  completed_at: string | null;
  status: "idle" | "running" | "completed" | "error";
  selected_files: string[];
  bank_names: string[];
  business_units: string[];
  total_credit_rows: number;
  total_matched: number;
  total_not_found: number;
  passed_validation: number;
  failed_validation: number;
  pending_hitl: number;
  approved: number;
  rejected: number;
  posted_to_oracle: number;
  total_credit_amount: number;
  match_rate_pct: number;
  triggered_by: string;
}

export interface RunMetrics {
  total_rows: number;
  matched: number;
  not_found: number;
  passed_val: number;
  failed_val: number;
  review: number;
  approved: number;
  rejected: number;
  processed: number;
}

// ── Line Item (one credit row) ────────────────────────────────────────────────

export interface LineItem {
  id: number;
  run_id: number;
  bank_name: string;
  business_unit: string;
  statement_date: string;
  narrative: string;
  credit_amount: number;
  statement_currency: string;
  // Extraction
  extracted_customer_name: string | null;
  extracted_invoice_number: string | null;
  extraction_method: string | null;
  confidence_score: number | null;
  // Matched aging data
  matched_customer_name: string | null;
  matched_invoice_number: string | null;
  outstanding_amount: number;
  invoice_currency: string | null;
  // Flags
  is_matched: boolean;
  passed_validation: boolean;
  status: "Not Found" | "Review & Approve" | "Processed" | "Rejected";
  validation_status: string | null;
  failed_rules: string | null;
  hitl_status: "pending" | "approved" | "rejected" | null;
  oracle_transaction_ref: string | null;
  oracle_post_status: "success" | "failed" | null;
  reason_code: string | null;
  current_state: string | null;
  shortfall_pct: number | null;
  rule_id: string | null;
  _source: "matched" | "not_found";
}

// ── Row detail (full single-row view) ─────────────────────────────────────────

export interface PipelineNode {
  key: string;
  label: string;
  status: "passed" | "failed" | "skipped" | "pending";
  detail: string;
}

export interface ConfirmedInvoice {
  invoice_number: string;
  customer_name: string;
  outstanding_amount: number;
  currency: string;
  ou_number: string;
  invoice_date: string | null;
  remittance_amount: number | null;
  computed_amount: number;
}

export interface OracleResult {
  payload: Record<string, unknown>;
  remittance_scenario: string | null;
  hitl_status: string | null;
  post_status: "success" | "failed" | null;
  oracle_ref_no: string | null;
  oracle_status_code: string | null;
  standard_receipt_id: string | null;
  oracle_posted_at: string | null;
  post_message: string | null;
}

export interface RemittanceMatch {
  subject: string | null;
  payer: string | null;
  payment_reference: string | null;
  payment_date: string | null;
  payment_amount: number | null;
  storage_key: string | null;
}

export interface RowDetail {
  bank_statement: {
    bank_name: string;
    statement_date: string | null;
    narrative: string;
    bank_account_number: string | null;
    bank_reference: string | null;
    credit_amount: number;
    currency: string;
    business_unit: string | null;
    ou_number: string | null;
  };
  extraction: {
    method: string | null;
    confidence_score: number | null;
    extracted_customer: string | null;
    primary_invoice: string | null;
    all_invoice_numbers: string[];
    row_type: string | null;
    is_matched: boolean;
  };
  confirmed_invoices: ConfirmedInvoice[];
  sum_outstanding: number;
  credit_amount: number;
  pipeline: PipelineNode[];
  oracle: OracleResult;
  remittance: RemittanceMatch | null;
}

// ── Breakup modal ─────────────────────────────────────────────────────────────

export interface BreakupInvoice {
  invoice_number: string;
  outstanding: number;
  remittance_amount: number | null;
  computed_amount: number;
  suggested_reference_amount: number;
}

export interface BreakupAnalysis {
  needs_breakup: boolean;
  scenario: string | null;
  credit_amount: number;
  invoices: BreakupInvoice[];
  auto_approved: boolean;
}

// ── HITL history (activity log) ───────────────────────────────────────────────

export interface HitlEntry {
  line_item_id: number;
  from_state: string | null;
  to_state: string;
  trigger: "spoc_approve" | "spoc_reject" | "retry" | "rule_engine" | "remittance_arrived";
  triggered_by: string | null;
  comment: string | null;
  created_at: string | null;
}

// ── Shortage review ───────────────────────────────────────────────────────────

export interface ShortageApplication {
  invoice_number: string;
  amount_outstanding: number;
  amount_applied: number;
  shortage_amount: number;
  is_full_payment: boolean;
  status: string;
  application_id: string | null;
  error: string | null;
}

export interface ShortageEntry {
  id: number;
  narrative: string;
  variance: number;
  ratio_pct: number;
  is_full_payment: boolean;
  oracle_ref_no: string | null;
  standard_receipt_id: string | null;
  applications: ShortageApplication[];
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface FileInfo {
  filename: string;
  bank_name: string;
  size_mb: number;
  business_unit: string;
  ou_number: string;
}

export interface AgingStatus {
  loaded: boolean;
  row_count: number;
  filename: string | null;
}

export interface DashboardMetrics {
  total_rows_ingested: number;
  found: number;
  not_found: number;
  passed_validation: number;
  failed_validation: number;
  pending_hitl: number;
  approved: number;
  rejected: number;
  posted_to_oracle: number;
  extraction_method_breakdown: Record<string, number>;
  aging_report_loaded: boolean;
  aging_report_row_count: number;
}

// ── Filter options ────────────────────────────────────────────────────────────

export interface FilterOptions {
  banks: string[];
  business_units: string[];
  users: string[];
}

// ── Pagination wrapper ────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}
