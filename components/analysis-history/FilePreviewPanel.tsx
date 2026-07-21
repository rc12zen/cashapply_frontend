"use client";

/**
 * components/analysis-history/FilePreviewPanel.tsx
 * =====================================================
 * The "preview an uploaded statement / the active aging report" panel
 * used on the Analysis History page's run-detail view. Extracted from
 * app/analysis-history/page.tsx to keep that file focused on the
 * history list / run-detail orchestration, not this self-contained
 * preview widget.
 */
import { FileText, Layers, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getAgingPreview, getFilePreview } from "@/lib/api";

type PreviewSource = "statement" | "aging";

function PreviewTable({ preview, filter, onFilterChange }: {
  preview: any;
  filter: string;
  onFilterChange: (v: string) => void;
}) {
  const filteredRows = useMemo(() => {
    if (!preview || !filter) return preview?.rows ?? [];
    const q = filter.toLowerCase();
    return preview.rows.filter((row: string[]) => row.some((cell) => cell.toLowerCase().includes(q)));
  }, [preview, filter]);

  if (!preview) return (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-300 min-h-[320px]">
      <FileText size={48} className="mb-3 stroke-[1.25]" />
      <span className="text-xs font-black text-gray-400 uppercase tracking-wider">No Preview</span>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-black text-primary uppercase tracking-wider truncate">{preview.filename}</span>
          <span className="text-[10px] text-gray-400 font-mono shrink-0">{preview.total_rows} rows · {preview.columns.length} cols</span>
        </div>
        <div className="relative shrink-0">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Filter rows…" value={filter} onChange={(e) => onFilterChange(e.target.value)}
            className="bg-white border border-gray-300 rounded-xs text-[10px] font-medium pl-6 pr-2.5 py-1 w-40 outline-none focus:border-[#222222]" />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-[10px]" style={{ minWidth: `${preview.columns.length * 110}px` }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#222222] text-white">
              <th className="px-2 py-2 text-[9px] font-black uppercase tracking-wider text-white/50 w-10 text-center bg-[#222222]">#</th>
              {preview.columns.map((col: string) => (
                <th key={col} className="px-2.5 py-2 text-[9px] font-black uppercase tracking-wider whitespace-nowrap bg-[#222222]">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filteredRows.length === 0 && <tr><td colSpan={preview.columns.length + 1} className="text-center py-10 text-[11px] text-gray-400">No rows match filter.</td></tr>}
            {filteredRows.map((row: string[], ri: number) => (
              <tr key={ri} className="hover:bg-blue-50/30 transition-colors">
                <td className="px-2 py-1.5 text-gray-400 font-mono text-center">{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2.5 py-1.5 font-mono text-gray-700 max-w-[200px] truncate" title={cell}>
                    {cell || <span className="text-gray-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FilePreviewPanel({ statementFiles = [], bucket = "active" }: {
  statementFiles: string[];
  bucket?: string;
}) {
  const [source, setSource]               = useState<PreviewSource>("statement");
  const [activeFile, setActiveFile]       = useState(statementFiles[0] || "");
  const [stmtPreview, setStmtPreview]     = useState<any>(null);
  const [agingPreview, setAgingPreview]   = useState<any>(null);
  const [stmtLoading, setStmtLoading]     = useState(false);
  const [agingLoading, setAgingLoading]   = useState(false);
  const [filter, setFilter]               = useState("");

  // Load statement preview whenever active file changes
  useEffect(() => {
    if (!activeFile) return;
    let cancelled = false;
    setStmtLoading(true); setStmtPreview(null); setFilter("");
    getFilePreview(activeFile, bucket, 200)
      .then((res) => { if (!cancelled) setStmtPreview(res.data); })
      .finally(() => { if (!cancelled) setStmtLoading(false); });
    return () => { cancelled = true; };
  }, [activeFile, bucket]);

  // Load aging preview when user switches to aging tab (lazy — only once)
  useEffect(() => {
    if (source !== "aging" || agingPreview) return;
    let cancelled = false;
    setAgingLoading(true);
    getAgingPreview(500)
      .then((res) => { if (!cancelled) setAgingPreview(res.data); })
      .catch(() => { if (!cancelled) setAgingPreview(null); })
      .finally(() => { if (!cancelled) setAgingLoading(false); });
    return () => { cancelled = true; };
  }, [source, agingPreview]);

  const isLoading = source === "statement" ? stmtLoading : agingLoading;
  const preview   = source === "statement" ? stmtPreview  : agingPreview;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Source toggle ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 px-3 py-2 space-y-2">
        {/* Statement / Aging toggle */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xs p-0.5 w-full">
          <button
            onClick={() => { setSource("statement"); setFilter(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${
              source === "statement" ? "bg-[#222222] text-white" : "text-gray-500 hover:text-[#222222]"
            }`}>
            <FileText size={10} /> Statement
          </button>
          <button
            onClick={() => { setSource("aging"); setFilter(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${
              source === "aging" ? "bg-[#222222] text-white" : "text-gray-500 hover:text-[#222222]"
            }`}>
            <Layers size={10} /> Ageing Report
          </button>
        </div>

        {/* File selector (statement only, when multiple files) */}
        {source === "statement" && statementFiles.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {statementFiles.map((f) => (
              <button key={f} onClick={() => setActiveFile(f)}
                className={`flex items-center gap-1 px-2 py-1 rounded-xs text-[9px] font-bold uppercase tracking-wider border cursor-pointer truncate max-w-[140px] ${
                  activeFile === f
                    ? "bg-[#222222] text-white border-[#222222]"
                    : "bg-white text-gray-600 border-gray-300 hover:border-[#222222]"
                }`}>
                <FileText size={9} /><span className="truncate">{f}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 min-h-[320px]">
          <Loader2 size={28} className="animate-spin" />
          <span className="text-xs font-bold uppercase tracking-wider">
            {source === "aging" ? "Loading ageing report…" : "Loading preview…"}
          </span>
        </div>
      ) : (
        <PreviewTable preview={preview} filter={filter} onFilterChange={setFilter} />
      )}
    </div>
  );
}
