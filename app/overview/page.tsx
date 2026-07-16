"use client";
/**
 * Overview — /app/overview/page.tsx
 * ====================================
 * The metrics dashboard + category pie charts, moved out of the Home page
 * (which now only shows Welcome / Upload / Run Analysis — see app/home).
 * Self-contained: fetches its own metrics/filter data rather than sharing
 * Home's state, since the two pages are now independent.
 *
 * The pie charts were rebuilt (CategoryPieCard) to match the
 * Category_Pie_Charts.html reference — two side-by-side donuts (by count,
 * by USD value) with a center total and a 2-column legend — replacing the
 * old single toggleable Recharts donut.
 */
import { useCallback, useEffect, useState } from "react";
import { PieChart as PieIcon } from "lucide-react";
import { getFilterOptions, getMetrics, getRunHistory } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import DashboardMetricsCard from "../home/components/DashboardMetricsCard";
import CategoryPieCard, { type PieDatum } from "./components/CategoryPieCard";
import { METRIC_CONFIG, METRIC_GROUP_KEY, type Metrics, type MetricKey } from "../home/types";

const EMPTY_GROUPS: Metrics["groups"] = {
  unidentified: 0, needs_remittance: 0, ready_for_oracle: 0,
  conflict_exception: 0, processed: 0, rejected: 0, post_failed: 0,
};
const EMPTY_GA: Record<string, number> = {};

export default function OverviewPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(true);

  const [timePeriod, setTimePeriod]                 = useState("Last Analysis");
  const [isCustomDateActive, setIsCustomDateActive] = useState(false);
  const [customStartDate, setCustomStartDate]       = useState("");
  const [customEndDate, setCustomEndDate]           = useState("");

  const [bankOptions, setBankOptions] = useState<string[]>([]);
  const [buOptions, setBuOptions]     = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<string[]>([]);
  const [selectedBank, setSelectedBank] = useState("All Banks");
  const [selectedBU, setSelectedBU]     = useState("All BUs");
  const [selectedUser, setSelectedUser] = useState("All Users");

  const buildDateRange = (period: string, cStart: string, cEnd: string) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date(); const today = fmt(now);
    if (period === "Today")  return { date_from: today, date_to: today };
    if (period === "Yesterday") { const y = new Date(now); y.setDate(y.getDate() - 1); const ys = fmt(y); return { date_from: ys, date_to: ys }; }
    if (period === "WTD") { const m = new Date(now); m.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return { date_from: fmt(m), date_to: today }; }
    if (period === "MTD") { return { date_from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), date_to: today }; }
    if (period === "Custom Date") { return { date_from: cStart || undefined, date_to: cEnd || undefined }; }
    return {};
  };

  const doFetchMetrics = useCallback(async (period: string, cStart: string, cEnd: string) => {
    setLoading(true);
    try {
      let runId: number | undefined;
      let dateFrom: string | undefined;
      let dateTo:   string | undefined;

      if (period === "Last Analysis") {
        const histRes = await getRunHistory(1, 1, undefined, undefined, undefined, undefined, undefined, "completed");
        runId = histRes.data.data?.[0]?.run_id;
      } else {
        const dr = buildDateRange(period, cStart, cEnd);
        dateFrom = (dr as any).date_from;
        dateTo   = (dr as any).date_to;
      }

      const bankFilter = selectedBank !== "All Banks" ? selectedBank : undefined;
      const buFilter   = selectedBU   !== "All BUs"   ? selectedBU   : undefined;
      const userFilter = selectedUser !== "All Users" ? selectedUser : undefined;

      const res = await getMetrics(runId, dateFrom, dateTo, bankFilter, buFilter, userFilter);
      setMetrics(res.data);
      setError("");
    } catch (e) {
      setError(getErrorMessage(e, "Could not load metrics."));
    } finally {
      setLoading(false);
    }
  }, [selectedBank, selectedBU, selectedUser]);

  useEffect(() => {
    getFilterOptions()
      .then((res) => {
        setBankOptions(res.data.banks || []);
        setBuOptions(res.data.business_units || []);
        setUserOptions(res.data.users || []);
      })
      .catch(() => {});
    doFetchMetrics("Last Analysis", "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    doFetchMetrics(timePeriod, customStartDate, customEndDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBank, selectedBU, selectedUser]);

  const g  = metrics?.groups ?? EMPTY_GROUPS;
  const ga = metrics?.group_amounts ?? EMPTY_GA;
  const dm = metrics || { total_rows_ingested: 0, identified: 0, groups: EMPTY_GROUPS };

  const countData: PieDatum[] = (Object.keys(METRIC_CONFIG) as MetricKey[]).map((key) => ({
    id: key,
    name: METRIC_CONFIG[key].name,
    value: g[METRIC_GROUP_KEY[key]] ?? 0,
    color: METRIC_CONFIG[key].color,
  }));
  const valueData: PieDatum[] = (Object.keys(METRIC_CONFIG) as MetricKey[]).map((key) => ({
    id: key,
    name: METRIC_CONFIG[key].name,
    value: ga[METRIC_GROUP_KEY[key]] ?? 0,
    color: METRIC_CONFIG[key].color,
  }));
  const totalCount = countData.reduce((sum, d) => sum + d.value, 0);
  const totalValue = valueData.reduce((sum, d) => sum + d.value, 0);
  const fmtUsd = (v: number) =>
    v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : `$${v.toLocaleString()}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#222222]">Overview</h1>
        <p className="text-sm text-[#6B7688] mt-1">
          Metrics and category breakdowns across your analyses.
        </p>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2.5 rounded">
          {error}
        </div>
      )}

      <DashboardMetricsCard
        timePeriod={timePeriod} setTimePeriod={setTimePeriod}
        isCustomDateActive={isCustomDateActive} setIsCustomDateActive={setIsCustomDateActive}
        customStartDate={customStartDate} setCustomStartDate={setCustomStartDate}
        customEndDate={customEndDate} setCustomEndDate={setCustomEndDate}
        doFetchMetrics={doFetchMetrics}
        bankOptions={bankOptions} buOptions={buOptions} userOptions={userOptions}
        selectedBank={selectedBank} setSelectedBank={setSelectedBank}
        selectedBU={selectedBU} setSelectedBU={setSelectedBU}
        selectedUser={selectedUser} setSelectedUser={setSelectedUser}
        totalStatements={metrics?.total_statements ?? 0}
        dm={dm}
        g={g}
        ga={ga}
        fmtUsd={fmtUsd}
      />

      <div>
        <div className="flex items-center gap-2 mb-3">
          <PieIcon size={15} className="text-[#222222]" />
          <h2 className="text-sm font-bold text-[#222222] uppercase tracking-wider">Category Pie Charts</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <CategoryPieCard
            title="Transactions by Category"
            description="How many transactions fall into each category, this period."
            data={countData}
            total={totalCount}
          />
          <CategoryPieCard
            title="Value by Category"
            description="Same categories as above, shown by dollar amount instead of count."
            data={valueData}
            total={totalValue}
            formatValue={fmtUsd}
          />
        </div>
      </div>

      {loading && !metrics && (
        <div className="text-xs text-gray-400">Loading metrics…</div>
      )}
    </div>
  );
}