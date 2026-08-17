/**
 * components/row-detail/types.ts
 * =================================
 * Types + small pure helpers shared across the Row Detail page and its
 * extracted sub-components (RemittancePanel, OraclePayloadTable, etc).
 * Extracted from app/analysis-history/row/[id]/page.tsx to keep that file
 * focused on data-fetching/actions, not type/helper definitions.
 */
import { getErrorMessage } from "@/lib/errorMessage";

export interface AvailableRowAction {
  code: string;
  label: string;
  icon: string | null;
  confirm_required: boolean;
  is_danger: boolean;
}

export interface OuEvidenceCustomerDetail {
  ou_number: string;
  matched_customer_name: string;
  match_score: number;
  invoice_count: number;
  total_outstanding: number;
}

export interface OuEvidence {
  bank_ou_numbers: string[];
  customer_ou_details: OuEvidenceCustomerDetail[];
}

// The backend now normalizes every error (including FastAPI's own 422
// validation errors) into { title, message } server-side -- see
// app/common/errors.py. This just delegates to the shared helper; kept as
// a named wrapper so call sites below didn't all need renaming.
export function formatApiError(e: any, fallback = "Action failed."): string {
  return getErrorMessage(e, fallback);
}

// ── Types ─────────────────────────────────────────────────────────────────────

// Currency-aware view of the credited amount (backend build_row_detail's
// "fx" block). sum_outstanding is in invoice currency; credit_amount is in
// credited currency — comparing them directly is only valid same-currency.
// For any amount comparison, use credit_amount_invoice_ccy so both sides are
// in invoice currency.
export interface FxView {
  is_cross_currency:           boolean;
  credited_currency:           string | null;   // e.g. "ZAR"
  invoice_currency:            string | null;    // e.g. "EUR"
  credit_amount_credited_ccy:  number;           // raw credited amount, e.g. 348777.50 ZAR
  credit_amount_invoice_ccy:   number;           // converted, e.g. 17181.13 EUR
  fx_credit_to_invoice:        number | null;    // Leg 1 rate; null if unresolved (R13)
  fx_credit_to_invoice_source: string | null;    // "gl_rates_table" | "static_map" | "spoc_manual"
}

/**
 * Everything the screen needs to explain an overpayment — see the backend's
 * bff/row_detail.py `_build_overpayment()`. Present at three points in the
 * lifecycle and null for any row unrelated to one:
 *   is_open_overpayment — R11, awaiting a decision
 *   is_parked           — closed out with a recorded disposition, nothing posted
 *   is_capped           — R9e, mapped with each invoice capped at its outstanding
 */
export interface OverpaymentView {
  is_open_overpayment: boolean;
  is_parked:           boolean;
  is_capped:           boolean;
  target_total:        number;
  received_total:      number;
  excess_amount:       number;
  invoice_currency:    string | null;
  // Computed cause + supporting detail (rule_engine/overpayment_reason.py).
  // Advisory only — never a decision, always a suggestion for the SPOC.
  reason:              string | null;
  evidence:            Record<string, any> | null;
  disposition:         string | null;
  disposition_label:   string | null;
  disposition_at:      string | null;
  disposition_by:      string | null;
  // Only set once a capped mapping has actually posted.
  unapplied_amount:    number | null;
  disposition_options: { code: string; label: string }[];
  // Read-time check, parked "awaiting remittance" rows only — no background
  // job runs, so this is only ever computed while someone is looking.
  remittance_now_available?: boolean;
}

/**
 * The mirror of OverpaymentView for a SHORT payment — see the backend's
 * bff/row_detail.py `_build_shortage()`. Null for any row that isn't R9c.
 *
 * `within_tolerance` distinguishes the two roads to R9c: a shortfall that
 * broke the 12% rule (always went to review), versus one that did NOT but
 * was held back anyway because the customer holds open credit memos. The
 * second kind used to be auto-accepted silently, so the card says why the
 * row is in front of the SPOC rather than letting them assume the
 * tolerance changed.
 */
export interface ShortageView {
  target_total:     number;
  received_total:   number;
  shortfall_amount: number;
  shortfall_pct:    number;
  invoice_currency: string | null;
  within_tolerance: boolean;
  tolerance_pct:    number;
  // Computed cause + working (rule_engine/shortage_reason.py). Advisory
  // only — a suggestion for the SPOC, never a decision.
  reason:           string | null;
  evidence:         Record<string, any> | null;
}

export interface ConfirmedInvoice {
  invoice_number:     string;
  customer_name:      string | null;
  outstanding_amount: number | null;
  currency:           string | null;
  ou_number:          string | null;
  ou_display_name?:   string | null;  // e.g. "DALLAS(205)" — resolved OU the invoice actually belongs to
  invoice_date:       string | null;
  remittance_amount:  number | null;
  computed_amount:    number | null;
}

