/**
 * components/row-detail/specialFlags.tsx
 * =====================================================
 * Derives the "special flag" badges shown above Card 1 on Row Detail
 * (Acceptable Short Payment / Invoice currency != Credited Currency /
 * Cross Ledger Currency / Cross Entity Payment) from a RowDetail record.
 * Extracted from app/analysis-history/row/[id]/page.tsx so the derivation
 * logic and its rendering (SpecialFlagsBanner below) aren't buried inside
 * the page component alongside everything else.
 *
 * A .tsx file (not .ts) because the flag definitions carry JSX icons.
 */
import { AlertTriangle, ArrowRightLeft, GitBranch, Layers, CreditCard, Mail, Users } from "lucide-react";
import { RowDetail } from "@/components/row-detail/types";

export interface SpecialFlag {
  label: string;
  desc: string;
  bg: string;
  border: string;
  text: string;
  icon: React.ReactNode;
}

/**
 * The three cross-* booleans in one place, since deriveSpecialFlags below
 * needs all three and the page needs isCrossOU again separately (for
 * WhyStatusCard's cross-OU comparison block) — computing it twice would
 * risk the two copies drifting apart.
 */
export function deriveCrossFlags(detail: RowDetail) {
  const { extraction: ex, oracle } = detail;

  // True when credited currency != invoice currency (rule_engine/
  // orchestrator.py Pass 2). FX "Leg 1" is applied so the amount
  // comparison + Oracle Amount are expressed in invoice currency.
  const isCrossCurrency = detail.is_cross_currency
    ?? (oracle.payload?.ConversionRate != null && oracle.payload?.Currency !== undefined);

  // True when invoice currency != OU functional/ledger currency — FX
  // "Leg 2". Suppressed below when isCrossCurrency is also true, since
  // that's the stronger/more specific signal for the same underlying
  // payload field (ConversionRate).
  const isCrossLedger = detail.is_cross_ledger
    ?? (!isCrossCurrency && oracle.payload?.ConversionRate != null);

  // True when the payment landed in a different OU than the customer's
  // invoice(s) actually belong to (ou_resolver.py / rule R14).
  const isCrossOU = detail.is_cross_ou
    ?? (ex.row_type === "WRONG_OU_PAYMENT" || ex.row_type === "WRONG_OU_SPLIT_REQUIRED");

  return { isCrossCurrency, isCrossLedger, isCrossOU };
}

/**
 * Derives every applicable flag for a row. Booleans prefer the backend's
 * own LineItem flags (detail.is_cross_currency / is_cross_ledger / is_cross_ou)
 * with fallbacks inferred from the Oracle payload / row_type for older
 * responses that predate those fields — see deriveCrossFlags above for
 * exactly what backend condition each one mirrors.
 */
