"use client";
import { AlertTriangle, Ban, Calendar, ClipboardCheck, HelpCircle, Layers, Sparkles } from "lucide-react";
import MetricsKpiGrid from "./MetricsKpiGrid";
import MetricToggleBar from "./MetricToggleBar";
import MetricsPieChart from "./MetricsPieChart";
import type { MetricKey, PieDatum } from "../types";

interface GroupAmounts {
  unidentified: number;
  needs_remittance: number;
  ready_for_oracle: number;
  conflict_exception: number;
  processed: number;
  rejected: number;
  post_failed: number;
}

interface AmountViewCardProps {
  totalUsdAmount: number;
  ga: GroupAmounts;
  amountPieData: PieDatum[];
  activeMetrics: Record<MetricKey, boolean>;
  setActiveMetrics: (updater: (prev: Record<MetricKey, boolean>) => Record<MetricKey, boolean>) => void;
  fmtUsd: (n: number) => string;
}

/** The whole "Amount View — USD" card: same layout as the Dashboard card, but every value is a USD total instead of a row count. */
export default function AmountViewCard({
  totalUsdAmount, ga, amountPieData, activeMetrics, setActiveMetrics, fmtUsd,
}: AmountViewCardProps) {
  return (
    <div className="bg-white border border-gray-200 p-6 shadow-xs space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-xs font-black text-primary uppercase tracking-wider">
            Amount View{" "}
            <span className="ml-2 text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-xs">USD</span>
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Total credited amounts converted to USD.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total</div>
          <div className="text-lg font-black text-primary">{fmtUsd(totalUsdAmount)}</div>
        </div>
      </div>

      <div className="space-y-6">
        <MetricsKpiGrid
          emoji="📊" title="Inbound Transactions" formatValue={fmtUsd} valueClassName="text-lg font-black text-primary"
          items={[
            { icon: <Layers size={12} className="text-[#222222]" />, label: "Total Amount Ingested", value: totalUsdAmount, sub: "All credited amounts, converted to USD", accent: "#222222" },
          ]}
        />

        <MetricsKpiGrid
          emoji="✓" title="System Matching Results" size="sm" formatValue={fmtUsd} valueClassName="text-sm font-black text-primary leading-tight"
          items={[
            { icon: <Sparkles size={12} className="text-emerald-500" />, label: "Identified Matches", value: Math.max(totalUsdAmount - (ga.unidentified ?? 0), 0), sub: "Customer name or invoice number found", accent: "#10b981" },
            { icon: <HelpCircle size={12} className="text-red-400" />, label: "Unidentified (Blocked)", value: ga.unidentified, sub: "No matching customer name or invoice number", accent: "#e11d48" },
            { icon: <Calendar size={12} className="text-amber-500" />, label: "Needs Remittance Follow-Up", value: ga.needs_remittance, sub: "Variance: amount, date, invoice mapping, etc", accent: "#f59e0b" },
            { icon: <Sparkles size={12} className="text-emerald-500" />, label: "Ready for Approval", value: ga.ready_for_oracle, sub: "Exact match, one-click post to Oracle", accent: "#10b981" },
          ]}
        />

        <MetricsKpiGrid
          emoji="⚠️" title="Exceptions & Conflicts" size="sm" columns="grid-cols-2 lg:grid-cols-3" formatValue={fmtUsd} valueClassName="text-sm font-black text-primary leading-tight"
          items={[
            { icon: <AlertTriangle size={12} className="text-red-500" />, label: "Conflict / Exception", value: ga.conflict_exception, sub: "Mismatch on customer/invoice/amount/OU", accent: "#dc2626" },
            { icon: <Ban size={12} className="text-gray-400" />, label: "Rejected", value: ga.rejected, sub: "Rejected by system or SPOC", accent: "#6b7280" },
            { icon: <Ban size={12} className="text-gray-400" />, label: "Post Failed", value: ga.post_failed, sub: "Approved but Oracle post errored", accent: "#6b7280" },
          ]}
        />

        <MetricsKpiGrid
          emoji="✅" title="Completed" formatValue={fmtUsd} valueClassName="text-lg font-black text-primary"
          items={[
            { icon: <ClipboardCheck size={12} className="text-emerald-600" />, label: "Invoice Mapped", value: ga.processed, sub: "Approved and invoice-mapped in Oracle AR", accent: "#222222" },
          ]}
        />
      </div>

      <hr className="border-gray-200" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2">
        <MetricToggleBar
          title="Amount Distribution"
          subtitle="Toggle categories — same toggles as count chart above."
          activeMetrics={activeMetrics}
          setActiveMetrics={setActiveMetrics}
          values={ga}
          formatValue={fmtUsd}
        />
        <MetricsPieChart
          title="Amount Distribution (USD)"
          data={amountPieData}
          emptyLabel="No active categories selected."
          tooltipFormatter={fmtUsd}
        />
      </div>
    </div>
  );
}