export interface RowDetail {
  id:              number;
  run_id?:         number;
  status:          string;
  category?:       string;       // "ready_for_oracle" | "conflict_exception" | …
  category_label?: string;       // "Ready for Oracle" | …
  // Data-driven action list -- already filtered by both this row's state
  // AND the signed-in user's permissions server-side (see
  // hitl/actions_registry.py). Render directly via ActionBar rather than
  // re-deriving eligibility client-side.
  available_actions?: AvailableRowAction[];
  // Evidence behind is_cross_ou (see CrossOUEvidencePanel) -- which OU(s)
  // the bank account belongs to, and for each OU where the customer was
  // actually found: matched name, fuzzy match score, invoice count/amount.
  ou_evidence?: OuEvidence | null;
  // Special flags from LineItem (added by patched build_row_detail)
  is_cross_currency?: boolean;   // credited currency != invoice currency
  is_cross_ledger?:   boolean;   // invoice currency != OU functional currency
  is_cross_ou?:       boolean;   // payment landed in different OU than invoice
  // PATCH: persistent record of whether THIS row's current invoice mapping
  // came from a SPOC manually picking invoice(s) via the Manual Invoice
  // Mapping card, vs automatic AI/regex extraction or an automatic aging
  // match. Backend: LineItem.manually_mapped (see db/models.py).
  manually_mapped?:    boolean;
  manually_mapped_at?: string | null;
  manually_mapped_by?: string | null;
  // NEW: row identity for the three consolidated-settlement types (credit
  // card batch / cheque batch / third-party provider payment). Backend:
  // LineItem.settlement_type / settlement_provider (see db/models.py),
  // set only by rule_engine/evaluator.py's R16/R17/R18. settlement_provider
  // is only ever populated when settlement_type === "third_party_provider".
  settlement_type?:     "card_narrative" | "cheque_narrative" | "third_party_provider" | null;
  settlement_provider?: string | null;
  // NEW: for a "distributed" parent row only (see hitl/split_and_map.py's
  // confirm_distribution() and hitl/distribution_actions.py) -- the
  // per-invoice breakdown, with each entry's own Oracle receipt/reference/
  // GL-rate state. No separate child rows exist; every action (Approve &
  // Post / Reject / Edit GL Rate) happens inline against one of these
  // entries. null for every other category.
  distribution_breakdown?: {
    entry_id: string;
    customer_name: string | null;
    customer_match_pct: number | null;
    invoice_number: string | null;
    currency: string | null;
    amount: number | null;
    invoice_currency: string | null;
    is_cross_currency: boolean;
    fx_credit_to_invoice: number | null;
    fx_credit_to_invoice_source: string | null;
    is_cross_ledger: boolean;
    fx_invoice_to_functional: number | null;
    fx_invoice_to_functional_source: string | null;
    is_cross_ou_currency: boolean;
    ou_evidence: OuEvidence | null;
    target_total: number | null;
    shortfall_pct: number | null;
    rule_id: string | null;
    reason_code: string | null;
    passed_validation: boolean;
    hitl_status: "pending" | "approved" | "rejected";
    oracle_post_status: "success" | "failed" | null;
    oracle_ref_no: string | null;
    standard_receipt_id: string | null;
    oracle_status_code: string | null;
    post_message: string | null;
    oracle_posted_at: string | null;
    oracle_payload: Record<string, any> | null;
    reference_status: "success" | "failed" | null;
    reference_message: string | null;
    gl_rate_original: number | null;
    gl_rate_edited_at: string | null;
    gl_rate_edited_by: string | null;
    rejected_at: string | null;
    rejected_by: string | null;
    rejected_reason: string | null;
  }[] | null;
  bank_statement: {
    bank_name:           string;
    statement_date:      string | null;
    narrative:           string;
    bank_account_number: string;
    bank_reference:      string | null;
    credit_amount:       number;
    currency:            string;
    business_unit:       string;
    ou_number:           string;
    ou_display_name?:    string | null;  // e.g. "PUNE(111)" — resolved OU that RECEIVED the payment
  };
  extraction: {
    method:              string | null;
    confidence_score:    number | null;
    extracted_customer:  string | null;
    primary_invoice:     string | null;
    all_invoice_numbers: string[];
    row_type:            string | null;
    is_matched:          boolean;
    // PATCH: if a SPOC has corrected the AI's own customer guess (see
    // rule_engine/customer_name_correction.py), extracted_customer above
    // already reflects the CORRECTED value -- these fields let the UI
    // show that a correction happened at all, and what the AI originally
    // said before it.
    customer_name_corrected?:    boolean;
    ai_extracted_customer_name?: string | null;
    customer_name_corrected_by?: string | null;
    customer_name_corrected_at?: string | null;
  };
  confirmed_invoices: ConfirmedInvoice[];
  sum_outstanding:    number;
  credit_amount:      number;
  // Currency-aware view of the credited amount — see FxView. Optional so
  // older backend builds (before the "fx" block) still typecheck.
  fx?: FxView;
  // Null unless this row is, was, or resolved an overpayment — see OverpaymentView.
  overpayment?:       OverpaymentView | null;
  // Null unless this row is short (R9c) — see ShortageView.
  shortage?:          ShortageView | null;
  pipeline:           any[];
  oracle: {
    payload:             Record<string, any>;
    remittance_scenario: string | null;
    remittance_status:   string | null;
    hitl_status:         string | null;
    post_status:         string | null;
    // PATCH: post_status (above) is the invoice-mapping outcome
    // (reference_status on the backend) — it means "fully done, posted
    // with real invoice mapping". receipt_creation_status means only "a
    // bare receipt exists" — every row gets one during reconciliation,
    // regardless of category. Don't conflate the two — see the READY
    // badge logic below, which used to only check whether *a* payload
    // existed (always true now) instead of what it actually represents.
    receipt_creation_status?: string | null;
    post_message:        string | null;
    oracle_ref_no:       string | null;
    oracle_status_code:  string | null;
    standard_receipt_id: string | null;
    oracle_posted_at:    string | null;
    // Present on newer backend builds — the actual Oracle response bodies.
    receipt_response_raw?:   Record<string, any> | null;
    reference_response_raw?: any[] | null;
  };
  remittance: {
    subject?:           string | null;
    payer?:             string | null;
    sender?:            string | null;
    customer_name?:     string | null;
    payment_reference?: string | null;
    payment_date?:      string | null;
    payment_amount?:    number | null;
    payment_currency?:  string | null;
    storage_key?:       string | null;
    invoices?:          any[];
    raw_body?:          string | null;
    filename?:          string | null;
    // Real, fetchable link for the original .msg/.pdf/.eml App2 archived —
    // see bff/storage_routes.py. Null when no file was ever stored for
    // this extraction (shouldn't normally happen, but the panel handles it).
    download_url?:      string | null;
  } | null;
}

