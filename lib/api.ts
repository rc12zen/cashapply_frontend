import axios from "axios";

export const API = axios.create({ baseURL: "http://localhost:8000" });

// ── Auth (dev/test SSO bypass — see backend design doc §1.3) ──────────────
//
// The existing login screen (app/page.tsx) already sets a
// `login_user_email_stub` cookie on "sign in" — this was previously
// decorative (backend had no auth at all). It's now wired to the backend's
// dev SSO bypass: every request carries that email as `X-Dev-User`, which
// the backend only honors when ENVIRONMENT=local (see app/auth/bypass.py).
//
// This is NOT how production auth works — production uses real Azure Entra
// ID tokens via MSAL, with no `X-Dev-User` header at all (see design doc
// §1.1). This interceptor is a local/test convenience so the RBAC and audit
// features are exercisable without a real Azure app registration.
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null; // SSR guard
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

API.interceptors.request.use((config) => {
  const devUser = getCookie("login_user_email_stub");
  if (devUser) {
    config.headers.set("X-Dev-User", devUser);
  }
  return config;
});

// A 401 means the dev-bypass cookie is missing/unrecognized (or, in a real
// Azure deployment, the token expired) — bounce to the login screen rather
// than leaving the UI in a half-authenticated state with silently-failing
// requests.
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== "undefined" && window.location.pathname !== "/") {
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

/**
 * Current user's identity + role + permission list, as resolved by the
 * backend from either the dev bypass or a real Azure token. Use this to
 * conditionally render admin-only UI, not just to display a name.
 */
export const getMe = () => API.get("/api/auth/me");

// ── Admin: user management (admin-only; gated on "user:manage") ─────────────────
export const getUsers = () => API.get("/api/admin/users");
export const getRoles = () => API.get("/api/admin/roles");
export const onboardUser = (payload: { email: string; display_name?: string; role_name: string }) =>
	API.post("/api/admin/users", payload);
export const updateUser = (id: number, payload: { display_name?: string; role_name?: string }) =>
	API.put(`/api/admin/users/${id}`, payload);
export const setUserActive = (id: number, is_active: boolean) =>
	API.put(`/api/admin/users/${id}/active`, { is_active });

// ── Run ───────────────────────────────────────────────────────────────────────
export const getFiles        = ()                         => API.get("/api/run/files");

/**
 * Groups current (non-archived) statement files by bank account, with a
 * LIVE unconsumed-row count per account (not the stale per-file snapshot).
 * Backs the account-level "include in next run" checkboxes — the
 * orchestrator consumes rows by account, not by file, so selection must
 * happen at the same granularity or it silently wouldn't match real
 * run behavior.
 */
export const getPendingByAccount = () => API.get("/api/run/pending-by-account");
export const startRun        = (selectedFiles: string[])  => API.post("/api/run/start", { selected_files: selectedFiles });
export const getStatus       = ()                         => API.get("/api/run/status");
export const resetRun        = ()                         => API.post("/api/run/reset");

export const deleteFile = (filename: string) =>
  API.delete(`/api/run/files/${encodeURIComponent(filename)}`);

/**
 * Uploads a bank statement. Response shape changed (backend duplicate-
 * detection integration — see design doc §2.1/§2.2):
 *   Duplicate file (already ingested): { duplicate: true, uploaded_by, uploaded_at,
 *                        existing_source_file_id, existing_run_id, history_link }
 *   Duplicate, but previously removed: { duplicate: false, restored: true,
 *                        source_file_id, ingest_status, message }
 *   Duplicate, but ingestion errored
 *   before (e.g. no config existed):  { duplicate: false, retried: true,
 *                        source_file_id, ingest_status: "processing", message }
 *   New file:          { duplicate: false, source_file_id, ingest_status: "processing",
 *                        detected_bank_config, warning, ambiguous, candidates, ... }
 * For any non-`duplicate:true` response, poll getIngestStatus(source_file_id)
 * until ingest_status flips to "ready" before offering it for analysis
 * (row-level dedup happens in that background step).
 */
export const uploadStatement = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return API.post("/api/run/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
};

/**
 * Poll target for the "Upload successful. Processing..." →
 * "You can now start Analysis." flow. Returns
 * { source_file_id, filename, ingest_status: "processing"|"ready"|"error",
 *   ingest_error, new_row_count, duplicate_row_count }.
 */
export const getIngestStatus = (sourceFileId: number) =>
  API.get(`/api/run/files/${sourceFileId}/ingest-status`);

/**
 * Re-run ingestion for an already-uploaded statement in place — used after a
 * config is created for a previously-UNKNOWN file via the Home "Configure"
 * flow (a plain re-upload would be blocked as a duplicate and not re-parse).
 */
export const reingestStatement = (sourceFileId: number) =>
  API.post(`/api/run/files/${sourceFileId}/reingest`);

export const uploadAgingReport = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return API.post("/api/config/upload-aging", form, { headers: { "Content-Type": "multipart/form-data" } });
};

