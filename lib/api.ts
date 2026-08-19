import axios from "axios";
import { IS_LOCAL_DEV } from "./msalConfig";
import { getAccessToken } from "./msalToken";
import { encryptionEnabled, looksLikeEnvelope, openText, sealText } from "./crypto/envelope";

// Points at the backend API. NEXT_PUBLIC_API_BASE_URL must be set for
// UAT/prod (there's no sensible default other than localhost, which only
// makes sense for local dev) -- see .env.uat.
// export const API = axios.create({
//   baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000",
// });

export const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000",
});

// ── Auth ──────────────────────────────────────────────────────────────────
//
// LOCAL DEV (APP_ENV=local): unchanged — the login screen (app/page.tsx)
// sets a `login_user_email_stub` cookie, sent as X-Dev-User on every
// request. Only honored by the backend when APP_ENV=local (see
// app/auth/bypass.py) — never reachable in UAT/prod.
//
// UAT/PROD (APP_ENV!=local): every request instead carries a real Azure
// AD access token as `Authorization: Bearer <token>`, acquired via MSAL
// (see lib/msalToken.ts — acquireTokenSilent first, falling back to an
// interactive redirect only if the session truly needs re-auth). No
// X-Dev-User header is ever sent in this mode.
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null; // SSR guard
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