// ── Manual invoice mapping types ─────────────────────────────────────────────

export interface MappingInvoiceOption {
  invoice_number:     string;
  outstanding_amount: number;
  currency:           string | null;
  ou_number:          string | null;
  customer_name:      string | null;
  customer_number:    string | null;
}

/**
 * One NEGATIVE row from the aging report — money on the customer's side.
 * Two kinds, told apart by the sign plus whether INV DESC is populated;
 * see aging/aging_map.py's classify_negative().
 *
 * `amount` is the POSITIVE magnitude of credit available — the source row
 * is negative, and the backend flips the sign once so no caller has to.
 */
export interface MappingCreditOption {
  document_number: string;
  amount:          number;
  currency:        string | null;
  ou_number:       string | null;
  customer_name:   string | null;
  customer_number: string | null;
  kind:            "credit_memo" | "unapplied_receipt";
  description:     string | null;   // blank on every unapplied receipt
  document_date:   string | null;
  document_type:   string | null;
}

export interface MappingCreditContext {
  /**
   * Which of the three situations the SPOC is looking at:
   *   exact_match      — one credit memo equals the shortfall to the cent
   *   ambiguous_match  — several do; the backend refuses to pick
   *   credits_available— credit memos exist, none matches exactly
   *   none             — nothing to show
   */
  situation: "exact_match" | "ambiguous_match" | "credits_available" | "none";
  shortfall_amount:           number | null;
  currency:                   string | null;
  credit_memo_total:          number;
  credit_memo_count:          number;
  unapplied_receipt_count:    number;
  /** Set ONLY on situation === "exact_match". Never a sum of several. */
  suggested_document_number:  string | null;
  /** The aging file this came from — it is replaced daily, so this is a
   *  snapshot, not a standing fact. */
  aging_filename:             string | null;
  aging_loaded_at:            string | null;
}

export interface MappingOptionsResponse {
  customer_identified: boolean;
  customer_name:       string | null;
  customers?:          string[];
  invoices:            MappingInvoiceOption[];
  /** Credit memos for the same customer/OU/currency. These REDUCE what is
   *  owed. Optional so an older backend still type-checks. */
  credit_memos?:       MappingCreditOption[];
  /** Shown for awareness only — never suggested, never netted. Finance's
   *  rule: nobody knows when a customer will come back to one. */
  unapplied_receipts?: MappingCreditOption[];
  credit_context?:     MappingCreditContext;
}

export interface MappingPreviewResponse {
  qualifies:       boolean;
  tag:             string | null;
  rule_id:         string;
  reason_code:     string;
  message:         string;
  target_total:    number;
  received_total:  number;
  shortfall_pct:   number;
  // Only present when the selection OVERPAYS (rule_id R9e). The mapping is
  // still allowed — each invoice is applied capped at its own outstanding —
  // but the backend refuses to confirm without a recorded reason for this
  // amount. See hitl/manual_mapping.py's _classify().
  excess_amount?:       number;
  requires_disposition?: boolean;
}