// ── Run history ───────────────────────────────────────────────────────────────
export const getRunHistory = (
  page     = 1,
  pageSize = 50,
  dateFrom?: string,
  dateTo?:   string,
  bankName?: string,
  businessUnit?: string,
  triggeredBy?: string,
) => {
  const params: Record<string, string | number> = { page, page_size: pageSize };
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo)   params.date_to   = dateTo;
  if (bankName)     params.bank_name     = bankName;
  if (businessUnit) params.business_unit = businessUnit;
  if (triggeredBy)  params.triggered_by  = triggeredBy;
  return API.get("/api/run/history", { params });
};

/** "Started By" pill options for the Analysis History page — distinct AnalysisRun.triggered_by values. */
export const getRunHistoryFilterOptions = () =>
  API.get("/api/run/history/filter-options");

// ── Results ───────────────────────────────────────────────────────────────────

/**
 * Dashboard KPI metrics.
 *
 * PATH 1: run_id provided   → live query scoped to that run
 * PATH 2: date range        → aggregate from run_metrics
 * PATH 3: no params         → all completed runs
 *
 * Optional bankName / businessUnit / runBy scope the same query down
 * further (backs the dashboard's Bank / Business Unit / User dropdowns).
 *
 * Response shape (maps directly to Dashboard KPI cards). Legacy flat counts
 * are still returned for backward compatibility (found/not_found/passed_validation/
 * failed_validation), but the underlying state machine now distinguishes:
 *   unidentified              → "Not Found" pill (no customer/invoice signal at all)
 *   needs_remittance          → row has a partial signal, waiting on a remittance
 *   conflict_exception        → contradictory signals, needs a SPOC decision
 *   acceptable_short_payment  → 0–12% shortfall, within policy, still needs SPOC click
 *   ready_to_post             → fully reconciled, exact or explained overpayment
 *   review_approve            → universal action queue (all of the above once surfaced)
 *   processed / rejected      → terminal states after SPOC action
 *
 *   total_rows_ingested  → "Total Rows Ingested"
 *   found                → "Found" (is_matched = true)
 *   not_found            → "Not Found"
 *   passed_validation    → "Passed Validation"
 *   failed_validation    → "Failed Validation"
 *   pending_hitl         → "Pending HITL"
 *   approved             → "Approved"
 *   rejected             → "Rejected"
 *   posted_to_oracle     → "Approved & Posted"
 */
export const getMetrics = (
  runId?:    number,
  dateFrom?: string,
  dateTo?:   string,
  bankName?: string,
  businessUnit?: string,
  runBy?: string,
) => {
  const params: Record<string, string | number> = {};
  if (runId)    params.run_id    = runId;
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo)   params.date_to   = dateTo;
  if (bankName)      params.bank_name      = bankName;
  if (businessUnit)  params.business_unit  = businessUnit;
  // PATCH: was approved_by (RowStatusHistory — required a human to have
  // approved/rejected a row first). Now run_by (AnalysisRun.triggered_by —
  // who STARTED the run), known immediately for every run.
  if (runBy)    params.run_by    = runBy;
  return API.get("/api/results/metrics", { params });
};

/**
 * Analysis History detail view.
 * Returns metrics + 4 tabs: matched / not_found / review_approve / processed
 *
 * Each row has:
 *   is_matched, passed_validation, status  — the three key flags
 *   _source: "matched" | "not_found"
 */
export const getRunSummary = (runId: number) =>
  API.get(`/api/results/run-summary/${runId}`);

