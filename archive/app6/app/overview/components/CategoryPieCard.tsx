"use client";
/**
 * CategoryPieCard
 * =================
 * Matches the Category_Pie_Charts.html reference: a card with a title +
 * description header, a donut chart with a "TOTAL" center label, value
 * labels on/near each slice, and a 2-column legend grid below (dot + name +
 * value). Used twice on the Overview page — once for transaction counts,
 * once for USD amounts — same component, different data + formatter.
 */
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

export interface PieDatum {
  id: string;
  name: string;
  value: number;
  color: string;
}

const RADIAN = Math.PI / 180;

// Recharts doesn't auto-position custom label content — this computes where
// each slice's value label goes: inside the ring for normal-sized slices,
// pushed just outside for very thin ones (mirrors the reference's small-slice
// callouts) so a "2%" sliver's number doesn't get crushed into unreadable text.
function renderSliceLabel(formatValue: (v: number) => string) {
  return (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent, value } = props;
    if (percent < 0.015) return null; // too small to label at all
    const isSmall = percent < 0.06;
    const r = isSmall ? outerRadius + 18 : (innerRadius + outerRadius) / 2;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x} y={y}
        textAnchor={isSmall ? (x > cx ? "start" : "end") : "middle"}
        dominantBaseline="middle"
        fontSize={isSmall ? 11 : 12}
        fontWeight={700}
        fill={isSmall ? "#222222" : "#ffffff"}
      >
        {formatValue(value)}
      </text>
    );
  };
}

export default function CategoryPieCard({
  title, description, data, total, totalLabel = "TOTAL", formatValue,
}: {
  title: string;
  description: string;
  data: PieDatum[];
  total: number;
  totalLabel?: string;
  formatValue?: (v: number) => string;
}) {
  const fmt = formatValue ?? ((v: number) => v.toLocaleString());
  const hasData = data.some((d) => d.value > 0);

  return (
    <div className="bg-white border border-[#E3E7ED] rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E3E7ED]">
        <p className="text-sm font-bold text-[#222222] mb-0.5">{title}</p>
        <p className="text-[12.5px] text-[#6B7688] m-0">{description}</p>
      </div>

      <div className="px-5 pt-3 pb-1.5 flex justify-center">
        {hasData ? (
          <div className="relative w-full max-w-[300px] aspect-square">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%" cy="50%"
                  innerRadius="56%" outerRadius="98%"
                  paddingAngle={1.5}
                  stroke="#ffffff"
                  strokeWidth={2}
                  isAnimationActive={false}
                  label={renderSliceLabel(fmt)}
                  labelLine={false}
                >
                  {data.map((d) => (
                    <Cell key={d.id} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[11px] font-bold text-[#8A93A6] tracking-wide">{totalLabel}</span>
              <span className="text-xl font-bold text-[#222222]">{fmt(total)}</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 py-16">No data for this period yet.</div>
        )}
      </div>

      {hasData && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-6 pb-5 pt-1.5">
          {data.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-[12.5px] text-[#3B4559]">
              <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: d.color }} />
              {d.name} — {fmt(d.value)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
