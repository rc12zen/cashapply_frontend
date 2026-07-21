"use client";
import { METRIC_CONFIG, METRIC_GROUP_KEY, type MetricKey } from "../types";

interface MetricToggleBarProps {
  title: string;
  subtitle: string;
  activeMetrics: Record<MetricKey, boolean>;
  setActiveMetrics: (updater: (prev: Record<MetricKey, boolean>) => Record<MetricKey, boolean>) => void;
  /** The bucket object (Metrics["groups"] or Metrics["group_amounts"]) each toggle pill reads its count from. */
  values: Record<string, number>;
  formatValue?: (n: number) => string;
}

/**
 * The row of toggle pills above each pie chart ("Select Metrics to
 * Display" / "Amount Distribution"). Identical behavior, just fed
 * different `values` (row counts vs USD amounts) — used twice in page.tsx.
 */
export default function MetricToggleBar({
  title, subtitle, activeMetrics, setActiveMetrics, values, formatValue,
}: MetricToggleBarProps) {
  const fmt = formatValue ?? ((n: number) => n.toLocaleString());

  return (
    <div className="lg:col-span-5 space-y-4">
      <div>
        <h4 className="text-xs font-black text-primary uppercase tracking-wider">{title}</h4>
        <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {(Object.keys(METRIC_CONFIG) as MetricKey[]).map((key) => {
          const cfg = METRIC_CONFIG[key];
          const active = activeMetrics[key];
          const val = values[METRIC_GROUP_KEY[key]] ?? 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveMetrics((prev) => ({ ...prev, [key]: !prev[key] }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-bold transition-all shadow-xs cursor-pointer ${active ? "text-primary" : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"}`}
              style={{ borderColor: active ? cfg.color : "" }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: active ? cfg.color : "#d1d5db" }}
              />
              <span>{cfg.name}</span>
              <span
                className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${active ? "text-white" : "bg-gray-100 text-gray-400"}`}
                style={{ backgroundColor: active ? cfg.color : "" }}
              >
                {fmt(val)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
