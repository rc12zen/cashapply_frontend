"use client";

/**
 * components/row-detail/SharedCardPieces.tsx
 * =============================================
 * Small, reusable presentational pieces used across the Row Detail
 * page's cards (DataRow, CardShell, CardHead). Extracted from
 * app/analysis-history/row/[id]/page.tsx.
 */

export function DataRow({ label, value, mono = false }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 pt-0.5 min-w-[120px]">{label}</span>
      <span className={`text-[11px] font-semibold text-gray-800 text-right break-all leading-snug ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

export function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
      {children}
    </div>
  );
}

export function CardHead({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50/70">
      <div className="flex items-center gap-2.5">
        <span className="text-[#222222]">{icon}</span>
        <span className="text-[10px] font-black text-[#222222] uppercase tracking-widest">{title}</span>
      </div>
      {right}
    </div>
  );
}

