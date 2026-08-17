/**
 * lib/constants.ts
 * =================
 * All hardcoded strings, maps and colour values used across pages.
 * Import from here — never hardcode these inline in page or component files.
 */

// ── API base ──────────────────────────────────────────────────────────────────

export const API_BASE_URL = "http://localhost:8000";

// ── Analysis history tabs ─────────────────────────────────────────────────────

export const ANALYSIS_TABS = [
  { key: "matched",        label: "Matched" },
  { key: "not_found",      label: "Not Matched" },
  { key: "review_approve", label: "Review & Approve" },
  { key: "processed",      label: "Processed" },
] as const;

export type AnalysisTabKey = typeof ANALYSIS_TABS[number]["key"];

// ── Row status → display label ────────────────────────────────────────────────

export const STATUS_LABEL: Record<string, string> = {
  "Not Found":       "Not Found",
  "Review & Approve": "Review & Approve",
  "Processed":       "Processed",
  "Rejected":        "Rejected",
};

// ── Row state → badge colour class (Tailwind) ─────────────────────────────────

export const STATE_BADGE_CLASS: Record<string, string> = {
  unidentified:            "bg-gray-100 text-gray-600",
  needs_remittance:        "bg-yellow-100 text-yellow-700",
  conflict_exception:      "bg-red-100 text-red-700",
  acceptable_short_payment:"bg-blue-100 text-blue-700",
  ready_to_post:           "bg-green-100 text-green-700",
  review_approve:          "bg-orange-100 text-orange-700",
  processed:               "bg-emerald-100 text-emerald-700",
  rejected:                "bg-rose-100 text-rose-700",
  post_failed:             "bg-red-200 text-red-800",
  // Overpayment: amber for the postable one (reviewed, cleared, but not a clean
  // match — the same visual weight Short Payment carries), slate for the parked
  // one (closed out, nothing pending).
  overpayment:             "bg-amber-100 text-amber-700",
  overpayment_parked:      "bg-slate-100 text-slate-600",
};

// ── Rule ID → human-readable label ───────────────────────────────────────────

export const RULE_LABEL: Record<string, string> = {
  R0:  "Duplicate invoice number",
  R1:  "Customer conflict",
  R2:  "Invoice–customer mismatch",
  R3:  "Ambiguous remittance",
  R4:  "Invoice not in aging",
  R5:  "Possible duplicate payment",
  R6:  "Cross-customer split",
  R7:  "Customer only — no remittance",
  R8:  "No signal",
  R9a: "Exact match",
  R9b: "Acceptable short payment",
  R9c: "Unexplained shortage",
  R9d: "Short payment recorded",
  R9e: "Overpayment — ready to post",
  R10: "Overpayment explained",
  R11: "Overpayment unexplained",
  R12: "No payable balance",
  R13: "FX rate missing",
  R14: "Wrong OU — split required",
};

// ── Overpayment: why a row looks overpaid ────────────────────────────────────
// Computed server-side by rule_engine/overpayment_reason.py and returned on the
// row-detail `overpayment` block. Advisory only — every overpayment still goes
// to a human regardless of which of these it lands on.

export const OVERPAYMENT_REASON_LABEL: Record<string, string> = {
  DUPLICATE_SUSPECT:        "Likely duplicate payment",
  CROSS_OU_CANDIDATE:       "May belong to another entity",
  UNMATCHED_INVOICES_EXIST: "Customer has other open invoices",
  FX_DIFFERENCE:            "Exchange rate difference",
  UNEXPLAINED:              "No explanation found",
};

export const OVERPAYMENT_REASON_DETAIL: Record<string, string> = {
  DUPLICATE_SUSPECT:
    "One of these invoices is already claimed by another bank line — the customer may have paid it twice.",
  CROSS_OU_CANDIDATE:
    "This customer has open invoices in a different entity that come to roughly this amount. The payment may be partly meant for that entity's books.",
  UNMATCHED_INVOICES_EXIST:
    "This customer has other open invoices that could absorb it — the payment probably covers one we didn't match. Choose Apply & Post and add them.",
  FX_DIFFERENCE:
    "This is a cross-currency payment, and the difference is small enough to be explained by our conversion rate differing from the customer's.",
  UNEXPLAINED:
    "Nothing in the aging report accounts for it. The customer's remittance advice is likely needed.",
};

// The mirror of the two maps above, for a SHORT payment. Computed by
// rule_engine/shortage_reason.py; see that module for how each is decided.
//
// Wording rule, same as overpayment: these are SUGGESTIONS, not findings.
// Every one of them comes from amounts lining up in the aging report, not
// from the customer telling us anything, so nothing here is phrased as a
// fact. The one exception is DEDUCTION_STATED, where the customer's own
// remittance did declare the deduction.
export const SHORTAGE_REASON_LABEL: Record<string, string> = {
  CREDIT_MEMO_EXACT_MATCH: "Open credit memo matches the shortfall",
  CREDIT_MEMO_AMBIGUOUS:   "Several credit memos match the shortfall",
  CREDIT_MEMO_AVAILABLE:   "Customer holds open credit memos",
  DEDUCTION_STATED:        "Deduction stated on the remittance",
  SHORTAGE_UNEXPLAINED:    "No explanation found",
};

