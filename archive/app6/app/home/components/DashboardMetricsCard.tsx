"use client";
import {
  Ban, Calendar, ClipboardCheck, FileText, HelpCircle, Layers, Sparkles, AlertTriangle,
} from "lucide-react";
import MetricsFilterBar from "./MetricsFilterBar";
import MetricsKpiGrid from "./MetricsKpiGrid";
import type { Metrics } from "../types";

interface DashboardMetricsCardProps {
  // filter bar
  timePeriod: string;
  setTimePeriod: (p: string) => void;
  isCustomDateActive: boolean;
  setIsCustomDateActive: (v: boolean) => void;
  customStartDate: string;
  setCustomStartDate: (v: string) => void;
  customEndDate: string;
  setCustomEndDate: (v: string) => void;
  doFetchMetrics: (period: string, start: string, end: string) => void;
  bankOptions: string[];
  buOptions: string[];
  userOptions: string[];
  selectedBank: string;
  setSelectedBank: (v: string) => void;
  selectedBU: string;
  setSelectedBU: (v: string) => void;
  selectedUser: string;
  setSelectedUser: (v: string) => void;
  // data
  totalStatements: number;
  dm: Metrics | { total_rows_ingested: number; identified?: number; groups: Metrics["groups"] };
  g: Metrics["groups"];
}

/**
 * The "Dashboard" filters + four count-based KPI sections (Inbound /
 * Matching / Exceptions / Completed). The pie charts (moved to
 * CategoryPieCard on the Overview page) and the AI usage panel (moved to
 * its own /ai-usage page) used to live here too — this card is now just
 * filters + KPIs.
 */
export default function DashboardMetricsCard(props: DashboardMetricsCardProps) {
  const {
    timePeriod, setTimePeriod, isCustomDateActive, setIsCustomDateActive,
    customStartDate, setCustomStartDate, customEndDate, setCustomEndDate,
    doFetchMetrics, bankOptions, buOptions, userOptions,
    selectedBank, setSelectedBank, selectedBU, setSelectedBU, selectedUser, setSelectedUser,
    totalStatements, dm, g,
  } = props;

  return (
    <div className="bg-white border border-gray-200 p-6 shadow-xs space-y-6">
      <MetricsFilterBar
        timePeriod={timePeriod} setTimePeriod={setTimePeriod}
        isCustomDateActive={isCustomDateActive} setIsCustomDateActive={setIsCustomDateActive}
        customStartDate={customStartDate} setCustomStartDate={setCustomStartDate}
        customEndDate={customEndDate} setCustomEndDate={setCustomEndDate}
        doFetchMetrics={doFetchMetrics}
        bankOptions={bankOptions} buOptions={buOptions} userOptions={userOptions}
        selectedBank={selectedBank} setSelectedBank={setSelectedBank}
        selectedBU={selectedBU} setSelectedBU={setSelectedBU}
        selectedUser={selectedUser} setSelectedUser={setSelectedUser}
      />

      <MetricsKpiGrid
        emoji="📊" title="Inbound Transactions"
        items={[
          { icon: <FileText size={12} className="text-[#222222]" />, label: "Bank Statements", value: totalStatements, sub: "Statement files uploaded", accent: "#222222" },
          { icon: <Layers size={12} className="text-[#222222]" />, label: "Total Transactions Received", value: dm.total_rows_ingested ?? 0, sub: "All line items from bank statement with credit only", accent: "#222222" },
        ]}
      />

      <MetricsKpiGrid
        emoji="✓" title="System Matching Results" size="sm"
        items={[
          { icon: <Sparkles size={12} className="text-emerald-500" />, label: "Identified Matches", value: dm.identified ?? 0, sub: "Customer name or invoice number found", accent: "#10b981" },
          { icon: <HelpCircle size={12} className="text-red-400" />, label: "Unidentified (Blocked)", value: g.unidentified ?? 0, sub: "No matching customer name or invoice number", accent: "#e11d48" },
          { icon: <Calendar size={12} className="text-amber-500" />, label: "Needs Remittance Follow-Up", value: g.needs_remittance ?? 0, sub: "Variance: amount, date, invoice mapping, etc", accent: "#f59e0b" },
          { icon: <Sparkles size={12} className="text-emerald-500" />, label: "Ready for Approval", value: g.ready_for_oracle ?? 0, sub: "Exact match, one-click post to Oracle", accent: "#10b981" },
        ]}
      />

      <MetricsKpiGrid
        emoji="⚠️" title="Exceptions & Conflicts" size="sm" columns="grid-cols-2 lg:grid-cols-3"
        items={[
          { icon: <AlertTriangle size={12} className="text-red-500" />, label: "Conflict / Exception", value: g.conflict_exception ?? 0, sub: "Mismatch on customer/invoice/amount/OU", accent: "#dc2626" },
          { icon: <Ban size={12} className="text-gray-400" />, label: "Rejected", value: g.rejected ?? 0, sub: "Rejected by system or SPOC", accent: "#6b7280" },
          { icon: <Ban size={12} className="text-gray-400" />, label: "Post Failed", value: g.post_failed ?? 0, sub: "Approved but Oracle post errored", accent: "#6b7280" },
        ]}
      />

      <MetricsKpiGrid
        emoji="✅" title="Completed"
        items={[
          { icon: <ClipboardCheck size={12} className="text-emerald-600" />, label: "Invoice Mapped", value: g.processed ?? 0, sub: "Approved and invoice-mapped in Oracle AR", accent: "#222222" },
        ]}
      />
    </div>
  );
}
