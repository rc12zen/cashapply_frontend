"use client";

/**
 * components/row-detail/RawResponseViewer.tsx
 * ==============================================
 * Collapsible raw-JSON viewer used for Oracle receipt/reference
 * responses on the Row Detail page. Extracted from
 * app/analysis-history/row/[id]/page.tsx.
 */
export function RawResponseViewer({ title, data }: { title: string; data: any }) {
  const [open, setOpen] = useState(false);
  // PATCH: this used to `return null` entirely when data was missing —
  // which looked exactly like the section didn't exist at all, with zero
  // indication anything was ever supposed to be here. Now always renders
  // the header; only the expand behavior changes based on whether data
  // is actually present.
  const hasData = data != null;
  return (
    <div className="border border-gray-200 rounded-xs overflow-hidden">
      <button
        onClick={() => hasData && setOpen(v => !v)}
        disabled={!hasData}
        className={`w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 transition-colors ${hasData ? "hover:bg-gray-100 cursor-pointer" : "cursor-default"}`}
      >
        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">{title}</span>
        <span className={`text-[9px] font-bold ${hasData ? "text-gray-400" : "text-gray-300 italic"}`}>
          {hasData ? (open ? "Hide" : "Show") : "Not recorded for this row"}
        </span>
      </button>
      {!hasData && (
        <p className="px-4 py-2.5 text-[9px] text-gray-400 leading-relaxed border-t border-gray-100">
          This row's receipt/mapping ran before this response was being saved, or that step hasn't run yet.
        </p>
      )}
      {open && (
        <pre className="text-[9px] font-mono text-gray-600 leading-relaxed whitespace-pre-wrap break-words bg-white p-3 max-h-[320px] overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
