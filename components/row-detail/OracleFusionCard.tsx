"use client";

/**
 * components/row-detail/OracleFusionCard.tsx
 * =====================================================
 * Row Detail's CARD 5 — the Oracle Fusion payload table plus the raw
 * receipt-creation / invoice-mapping response bodies, or a "not yet
 * generated" empty state. Visibility (showOracleCard) is decided by the
 * caller — this component always renders once mounted. Pure
 * presentational, extracted verbatim from
 * app/analysis-history/row/[id]/page.tsx.
 */
import { Building2, CheckCircle2, X } from "lucide-react";
import { CardShell, CardHead } from "@/components/row-detail/SharedCardPieces";
import { OraclePayloadTable } from "@/components/row-detail/OraclePayloadTable";
import { RawResponseViewer } from "@/components/row-detail/RawResponseViewer";
import { RowDetail, FxView } from "@/components/row-detail/types";

export default function OracleFusionCard({
  oracle, creditAmount, hasOraclePayload, fx,
}: {
  oracle: RowDetail["oracle"];
  creditAmount: number;
  hasOraclePayload: boolean;
  fx?: FxView;
}) {
  return (
    <CardShell>
      <CardHead
        icon={<Building2 size={13} />}
        title="Oracle Fusion Payload"
        right={
          // PATCH: "Ready" used to just mean hasOraclePayload —
          // i.e. "a payload object exists at all". Since receipt
          // creation now runs for EVERY row regardless of
          // category (see rule_engine/orchestrator.py's Step
          // 4.5), that was true almost universally and told you
          // nothing about whether this row was actually done.
          // These are two separate, real states — show both.
          <div className="flex items-center gap-2">
            {oracle.receipt_creation_status === "success" ? (
              <span className="text-[9px] font-black text-blue-600 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 size={10} /> Receipt Created
              </span>
            ) : oracle.receipt_creation_status === "failed" ? (
              <span className="text-[9px] font-black text-red-500 uppercase tracking-wider flex items-center gap-1">
                <X size={10} /> Receipt Failed
              </span>
            ) : (
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Receipt Not Yet Created</span>
            )}
            {oracle.post_status === "success" ? (
              <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 size={10} /> Invoice Mapped
              </span>
            ) : oracle.post_status === "failed" ? (
              <span className="text-[9px] font-black text-red-500 uppercase tracking-wider flex items-center gap-1">
                <X size={10} /> Mapping Failed
              </span>
            ) : (
              <span className="text-[9px] font-black text-gray-300 uppercase tracking-wider">Not Yet Mapped</span>
            )}
          </div>
        }
      />
      {hasOraclePayload ? (
        <div className="px-5 py-5 space-y-4">
          <OraclePayloadTable payload={oracle.payload} creditAmount={creditAmount} fx={fx} />
          {/* Actual Oracle response bodies — separate from the outbound
              payload above. Only present once the corresponding step
              has actually run. */}
          <RawResponseViewer title="Receipt Created Output (Oracle response)" data={oracle.receipt_response_raw} />
          <RawResponseViewer title="Invoice Mapping Output (Oracle response)" data={oracle.reference_response_raw} />
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-[11px] text-gray-400 font-medium">
            Oracle payload will be generated once this row reaches the approval step.
          </p>
        </div>
      )}
    </CardShell>
  );
}
