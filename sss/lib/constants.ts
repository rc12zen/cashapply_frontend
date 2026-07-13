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
  R10: "Overpayment explained",
  R11: "Overpayment unexplained",
  R13: "FX rate missing",
  R14: "Wrong OU — split required",
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
  found:    "#1E3A5F",
  notFound: "#2E6DA4",
  passed:   "#4A90E2",
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