API.interceptors.request.use(async (config) => {
  if (IS_LOCAL_DEV) {
    const devUser = getCookie("login_user_email_stub");
    if (devUser) {
      config.headers.set("X-Dev-User", devUser);
    }
    return config;
  }

  const token = await getAccessToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

// ── API payload encryption (VAPT remediation) ───────────────────────────────
//
// Request bodies go out sealed; response bodies come back opened. Everything
// downstream of here is unchanged: all 96 exported helpers in this file still
// send and receive ordinary objects, and no component knows encryption
// exists.
//
// The crypto itself lives in lib/crypto/envelope.ts. These interceptors only
// decide WHAT to seal and WHEN — axios never touches a key or a cipher, which
// is what keeps this file a transport concern and that one independently
// testable.
//
// Whether it is active is decided solely by whether the build has a key
// (NEXT_PUBLIC_API_ENCRYPTION_KEY). One switch, so the frontend cannot
// disagree with itself about whether it is encrypting.
API.interceptors.request.use(async (config) => {
  if (!encryptionEnabled) return config;

  const data = config.data;
  if (data === undefined || data === null) return config; // GETs and bodiless calls

  // Multipart uploads and binary bodies are passed through untouched: there is
  // no sane way to JSON-wrap a file stream, and the backend skips decryption
  // for non-JSON content types to match (see crypto/middleware.py). Their
  // RESPONSES are still encrypted — the two directions are judged separately.
  if (typeof FormData !== "undefined" && data instanceof FormData) return config;
  if (typeof Blob !== "undefined" && data instanceof Blob) return config;
  if (data instanceof ArrayBuffer) return config;

  // A string body is assumed to be JSON already; re-stringifying it would
  // double-encode it into a quoted string the backend could not parse.
  const plaintext = typeof data === "string" ? data : JSON.stringify(data);
  config.data = await sealText(plaintext);
  config.headers.set("Content-Type", "application/json");
  return config;
});

// Registered BEFORE the 401 handler below so it runs first (axios walks
// response interceptors in registration order) — the 401 redirect reads only
// the status code, but any future handler that reads an error MESSAGE needs
// the body already decrypted by the time it runs.
//
// Both halves check the body rather than assuming, because several responses
// are plaintext by design on the backend: /health, the four file downloads,
// and the generic 500 body from Starlette's outermost error handler, which
// sits outside all middleware and so cannot be encrypted.
API.interceptors.response.use(
  async (response) => {
    if (looksLikeEnvelope(response.data)) {
      response.data = JSON.parse(await openText(response.data));
    }
    return response;
  },
  async (error) => {
    const body = error?.response?.data;
    if (looksLikeEnvelope(body)) {
      try {
        error.response.data = JSON.parse(await openText(body));
      } catch {
        // Leave the sealed body in place rather than masking the original
        // failure with a decryption error. The status code still drives the
        // 401 redirect below, and error.response.data being unreadable is
        // strictly better than losing the HTTP error it came with.
      }
    }
    return Promise.reject(error);
  }
);

// A 401 means: local dev — the dev-bypass cookie is missing/unrecognized;
// UAT/prod — the Azure token is missing, expired, or the account isn't
// onboarded. Either way, bounce to the login screen rather than leaving
// the UI in a half-authenticated state with silently-failing requests.
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
// A user can be assigned one or more roles at once -- role_names is the
// COMPLETE set (backend replaces, doesn't merge -- see bff/admin_routes.py).
export const onboardUser = (payload: { email: string; display_name?: string; role_names: string[] }) =>
	API.post("/api/admin/users", payload);
export const updateUser = (id: number, payload: { display_name?: string; role_names?: string[] }) =>
	API.put(`/api/admin/users/${id}`, payload);
export const setUserActive = (id: number, is_active: boolean) =>
	API.put(`/api/admin/users/${id}/active`, { is_active });

// ── Accounts & OU's (nav info page; gated on "run:view" to view, ──────────────
// "ou:manage" to edit -- see bff/bank_accounts_routes.py) ──────────────────────
export const getBankAccounts = () => API.get("/api/bank-accounts");
export const getBusinessUnitOptions = () => API.get("/api/bank-accounts/business-units");
// Changing an account's Business Unit(s) only affects analysis runs started
// AFTER the change -- already-completed runs keep whatever was current when
// they ran (see bff/bank_accounts_routes.py's module docstring).
export const updateBankAccountBusinessUnits = (
	id: number,
	payload: { primary_ou_number: string; additional_ou_numbers?: string[] },
) => API.put(`/api/bank-accounts/${id}/business-units`, payload);
// Edit an OrganizationUnit's own name/currency directly -- new endpoint.
// Get this exactly right: Oracle Fusion matches the "BusinessUnit" field
// (built as `${ou_name}(${ou_number})`, e.g. "PUNE(111)") as an EXACT
// string -- any case/spelling difference 404s every receipt for that OU,
// with no fuzzy fallback.
export const updateOrganizationUnit = (
	ouNumber: string,
	payload: { ou_name: string; functional_currency: string },
) => API.put(`/api/bank-accounts/business-units/${encodeURIComponent(ouNumber)}`, payload);

// ── Settlement Identifiers (credit card / cheque / third-party provider) ──────
// Row identity for the three consolidated-settlement types -- see
// bff/settlement_identifier_routes.py and bank_statement/settlement_identifier.py.
export const getSettlementIdentifiers = () => API.get("/api/bank-accounts/settlement-identifiers");
// Sourced from the SAME loaded aging report every other customer picker in
// this app uses — not hand-typed. See bff/settlement_identifier_routes.py.
export const getAgingCustomersForProviders = () => API.get("/api/bank-accounts/settlement-identifiers/aging-customers");
export const createNarrativeIdentifier = (
	payload: { identifier_type: "card_narrative" | "cheque_narrative"; pattern: string },
) => API.post("/api/bank-accounts/settlement-identifiers/narrative", payload);
export const createProviderIdentifier = (
	payload: { provider_name: string; sub_customers: string[] },
) => API.post("/api/bank-accounts/settlement-identifiers/third-party-provider", payload);
export const setSettlementIdentifierActive = (id: number, active: boolean) =>
	API.put(`/api/bank-accounts/settlement-identifiers/${id}`, { active });
export const deleteSettlementIdentifier = (id: number) =>
	API.delete(`/api/bank-accounts/settlement-identifiers/${id}`);

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
/**
 * Everything the Confirm Analysis Run dialog reviews before an IRREVERSIBLE
 * run: per-account Business Unit / functional currency / credit rule, plus
 * the global run context (aging report, AI availability, settlement
 * identifiers, tolerances) and a computed blockers/warnings split. Blockers
 * mirror what POST /api/run/start itself rejects, so this is a preview of a
 * real refusal rather than a second opinion. See bff/run_routes.py's
 * /preflight.
 */
export const getRunPreflight = (selectedFiles: string[]) =>
  API.get("/api/run/preflight", {
    params: { selected_files: selectedFiles },
    // Repeated `selected_files=a&selected_files=b`, which is what FastAPI's
    // list[str] Query expects — axios's default would send `selected_files[]`.
    paramsSerializer: { indexes: null },
  });
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
  API.post(`/api/run/files/${sourceFileId}/reingest`, {});

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
  status?: string,
) => {
  const params: Record<string, string | number> = { page, page_size: pageSize };
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo)   params.date_to   = dateTo;
  if (bankName)     params.bank_name     = bankName;
  if (businessUnit) params.business_unit = businessUnit;
  if (triggeredBy)  params.triggered_by  = triggeredBy;
  if (status)       params.status        = status;
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
 *   sum_outstanding — Sum of outstanding across all confirmed invoices (invoice ccy)
 *   credit_amount   — Bank credited amount (credited ccy — raw, not converted)
 *   fx              — Currency-aware view of the credited amount. Use
 *                     fx.credit_amount_invoice_ccy (credited amount converted to
 *                     invoice currency) for any comparison against sum_outstanding.
 *                     {is_cross_currency, credited_currency, invoice_currency,
 *                      credit_amount_credited_ccy, credit_amount_invoice_ccy,
 *                      fx_credit_to_invoice, fx_credit_to_invoice_source}
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
// Undo a rejection — restores the row to the state it was rejected from and
// reuses its existing Oracle receipt. See hitl/service.py's reopen_row().
// Backend blocks (400/409) with a clear message if the row isn't rejected,
// was changed concurrently, or its invoice can no longer be safely re-claimed.
export const reopenEntry        = (id: number, comment?: string) => API.post(`/api/hitl/reopen/${id}`, { comment });

// ── Reopen WITH edits (the Reopen & Review modal) ────────────────────────────
// The path a SPOC actually takes: reopening a rejected row (or a parked
// overpayment) lets them correct the customer and/or the invoice mapping, and
// the row's bucket is recomputed from those edits — reopenEntry above is the
// older pure undo, which always returned the row to the bucket it was rejected
// from with the same mapping. See hitl/reopen_with_edits.py.
export const getReopenOptions   = (id: number) => API.get(`/api/hitl/${id}/reopen-options`);
export const getReopenInvoices  = (id: number, customerName: string) =>
  API.get(`/api/hitl/${id}/reopen-invoices`, { params: { customer_name: customerName } });
// Read-only: what confirmReopen WOULD do. Returns from/to snapshots, blockers,
// and bucket_pinned_by (set when reference_status pins the bucket, so
// re-evaluation cannot move it however the rule changes).
export const previewReopen      = (
  id: number,
  body: { customer_name?: string; invoice_numbers?: string[]; overpayment_disposition?: string },
) => API.post(`/api/hitl/${id}/reopen-preview`, body);
// Never posts to Oracle — a row landing in Ready for Oracle still needs an
// explicit Approve & Post.
export const confirmReopen      = (
  id: number,
  body: {
    customer_name?: string; invoice_numbers?: string[]; comment?: string;
    expected_version?: number; overpayment_disposition?: string; overpayment_comment?: string;
  },
) => API.post(`/api/hitl/${id}/reopen-confirm`, body);
// Route B for an overpaid row — record WHY the excess exists and close the row
// out without posting anything (see hitl/overpayment.py). Nothing is sent to
// Oracle; the bare receipt keeps holding the cash unapplied. Reversible via
// reopenEntry above, which handles parked rows as well as rejected ones.
// disposition is one of: awaiting_remittance | duplicate_payment | cross_ou |
// advance_payment | other  ("other" requires a comment).
export const parkOverpayment    = (id: number, disposition: string, comment?: string) =>
  API.post(`/api/hitl/park-overpayment/${id}`, { disposition, comment });
// Unidentified rows only — see hitl/service.py's mark_eligible_for_receipt()
// / discard_row(). markEligible creates the bare Oracle receipt now (held
// back automatically by Step 4.5 for unidentified rows); discardEntry moves
// the row to its own "Discarded" state without ever creating one.
export const markEligible        = (id: number)                   => API.post(`/api/hitl/mark-eligible/${id}`, {});
export const discardEntry        = (id: number, comment?: string) => API.post(`/api/hitl/discard/${id}`, { comment });
// Needs Distribution rows only — see hitl/service.py's
// override_settlement_as_customer_payment(). Moves the row out of the
// broker/card/cheque bucket into the standard Manual Invoice Mapping flow.
export const settlementOverride  = (id: number)                   => API.post(`/api/hitl/settlement-override/${id}`, {});
// Payment Distribution (Split & Map) -- see hitl/split_and_map.py.
export const getDistributionContext = (id: number) => API.get(`/api/hitl/distribution-context/${id}`);
export const previewDistribution    = (id: number, entries: any[]) => API.post(`/api/hitl/distribution-preview/${id}`, { entries });
export const confirmDistribution    = (id: number, entries: any[]) => API.post(`/api/hitl/distribution-confirm/${id}`, { entries });
export const getActiveInvoicesForCustomer = (id: number, customerName: string) =>
  API.get(`/api/hitl/distribution-customer-invoices/${id}`, { params: { customer_name: customerName } });
// Per-entry actions on a distributed parent's distribution_breakdown --
// no child rows, see hitl/distribution_actions.py.
export const approveDistributionEntry = (id: number, entryId: string, comment?: string) =>
  API.post(`/api/hitl/distribution-entry-approve/${id}/${entryId}`, { comment });
export const rejectDistributionEntry  = (id: number, entryId: string, comment?: string) =>
  API.post(`/api/hitl/distribution-entry-reject/${id}/${entryId}`, { comment });
export const reopenDistributionEntry  = (id: number, entryId: string, comment?: string) =>
  API.post(`/api/hitl/distribution-entry-reopen/${id}/${entryId}`, { comment });
export const editDistributionEntryGlRate = (id: number, entryId: string, newRate: number, reason?: string) =>
  API.put(`/api/hitl/distribution-entry-gl-rate/${id}/${entryId}`, { new_rate: newRate, reason });
// Cross-ledger-currency rows only, before invoice mapping — see
// hitl/service.py's edit_gl_rate() for the guard.
export const editGlRate          = (id: number, newRate: number, reason?: string) =>
  API.put(`/api/hitl/gl-rate/${id}`, { new_rate: newRate, reason });
export const approveBulk        = (ids: number[])                => API.post("/api/hitl/approve-bulk", { ids });
export const getHitlHistory     = ()                             => API.get("/api/hitl/history");
export const retryOracle        = (id: number)                   => API.post(`/api/hitl/retry-oracle/${id}`, {});
// Read-only — tells the frontend whether retryOracleBulkForRun() would
// actually be allowed to run for this run_id right now (every receipt in
// the run currently failed), WITHOUT retrying anything. Used to decide
// whether to even show the "Retry All Failed Receipts" button.
export const getRetryEligibilityForRun = (runId: number) =>
	API.get(`/api/hitl/retry-oracle-bulk-for-run/${runId}/eligibility`);
// Bulk-retries RECEIPT CREATION for every row in a run -- backend enforces
// (does not just suggest) that this only proceeds when EVERY receipt in
// the run currently shows failed; a mixed run is rejected with a clear
// error rather than partially retried (see hitl/service.py's
// retry_receipt_creation_bulk_for_run() for the exact rule).
export const retryOracleBulkForRun = (runId: number) => API.post(`/api/hitl/retry-oracle-bulk-for-run/${runId}`, {});
// Manual counterpart to the periodic remittance_recheck_worker (see
// rule_engine/remittance_recheck.py) — re-checks THIS row against
// remittances persisted since it landed in needs_remittance, instead of
// waiting for the next scheduled sweep (REMITTANCE_RECHECK_INTERVAL_SECONDS).
export const recheckRemittance  = (id: number)                   => API.post(`/api/hitl/${id}/recheck-remittance`, {});
// Correct a wrongly AI-identified customer name and re-run matching --
// see rule_engine/customer_name_correction.py. Backend refuses (returns a
// real error) if this row has already been approved/rejected/manually
// mapped -- see that module's _is_correctable(). PATCH: customerName must
// now be a REAL name from the aging report -- validated server-side (see
// correct_customer_name()'s docstring) -- the frontend should source it
// from getCustomerNameOptions() below, not a free-text box.
export const correctCustomerName = (id: number, customerName: string) =>
	API.post(`/api/hitl/${id}/correct-customer-name`, { customer_name: customerName });
// Real candidate customer names for correcting a wrongly AI-identified
// customer -- mirrors getMappingOptions()'s customer-list branch exactly
// (same aging_map.customers_for_ou() source, same 500-name cap), so the
// picker is a REAL dropdown sourced from the aging report, not free
// text. See rule_engine/customer_name_correction.py's
// get_customer_name_options(). Returns { customers: string[], ou_number }.
export const getCustomerNameOptions = (id: number) =>
	API.get(`/api/hitl/${id}/customer-name-options`);

// ── Manual invoice mapping ───────────────────────────────────────────────────
// For rows that didn't land in ready_for_oracle automatically. Confirming
// only re-classifies the row into ready_for_oracle — it does NOT post to
// Oracle. Use the existing approveEntry/approveBulk to actually post,
// same as any other ready_for_oracle row. See hitl/manual_mapping.py.
export const getMappingOptions       = (id: number)                              => API.get(`/api/hitl/${id}/mapping-options`);
export const getInvoicesForCustomer  = (id: number, customerName: string)         => API.get(`/api/hitl/${id}/mapping-options/customer`, { params: { customer_name: customerName } });
export const previewManualMapping    = (id: number, invoiceNumbers: string[])     => API.post(`/api/hitl/${id}/mapping-preview`, { invoice_numbers: invoiceNumbers });
// overpaymentDisposition/Comment are only read when the selection OVERPAYS
// (rule R9e — see hitl/manual_mapping.py's _classify). In that case each
// invoice is applied capped at its own outstanding and the excess is left
// unapplied on the receipt, so the backend REFUSES to confirm without a
// recorded reason for the excess. Ignored entirely for a normal mapping.
export const confirmManualMapping    = (
  id: number,
  invoiceNumbers: string[],
  overpaymentDisposition?: string,
  overpaymentComment?: string,
) => API.post(`/api/hitl/${id}/mapping-confirm`, {
  invoice_numbers: invoiceNumbers,
  overpayment_disposition: overpaymentDisposition,
  overpayment_comment: overpaymentComment,
});

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
// Is AI extraction (Layer 2B's fallback pass) actually usable right now --
// not just "is a key present". See bff/config_routes.py's /ai-status /
// extraction/ai_providers.py. Cached briefly server-side; pass force=true
// to bypass that (wired to a "Recheck" button).
export const getAiStatus         = (force = false)          => API.get("/api/config/ai-status", { params: force ? { force: true } : {} });
export const refreshAging        = ()                      => API.post("/api/config/refresh-aging");

/**
 * Move the current aging report to archive (does NOT delete — preserved for audit).
 * Clears aging_report table so next run won't use stale data.
 */
export const removeAging = () => API.delete("/api/config/remove-aging");

/**
 * Preview an aging report (first N rows). Pass sourceFileId to preview a
 * specific historical snapshot (e.g. the one a past run matched against —
 * see AnalysisRun.aging_source_file_id); omit it for the currently active one.
 * Returns { filename, total_rows, columns, rows } — same shape as getFilePreview
 * so both can be rendered with the same table component.
 * Uses max_rows param (not limit — backend reads max_rows).
 */
export const getAgingPreview = (maxRows: number = 200, sourceFileId?: number) =>
  API.get("/api/config/aging-preview", {
    params: { max_rows: maxRows, source_file_id: sourceFileId },
  });

/**
 * Downloads the full original aging report file (not just the preview rows).
 * Streams the real .xlsx/.xls/.csv as-is — no zip wrapper (see backend
 * config_routes.py's aging_download() for why that was removed). Pass
 * sourceFileId for the same historical-snapshot behavior as getAgingPreview.
 */
export const downloadAgingReport = (sourceFileId?: number) =>
  API.get("/api/config/aging-download", {
    params: { source_file_id: sourceFileId },
    responseType: "blob",
  });

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
  API.post(`/api/config/aging-select/${sourceFileId}`, {});

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
/**
 * Remittance Inbox — browse every remittance email/document App2 has
 * extracted, independent of any specific row. Each item reports whether
 * it's been matched to a row yet and, if so, which row(s)/run(s) — see
 * backend bff/remittance_inbox_routes.py for the matching logic (reads
 * LineItem.remittance_extraction_id, doesn't recompute anything live).
 */
export const getRemittanceInbox = (params: {
  search?: string;
  status?: "matched" | "unmatched";
  page?: number;
  pageSize?: number;
} = {}) =>
  API.get("/api/remittance-inbox/list", {
    params: {
      search: params.search || undefined,
      status: params.status || undefined,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 50,
    },
  });