// ── Reason-code → plain English ───────────────────────────────────────────────

export const REASON_SENTENCES: Record<string, { text: string; tone: "ok" | "warn" | "error" | "info" }> = {
  EXACT_MATCH:              { tone: "ok",    text: "Payment exactly covers the invoice outstanding. Ready to post." },
  ACCEPTABLE_SHORT_PAYMENT: { tone: "ok",    text: "Payment is slightly below the invoice outstanding, but within the accepted short-payment tolerance. Posting is allowed." },
  UNEXPLAINED_SHORTAGE:     { tone: "warn",  text: "Payment falls short of the invoice outstanding beyond the accepted tolerance. SPOC review is required." },
  OVERPAYMENT_UNEXPLAINED:  { tone: "warn",  text: "Payment exceeds the invoice outstanding. All overpayments require SPOC review before posting — either map the invoices it actually covers, or record why the excess exists." },
  OVERPAYMENT_CAPPED:       { tone: "ok",    text: "A SPOC selected these invoices and each will be applied capped at its own outstanding. The excess stays unapplied on the receipt. Ready to post." },
  NO_PAYABLE_BALANCE:       { tone: "error", text: "The matched documents carry no outstanding balance to apply this payment against. Re-map this row to the invoice(s) the payment actually covers." },
  CUSTOMER_ONLY_NO_REMIT:   { tone: "info",  text: "Customer was identified but no invoice number was found. Waiting for the customer to send a remittance advice." },
  NO_SIGNAL:                { tone: "error", text: "Nothing could be extracted — no customer name or invoice number was found in the payment narrative." },
  CUSTOMER_CONFLICT:        { tone: "error", text: "The customer on the remittance does not match who the aging report shows as the invoice owner." },
  INVOICE_CUSTOMER_MISMATCH:{ tone: "error", text: "An invoice was found but the customer does not match the aging record. Payment may be applied to the wrong account." },
  AMBIGUOUS_REMITTANCE:     { tone: "error", text: "More than one remittance email matches this payment. SPOC must select the correct one." },
  INVOICE_NOT_IN_AGING:     { tone: "error", text: "The invoice number found in the narrative does not appear in the aging report — it may be closed, paid, or misquoted." },
  POSSIBLE_DUPLICATE_PAYMENT:{ tone: "error", text: "This payment matches an invoice that has already been posted. SPOC must confirm it is not a duplicate." },
  CROSS_CUSTOMER_SPLIT:     { tone: "warn",  text: "The remittance lists invoices across more than one customer. A manual split is required before posting." },
  FX_RATE_MISSING:          { tone: "warn",  text: "Payment and invoice are in different currencies but no exchange rate could be resolved. A rate must be provided before posting." },
  WRONG_OU_PAYMENT:         { tone: "error", text: "The customer's invoices are in a different business unit than the bank account that received this payment. The receipt must be re-routed." },
  WRONG_OU_SPLIT_REQUIRED:  { tone: "error", text: "An invoice was matched but it belongs to a different business unit. The posting must be re-routed to the correct entity." },
  DUPLICATE_INVOICE_NO:     { tone: "error", text: "The invoice number appears against more than one customer in the aging report. The match is ambiguous." },
};

export function getReasonConfig(code: string | null | undefined) {
  if (!code) return { text: "No evaluation result available for this payment.", tone: "info" as const };
  return REASON_SENTENCES[code] || {
    text: code.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase()),
    tone: "warn" as const,
  };
}

// ── Status derivation ─────────────────────────────────────────────────────────

export function deriveStatus(oracle: RowDetail["oracle"]) {
  if (oracle.post_status === "success")   return "processed";
  if (oracle.hitl_status === "rejected")  return "rejected";
  if (oracle.post_status === "failed")    return "post_failed";
  if (oracle.hitl_status === "approved")  return "approved";
  return "pending";
}

export const STATUS_CHIP: Record<string, string> = {
  processed:  "bg-emerald-100 text-emerald-700 border-emerald-300",
  rejected:   "bg-red-100 text-red-700 border-red-300",
  post_failed:"bg-amber-100 text-amber-700 border-amber-300",
  approved:   "bg-blue-100 text-blue-700 border-blue-300",
  pending:    "bg-gray-100 text-gray-600 border-gray-300",
};
export const STATUS_LABEL: Record<string, string> = {
  processed: "Processed", rejected: "Rejected",
  post_failed: "Post Failed", approved: "Approved", pending: "Pending",
};

// ── Utilities ─────────────────────────────────────────────────────────────────

export function fmt(n: number | null | undefined, dp = 2) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}