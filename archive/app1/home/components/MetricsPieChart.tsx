"use client";
import { PieChart as PieIcon } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PieDatum } from "../types";

interface MetricsPieChartProps {
  title: string;
  data: PieDatum[];
  emptyLabel: string;
  tooltipFormatter?: (value: number) => string;
}

/**
 * The donut chart + legend, shared by the count-based "Proportional
 * Distribution Share" and the USD-based "Amount Distribution (USD)"
 * charts — identical markup, different data + optional value formatter.
 */
export default function MetricsPieChart({ title, data, emptyLabel, tooltipFormatter }: MetricsPieChartProps) {
  return (
    <div className="lg:col-span-7 border border-gray-200 p-5 rounded-sm bg-gray-50/10 flex flex-col items-center justify-center min-h-[340px]">
      <div className="w-full text-left mb-4 flex items-center gap-2">
        <PieIcon size={14} className="text-accent" />
        <span className="text-xs font-bold text-primary uppercase tracking-wider">{title}</span>
      </div>
      {data.length > 0 ? (
        <div className="w-full h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="48%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={tooltipFormatter ? ((value: number) => tooltipFormatter(value)) : undefined}
                contentStyle={{
                  backgroundColor: "#1E3A5F",
                  borderColor: "#172e4c",
                  borderRadius: "2px",
                }}
                itemStyle={{ color: "#fff", fontSize: "12px" }}
              />
              <Legend
                verticalAlign="bottom"
                align="center"
                iconType="rect"
                iconSize={10}
                wrapperStyle={{
                  fontSize: "11px",
                  fontWeight: 600,
                  paddingTop: "10px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-xs text-gray-400 font-medium text-center py-12">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}
