"use client";
import type { KpiItem } from "../types";

interface MetricsKpiGridProps {
  emoji: string;
  title: string;
  items: KpiItem[];
  /** Formats each item's numeric value for display — defaults to plain toLocaleString(). */
  formatValue?: (n: number) => string;
  /** "lg" = the larger cards used for Inbound/Completed sections, "sm" = the compact ones for Matching/Exceptions. */
  size?: "lg" | "sm";
  columns?: string; // Tailwind grid-cols classes override
  /** Overrides the value text size/weight classes — the USD Amount View
   * uses smaller value text ("text-lg"/"text-sm leading-tight") than the
   * count-based Dashboard ("text-2xl"/"text-xl") for the same layout. */
  valueClassName?: string;
}

/**
 * One labeled section of KPI cards (e.g. "Inbound Transactions", "System
 * Matching Results"). Used 8 times across the Dashboard (count) and Amount
 * View (USD) cards — pulling it out as one reusable component collapses
 * what used to be 8 near-identical inline blocks in page.tsx.
 */
export default function MetricsKpiGrid({
  emoji, title, items, formatValue, size = "lg", columns, valueClassName,
}: MetricsKpiGridProps) {
  const fmt = formatValue ?? ((n: number) => n.toLocaleString());
  const gridCols = columns ?? (size === "lg" ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 lg:grid-cols-4");
  const valueClass = valueClassName ?? (size === "lg" ? "text-2xl font-black text-primary" : "text-xl font-black text-primary");
  const padClass = size === "lg" ? "p-4" : "p-3.5";
  const labelClass = size === "lg" ? "text-[10px]" : "text-[9px]";

  return (
    <div className="space-y-3 pt-1">
      <h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-2">
        <span aria-hidden>{emoji}</span> {title}
      </h4>
      <div className={`grid ${gridCols} gap-3`}>
        {items.map(({ icon, label, value, sub, accent }) => (
          <div key={label} className="border border-gray-200 rounded-sm bg-white shadow-xs overflow-hidden">
            <div className="h-0.5" style={{ backgroundColor: accent }} />
            <div className={padClass}>
              <div className="flex items-center gap-1.5 text-gray-400 mb-2">
                {icon}
                <span className={`${labelClass} font-bold uppercase tracking-wider`}>{label}</span>
              </div>
              <div className={valueClass}>{fmt(value)}</div>
              <div className="mt-1.5 text-[10px] text-gray-400 font-medium">{sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