/**
 * Full row detail (row detail page).
 * Response sections:
 *   bank_statement  — parsed bank statement fields (bank_name, statement_date,
 *                     narrative, bank_account_number, bank_reference,
 *                     credit_amount, currency, business_unit, ou_number)
 *   extraction      — AI extraction output (method, confidence_score,
 *                     extracted_customer, primary_invoice, all_invoice_numbers,
 *                     row_type, is_matched)
 *   confirmed_invoices — Final invoice list for Oracle, each with full aging data
 *                        (invoice_number, customer_name, outstanding_amount,
 *                         currency, ou_number, invoice_date,
 *                         remittance_amount, computed_amount)
 *   sum_outstanding — Sum of outstanding across all confirmed invoices
 *   credit_amount   — Bank credited amount
 *   pipeline        — Ordered nodes for visual flowchart
 *                     [{key, label, status: passed|failed|skipped|pending, detail}]
 *   oracle          — Payload + Oracle response fields after Processed:
 *                     {payload, remittance_scenario, hitl_status, post_status,
 *                      oracle_ref_no, oracle_status_code, standard_receipt_id,
 *                      oracle_posted_at, post_message}
 *   remittance      — Matched remittance email (null if not found)
 */
export const getRowDetail = (recordId: number) =>
  API.get(`/api/results/row-detail/${recordId}`);

/**
 * Fetches a storage-backed file (e.g. the original remittance email
 * App2/cashapply-remittance-agent archived) as a blob, going through the
 * same authenticated axios instance as every other call — a plain <a href>
 * straight to the backend URL would skip the X-Dev-User header this app's
 * auth relies on (see the interceptor above) and 401. Callers turn the
 * blob into an object URL and trigger a save themselves (same pattern as
 * exportExecutiveCsv).
 */
export const downloadStorageFile = (relativeUrl: string) =>
  API.get(relativeUrl, { responseType: "blob" });

export const getNotFound           = (params?: object) => API.get("/api/results/not-found", { params });
export const getValidationFailures = ()                => API.get("/api/results/validation-failures");

/**
 * Shortage & Reconciliation Audit — finance team post-processing view.
 * Returns all Processed records split into two buckets:
 *   shortage     → credit < outstanding (88–99.9% range, residual balance remains in Oracle)
 *   full_payment → credit == outstanding (100%, fully closed, no action needed)
 *
 * Each row includes:
 *   variance, ratio_pct, is_full_payment, oracle_ref_no, standard_receipt_id
 *   applications: per-invoice apply telemetry from oracle_receipt_applications table
 *     [{invoice_number, amount_outstanding, amount_applied, shortage_amount,
 *       is_full_payment, status, application_id, error}]
 */
export const getProcessedShortages = (
  runId?:    number,
  dateFrom?: string,
  dateTo?:   string,
  bankName?: string,
  businessUnit?: string,
) => {
  const params: Record<string, string | number> = {};
  if (runId)    params.run_id    = runId;
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo)   params.date_to   = dateTo;
  if (bankName)     params.bank_name     = bankName;
  if (businessUnit) params.business_unit = businessUnit;
  return API.get("/api/results/processed-shortage-summary", { params });
};

// ── Activity Log ──────────────────────────────────────────────────────────────
/**
 * Full audit trail — /api/activity-log. Returns { data, total, page, page_size }.
 * `category` is a convenience grouping the backend maps onto several raw
 * `action` values (see bff/activity_log_routes.py): "file_upload" |
 * "analysis_run" | "approved" | "rejected". Omit for "All Actions".
 */
export const getActivityLog = (params: {
  page?: number;
  pageSize?: number;
  userId?: number;
  userEmail?: string;
  category?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}) =>
  API.get("/api/activity-log", {
    params: {
      page: params.page ?? 1,
      page_size: params.pageSize ?? 50,
      user_id: params.userId,
      user_email: params.userEmail,
      category: params.category,
      entity_type: params.entityType,
      date_from: params.dateFrom,
      date_to: params.dateTo,
    },
  });

// Distinct user emails present in the audit trail — for the user filter dropdown.
export const getActivityUsers = () => API.get("/api/activity-log/users");
export const purgeSystemLogs  = () => API.delete("/api/activity-log/purge-system-logs");