export function deriveSpecialFlags(detail: RowDetail): SpecialFlag[] {
  const { bank_statement: bs, extraction: ex, confirmed_invoices } = detail;
  const { isCrossCurrency, isCrossLedger, isCrossOU } = deriveCrossFlags(detail);

  const isAcceptableShort = ex.row_type === "ACCEPTABLE_SHORT_PAYMENT";
  // NEW — see hitl/manual_mapping.py's R9d. A shortfall beyond the
  // auto-tolerance, manually confirmed by a SPOC as genuine (not an
  // overpayment) rather than left unmapped in conflict_exception.
  const isShortPaymentRecorded = ex.row_type === "SHORT_PAYMENT_RECORDED";

  const flags: SpecialFlag[] = [];

  // NEW: R16/R17/R18 — settlement identity. These fire INSTEAD OF the usual
  // rule badges (no invoice mapping exists yet on these rows — see
  // rule_engine/evaluator.py's docstring on why they short-circuit before
  // R0), so they're checked first and unconditionally, not gated behind
  // isAcceptableShort/isCrossCurrency/etc like the flags below.
  if (detail.settlement_type === "card_narrative") flags.push({
    label: "Credit Card Settlement",
    desc:  "This bank line matches the credit card settlement narration pattern — it's a consolidated batch covering several customers. Use Split & Map to break it into individual customer/invoice receipts.",
    bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-800",
    icon: <CreditCard size={14} className="text-blue-500 shrink-0 mt-0.5" />,
  });
  if (detail.settlement_type === "cheque_narrative") flags.push({
    label: "Cheque Settlement",
    desc:  "This bank line matches the cheque-deposit narration pattern — it's a consolidated batch covering one or more customers. Use Split & Map once the scanned-cheque email is available.",
    bg: "bg-teal-50", border: "border-teal-300", text: "text-teal-800",
    icon: <Mail size={14} className="text-teal-500 shrink-0 mt-0.5" />,
  });
  if (detail.settlement_type === "third_party_provider") flags.push({
    label: "Third-Party Provider",
    desc:  `Received from ${detail.settlement_provider || "a registered third-party provider"}, paying on behalf of its own customers. No receipt has been created — enter the payment distribution to split it across the right customers/invoices.`,
    bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800",
    icon: <Users size={14} className="text-purple-500 shrink-0 mt-0.5" />,
  });

  if (isAcceptableShort) flags.push({
    label: "Acceptable Short Payment",
    desc:  "This payment is below the invoice outstanding but falls within the accepted tolerance. Posting is permitted without further action.",
    bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-800",
    icon: <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />,
  });
  if (isShortPaymentRecorded) flags.push({
    label: "Short Payment — Recorded",
    desc:  "This shortfall exceeds the auto-tolerance, but was manually confirmed against the selected invoice(s) as a genuine short payment. Posting is permitted; the remaining balance stays open for collections.",
    bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800",
    icon: <AlertTriangle size={14} className="text-orange-500 shrink-0 mt-0.5" />,
  });
  if (isCrossCurrency) flags.push({
    label: "Invoice currency != Credited Currency",
    desc:  `Payment received in ${bs.currency} and applied against an invoice in ${confirmed_invoices[0]?.currency || "a different currency"}. An FX conversion rate was applied (Leg 1).`,
    bg: "bg-violet-50", border: "border-violet-300", text: "text-violet-800",
    icon: <ArrowRightLeft size={14} className="text-violet-500 shrink-0 mt-0.5" />,
  });
  if (isCrossLedger && !isCrossCurrency) flags.push({
    label: "Cross Ledger Currency",
    desc:  "Invoice currency differs from the OU functional currency. Oracle will apply a ConversionRate when booking this receipt into the ledger.",
    bg: "bg-indigo-50", border: "border-indigo-300", text: "text-indigo-800",
    icon: <Layers size={14} className="text-indigo-500 shrink-0 mt-0.5" />,
  });
  if (isCrossOU) flags.push({
    label: "Cross Entity Payment",
    desc:  `Received into ${bs.ou_display_name || `${bs.business_unit} [${bs.ou_number}]`}, but the customer's invoice${confirmed_invoices.length > 1 ? "s belong" : " belongs"} to ${confirmed_invoices[0]?.ou_display_name || confirmed_invoices[0]?.ou_number || "a different entity"}. Manual re-routing is required before posting.`,
    bg: "bg-red-50", border: "border-red-300", text: "text-red-800",
    icon: <GitBranch size={14} className="text-red-500 shrink-0 mt-0.5" />,
  });

  return flags;
}

export function SpecialFlagsBanner({ flags }: { flags: SpecialFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {flags.map(flag => (
        <div key={flag.label}
          className={`flex items-start gap-3 px-4 py-3 rounded-sm border ${flag.bg} ${flag.border}`}>
          {flag.icon}
          <div className="flex-1 min-w-0">
            <span className={`inline-block text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-xs border mb-1 ${flag.bg} ${flag.border} ${flag.text}`}>
              {flag.label}
            </span>
            <p className={`text-[11px] font-semibold leading-relaxed ${flag.text}`}>{flag.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