export const SHORTAGE_REASON_DETAIL: Record<string, string> = {
  CREDIT_MEMO_EXACT_MATCH:
    "One open credit memo is for exactly the missing amount — the customer most likely deducted it before paying. It is still open in Oracle, so it needs applying there or it can be claimed again.",
  CREDIT_MEMO_AMBIGUOUS:
    "More than one open credit memo is for exactly the missing amount, so none is suggested — picking between identical candidates would be a guess. Check the customer's remittance advice.",
  CREDIT_MEMO_AVAILABLE:
    "This customer holds open credit memos, but none matches the missing amount on its own. Combinations are deliberately not searched — with this many credit memos some combination fits almost any figure, which would look like an answer without being one.",
  DEDUCTION_STATED:
    "The customer's remittance declared a deduction (withholding tax, bank charges or similar) that accounts for the gap.",
  SHORTAGE_UNEXPLAINED:
    "Nothing in the aging report accounts for it. The customer's remittance advice is likely needed.",
};

// The two outcomes a SPOC picks between on an overpaid row. Kept here so the
// dialog, the row-detail card and any future surface all say the same thing —
// the whole problem this replaced was two screens describing the same action
// with different words.
export const OVERPAYMENT_OUTCOME = {
  apply: {
    label: "Apply & Post",
    consequence: "posts to Oracle",
    detail:
      "Pick the invoices this payment covers. Each is applied at its own outstanding amount, so nothing is over-applied. Anything left over stays unapplied on the receipt.",
  },
  explain: {
    label: "Explain & Close",
    consequence: "nothing is sent to Oracle",
    detail:
      "Record why the money is here and take the row out of the queue. The receipt keeps holding it unapplied. Reopen later if this changes.",
  },
} as const;

export const OVERPAYMENT_DISPOSITION_LABEL: Record<string, string> = {
  awaiting_remittance: "Waiting for remittance advice",
  duplicate_payment:   "Duplicate payment",
  cross_ou:            "Belongs to another entity",
  advance_payment:     "Paid in advance",
  other:               "Other",
};

// ── Reason code → human-readable label ───────────────────────────────────────

export const REASON_LABEL: Record<string, string> = {
  DUPLICATE_INVOICE_NO:       "Duplicate invoice no.",
  CUSTOMER_CONFLICT:          "Customer conflict",
  INVOICE_CUSTOMER_MISMATCH:  "Invoice–customer mismatch",
  AMBIGUOUS_REMITTANCE:       "Ambiguous remittance",
  INVOICE_NOT_IN_AGING:       "Invoice not in aging",
  POSSIBLE_DUPLICATE_PAYMENT: "Possible duplicate payment",
  CROSS_CUSTOMER_SPLIT:       "Cross-customer split",
  CUSTOMER_ONLY_NO_REMIT:     "Customer only, no remittance",
  NO_SIGNAL:                  "No signal",
  EXACT_MATCH:                "Exact match",
  ACCEPTABLE_SHORT_PAYMENT:   "Acceptable short payment",
  UNEXPLAINED_SHORTAGE:       "Unexplained shortage",
  OVERPAYMENT_EXPLAINED:      "Overpayment explained",
  OVERPAYMENT_UNEXPLAINED:    "Overpayment unexplained",
  OVERPAYMENT_CAPPED:         "Overpayment — invoices applied at outstanding",
  NO_PAYABLE_BALANCE:         "No payable balance",
  FX_RATE_MISSING:            "FX rate missing",
  WRONG_OU_SPLIT_REQUIRED:    "Wrong OU — split required",
};

// ── Extraction method → display label ────────────────────────────────────────

export const EXTRACTION_METHOD_LABEL: Record<string, string> = {
  regex:              "Regex",
  fuzzy:              "Fuzzy match",
  "regex+fuzzy":      "Regex + Fuzzy",
  "ai+aging_validated": "AI (validated)",
  none:               "None",
};

// ── Dashboard pie chart colours ───────────────────────────────────────────────
// Hardcoded hex — Recharts doesn't support Tailwind classes

export const CHART_COLORS = {
  found:    "#222222",
  notFound: "#222222",
  passed:   "#222222",
  failed:   "#e11d48",
  pending:  "#f59e0b",
} as const;

// ── HITL statuses ─────────────────────────────────────────────────────────────

export const HITL_STATUS_LABEL: Record<string, string> = {
  pending:  "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

// ── Pipeline node status → colour ────────────────────────────────────────────

export const PIPELINE_STATUS_CLASS: Record<string, string> = {
  passed:  "text-green-600 bg-green-50 border-green-200",
  failed:  "text-red-600 bg-red-50 border-red-200",
  skipped: "text-gray-400 bg-gray-50 border-gray-200",
  pending: "text-yellow-600 bg-yellow-50 border-yellow-200",
};

// ── Pagination defaults ───────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 50;
