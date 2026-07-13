/**
 * ReasonBadge — renders the rule-engine's reason_code / current_state.
 *
 * These values come straight from the backend's enums.py (ReasonCode,
 * RowState) — see cashapply-backend. Per design: rows inside the
 * "Review & Approve" tab are NOT split into separate tabs by sub-category;
 * this badge is how the SPOC tells at a glance whether a row just needs a
 * routine click (Ready to Post / Acceptable Short Payment) or needs actual
 * judgment (Conflict/Exception / Needs Remittance).
 */
const STATE_STYLES: Record<string, string> = {
  unidentified:             "bg-gray-100 text-gray-600",
  needs_remittance:         "bg-sky-100 text-sky-800",
  conflict_exception:       "bg-red-100 text-red-800",
  acceptable_short_payment: "bg-amber-100 text-amber-800",
  ready_to_post:            "bg-emerald-100 text-emerald-800",
  review_approve:           "bg-amber-100 text-amber-800",
  processed:                "bg-emerald-100 text-emerald-800",
  rejected:                 "bg-red-100 text-red-800",
  post_failed:              "bg-red-100 text-red-800",
}

const REASON_LABELS: Record<string, string> = {
  DUPLICATE_INVOICE_NO:       "Duplicate Invoice #",
  CUSTOMER_CONFLICT:          "Customer Conflict",
  INVOICE_CUSTOMER_MISMATCH:  "Invoice/Customer Mismatch",
  AMBIGUOUS_REMITTANCE:       "Ambiguous Remittance",
  INVOICE_NOT_IN_AGING:       "Invoice Not in Aging",
  PARTIAL_INVOICE_RESOLUTION: "Partial Invoice Match",
  POSSIBLE_DUPLICATE_PAYMENT: "Possible Duplicate Payment",
  CROSS_CUSTOMER_SPLIT:       "Cross-Customer Split",
  CUSTOMER_ONLY_NO_REMIT:     "Customer Only — No Remittance",
  NO_SIGNAL:                  "No Signal",
  EXACT_MATCH:                "Exact Match",
  ACCEPTABLE_SHORT_PAYMENT:   "Acceptable Short Payment",
  UNEXPLAINED_SHORTAGE:       "Unexplained Shortage",
  OVERPAYMENT_EXPLAINED:      "Overpayment (Explained)",
  OVERPAYMENT_UNEXPLAINED:    "Overpayment (Unexplained)",
  REMIT_SINGLE_EXACT:         "Remittance — Single, Exact",
  REMIT_SPLIT_CLEAN:          "Remittance — Clean Split",
  REMIT_DEDUCTION_RECONCILED: "Remittance — Deduction Reconciled",
  REMIT_AMOUNT_MISMATCH:      "Remittance Amount Mismatch",
  FX_RESOLVED:                "FX Resolved",
  FX_RATE_MISSING:            "FX Rate Missing",
  WRONG_OU_SPLIT_REQUIRED:    "Wrong OU — Split Required",
  UNCLASSIFIED:               "Unclassified",
}

export default function ReasonBadge({
  reasonCode,
  currentState,
}: {
  reasonCode?: string | null
  currentState?: string | null
}) {
  if (!reasonCode && !currentState) {
    return <span className="text-xs text-gray-400">—</span>
  }
  const styleKey = (currentState || "").toLowerCase()
  const style = STATE_STYLES[styleKey] || "bg-gray-100 text-gray-600"
  const label = (reasonCode && REASON_LABELS[reasonCode]) || reasonCode || currentState

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${style}`}>
      {label}
    </span>
  )
}