// ── HITL ──────────────────────────────────────────────────────────────────────
export const getPendingHitl     = ()                             => API.get("/api/hitl/pending");
export const getApprovalPreview = (id: number)                   => API.get(`/api/hitl/preview/${id}`);
export const rejectEntry        = (id: number, comment?: string) => API.post(`/api/hitl/reject/${id}`, { comment });
export const approveBulk        = (ids: number[])                => API.post("/api/hitl/approve-bulk", { ids });
export const getHitlHistory     = ()                             => API.get("/api/hitl/history");
export const retryOracle        = (id: number)                   => API.post(`/api/hitl/retry-oracle/${id}`);
// Manual counterpart to the periodic remittance_recheck_worker (see
// rule_engine/remittance_recheck.py) — re-checks THIS row against
// remittances persisted since it landed in needs_remittance, instead of
// waiting for the next scheduled sweep (REMITTANCE_RECHECK_INTERVAL_SECONDS).
export const recheckRemittance  = (id: number)                   => API.post(`/api/hitl/${id}/recheck-remittance`);

// ── Manual invoice mapping ───────────────────────────────────────────────────
// For rows that didn't land in ready_for_oracle automatically. Confirming
// only re-classifies the row into ready_for_oracle — it does NOT post to
// Oracle. Use the existing approveEntry/approveBulk to actually post,
// same as any other ready_for_oracle row. See hitl/manual_mapping.py.
export const getMappingOptions       = (id: number)                              => API.get(`/api/hitl/${id}/mapping-options`);
export const getInvoicesForCustomer  = (id: number, customerName: string)         => API.get(`/api/hitl/${id}/mapping-options/customer`, { params: { customer_name: customerName } });
export const previewManualMapping    = (id: number, invoiceNumbers: string[])     => API.post(`/api/hitl/${id}/mapping-preview`, { invoice_numbers: invoiceNumbers });
export const confirmManualMapping    = (id: number, invoiceNumbers: string[])     => API.post(`/api/hitl/${id}/mapping-confirm`, { invoice_numbers: invoiceNumbers });

/**
 * Approve a record.
 * invoice_breakup: optional per-invoice confirmed amounts from SPOC modal.
 *   [{invoice_number, reference_amount}]
 * Oracle stores oracle_ref_no, oracle_status_code, standard_receipt_id on success.
 * Response also includes per-invoice apply telemetry in `applications[]`.
 */
export const approveEntry = (
  id:              number,
  comment?:        string,
  invoiceBreakup?: { invoice_number: string; reference_amount: number }[],
) =>
  API.post(`/api/hitl/approve/${id}`, {
    comment,
    invoice_breakup: invoiceBreakup,
  });

/**
 * Get per-invoice breakup for SPOC confirmation modal.
 * Returns: { needs_breakup, scenario, credit_amount, invoices, auto_approved }
 * invoices: [{ invoice_number, outstanding, remittance_amount, computed_amount, suggested_reference_amount }]
 */
export const getBreakupAnalysis = (id: number) =>
  API.get(`/api/hitl/breakup-analysis/${id}`);

// ── Config ────────────────────────────────────────────────────────────────────
export const getAbbreviations    = ()                      => API.get("/api/config/abbreviations");
export const updateAbbreviations = (abbreviations: object) => API.put("/api/config/abbreviations", { abbreviations });
export const getAgingStatus      = ()                      => API.get("/api/config/aging-status");
export const refreshAging        = ()                      => API.post("/api/config/refresh-aging");

/**
 * Move the current aging report to archive (does NOT delete — preserved for audit).
 * Clears aging_report table so next run won't use stale data.
 */
export const removeAging = () => API.delete("/api/config/remove-aging");

/**
 * Preview the currently loaded aging report (first N rows).
 * Returns { filename, total_rows, columns, rows } — same shape as getFilePreview
 * so both can be rendered with the same table component.
 * Uses max_rows param (not limit — backend reads max_rows).
 */
export const getAgingPreview = (maxRows: number = 200) =>
  API.get("/api/config/aging-preview", { params: { max_rows: maxRows } });

/**
 * Every aging report ever loaded (manual upload OR the watch-folder
 * watcher), most recent first — nothing is ever hard-deleted, so this is
 * a permanent history. Returns { items: [{ id, filename, uploaded_at,
 * is_active }] }. Exactly one item has is_active=true at a time.
 */
export const getAgingHistory = () => API.get("/api/config/aging-history");

/**
 * Switches the active aging report to a past upload (picked from the
 * aging-history dropdown) and reloads it into memory. Same response
 * shape as refreshAging(): { loaded, row_count, invoice_count,
 * customer_count, filename }.
 */
export const selectAgingSource = (sourceFileId: number) =>
  API.post(`/api/config/aging-select/${sourceFileId}`);

// ── Filters ───────────────────────────────────────────────────────────────────
/**
 * Returns { banks: string[], business_units: string[], users: string[] }.
 * `users` is backed by AnalysisRun.triggered_by (who started the run) —
 * populated immediately, no need to wait for a HITL approve/reject.
 */
export const getFilterOptions = (runId?: number) =>
  API.get("/api/filters/options", { params: runId ? { run_id: runId } : {} });

// ── File preview ──────────────────────────────────────────────────────────────
export const getFilePreview = (
  filename: string,
  bucket:   string = "active",
  maxRows:  number = 200,
) =>
  API.get(`/api/run/file-preview/${encodeURIComponent(filename)}`, {
    params: { bucket, max_rows: maxRows },
  });

// ── Remittance ────────────────────────────────────────────────────────────────
export const uploadRemittance = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return API.post("/api/remittance/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
};
export const loadRemittanceFolder = () => API.post("/api/remittance/load-folder");

// ── Executive Summary (Oracle-posted records only) ────────────────────────────
/**
 * Dropdown options scoped to ONLY rows that ever reached Oracle, plus the
 * pill definitions ({ key, label }[]) the dashboard renders as audit chips.
 */
export const getExecutiveFilters = (mode: "posted" | "non_posted" = "posted") =>
  API.get("/api/executive-summary/filters", { params: { mode } });

/**
 * Audit pills + bank/BU breakdowns for the current filter set.
 * Every param is optional; omit to see all-time posted records.
 */
export const getExecutiveSummary = (params: {
  bankName?: string;
  businessUnit?: string;
  ouNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  runId?: number;
  runBy?: string;
} = {}) =>
  API.get("/api/executive-summary/summary", {
    params: {
      bank_name: params.bankName,
      business_unit: params.businessUnit,
      ou_number: params.ouNumber,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      run_id: params.runId,
      run_by: params.runBy,
    },
  });

/**
 * Paginated ledger of posted records. `category` narrows to one pill key
 * (e.g. "cross_currency") — same filter contract as the summary endpoint.
 */
export const getExecutiveRecords = (params: {
  bankName?: string;
  businessUnit?: string;
  ouNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  runId?: number;
  category?: string;
  runBy?: string;
  page?: number;
  pageSize?: number;
} = {}) =>
  API.get("/api/executive-summary/records", {
    params: {
      bank_name: params.bankName,
      business_unit: params.businessUnit,
      ou_number: params.ouNumber,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      run_id: params.runId,
      category: params.category,
      run_by: params.runBy,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 50,
    },
  });

/**
 * Downloads the CSV for the current filter set. Returns the raw axios
 * response with responseType "blob" so callers can trigger a file save.
 */
export const exportExecutiveCsv = (params: {
  bankName?: string;
  businessUnit?: string;
  ouNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  runId?: number;
  category?: string;
  runBy?: string;
} = {}) =>
  API.get("/api/executive-summary/export", {
    params: {
      bank_name: params.bankName,
      business_unit: params.businessUnit,
      ou_number: params.ouNumber,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      run_id: params.runId,
      category: params.category,
      run_by: params.runBy,
    },
    responseType: "blob",
  });

/**
 * Non-Posted Overview — everything that hasn't reached Oracle yet.
 * Same group taxonomy as the main Dashboard (unidentified / needs_remittance /
 * conflict_exception / rejected / post_failed), plus a standalone Cross-OU tag.
 */
export const getNonPostedSummary = (params: {
  bankName?: string;
  businessUnit?: string;
  ouNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  runId?: number;
  runBy?: string;
} = {}) =>
  API.get("/api/executive-summary/non-posted/summary", {
    params: {
      bank_name: params.bankName,
      business_unit: params.businessUnit,
      ou_number: params.ouNumber,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      run_id: params.runId,
      run_by: params.runBy,
    },
  });

export const getNonPostedRecords = (params: {
  bankName?: string;
  businessUnit?: string;
  ouNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  runId?: number;
  category?: string;
  runBy?: string;
  page?: number;
  pageSize?: number;
} = {}) =>
  API.get("/api/executive-summary/non-posted/records", {
    params: {
      bank_name: params.bankName,
      business_unit: params.businessUnit,
      ou_number: params.ouNumber,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      run_id: params.runId,
      category: params.category,
      run_by: params.runBy,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 50,
    },
  });