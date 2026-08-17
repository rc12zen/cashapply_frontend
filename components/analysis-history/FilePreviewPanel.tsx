"use client";

/**
 * components/analysis-history/FilePreviewPanel.tsx
 * =====================================================
 * The "preview an uploaded statement / an aging report" panel used on the
 * Analysis History page's run-detail view. Extracted from
 * app/analysis-history/page.tsx to keep that file focused on the
 * history list / run-detail orchestration, not this self-contained
 * preview widget.
 *
 * PATCH: aging reports get replaced over time (new upload / watch-folder
 * drop), but a past run matched against whatever aging report was active
 * WHEN IT RAN — which may no longer be the active one. This panel now
 * offers up to two independent aging tabs instead of one:
 *   - "Run's Aging Report"   — the historical snapshot the viewed run
 *                              actually matched against (AnalysisRun.
 *                              aging_source_file_id, resolved server-side).
 *                              Only shown when the caller supplies
 *                              runAgingSourceFileId (older runs that predate
 *                              this field, or that ran before any aging
 *                              report existed, simply won't have one).
 *   - "Active Aging Report" — whatever is active right now (unchanged
 *                              behavior from before this patch).
 * Each tab has its own preview/loading state and its own download, but
 * both render through the same PreviewTable — so search/filter behavior
 * is identical regardless of which aging tab (or the statement tab) is
 * selected; nothing about the filter logic itself changed.
 */
import { Download, FileText, Layers, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { downloadAgingReport, getAgingPreview, getFilePreview } from "@/lib/api";
import { downloadBlob } from "@/lib/download";

type PreviewSource = "statement" | "aging_run" | "aging_active";

function PreviewTable({ preview, filter, onFilterChange, onDownload }: {
  preview: any;
  filter: string;
  onFilterChange: (v: string) => void;
  onDownload?: () => void;
}) {
  const filteredRows = useMemo(() => {
    if (!preview || !filter) return preview?.rows ?? [];
    const q = filter.toLowerCase();
    return preview.rows.filter((row: string[]) => row.some((cell) => String(cell ?? "").toLowerCase().includes(q)));
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
          {onDownload && (
            <button onClick={onDownload} title="Download original file"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs border border-gray-300 bg-white text-gray-600 hover:border-[#222222] hover:text-[#222222] shrink-0 cursor-pointer">
              <Download size={10} />
            </button>
          )}
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

export default function FilePreviewPanel({
  statementFiles = [], bucket = "active", runAgingSourceFileId, runAgingSourceFilename,
}: {
  statementFiles: string[];
  bucket?: string;
  // PATCH: the aging report snapshot the viewed run matched against.
  // Undefined/null (no run context, or the run predates this field) simply
  // hides the "Run's Aging Report" tab — "Active Aging Report" is always
  // available regardless.
  runAgingSourceFileId?: number | null;
  runAgingSourceFilename?: string | null;
}) {
  const hasRunAgingSnapshot = runAgingSourceFileId != null;

  const [source, setSource]                     = useState<PreviewSource>("statement");
  const [activeFile, setActiveFile]             = useState(statementFiles[0] || "");
  const [stmtPreview, setStmtPreview]           = useState<any>(null);
  const [stmtLoading, setStmtLoading]           = useState(false);
  const [runAgingPreview, setRunAgingPreview]   = useState<any>(null);
  const [runAgingLoading, setRunAgingLoading]   = useState(false);
  const [activeAgingPreview, setActiveAgingPreview] = useState<any>(null);
  const [activeAgingLoading, setActiveAgingLoading] = useState(false);
  const [filter, setFilter]                     = useState("");

  // Load statement preview whenever active file changes
  useEffect(() => {
    if (!activeFile) return;
    let cancelled = false;
    setStmtLoading(true); setStmtPreview(null); setFilter("");
    getFilePreview(activeFile, bucket, 200)
      .then((res) => { if (!cancelled) setStmtPreview(res.data); })
      // Roles without run:monitor (e.g. Oracle Operator, Auditor) get a 403
      // here — fail gracefully to an empty preview instead of an unhandled
      // rejection (mirrors the aging-preview handlers below).
      .catch(() => { if (!cancelled) setStmtPreview(null); })
      .finally(() => { if (!cancelled) setStmtLoading(false); });
    return () => { cancelled = true; };
  }, [activeFile, bucket]);

  // Load the RUN's aging snapshot when that tab is first opened (lazy — only once)
  useEffect(() => {
    if (source !== "aging_run" || runAgingPreview || !hasRunAgingSnapshot) return;
    let cancelled = false;
    setRunAgingLoading(true);
    getAgingPreview(500, runAgingSourceFileId!)
      .then((res) => { if (!cancelled) setRunAgingPreview(res.data); })
      .catch(() => { if (!cancelled) setRunAgingPreview(null); })
      .finally(() => { if (!cancelled) setRunAgingLoading(false); });
    return () => { cancelled = true; };
  }, [source, runAgingPreview, hasRunAgingSnapshot, runAgingSourceFileId]);

  // Load the ACTIVE aging report when that tab is first opened (lazy — only once)
  useEffect(() => {
    if (source !== "aging_active" || activeAgingPreview) return;
    let cancelled = false;
    setActiveAgingLoading(true);
    getAgingPreview(500)
      .then((res) => { if (!cancelled) setActiveAgingPreview(res.data); })
      .catch(() => { if (!cancelled) setActiveAgingPreview(null); })
      .finally(() => { if (!cancelled) setActiveAgingLoading(false); });
    return () => { cancelled = true; };
  }, [source, activeAgingPreview]);

  const isLoading =
    source === "statement" ? stmtLoading :
    source === "aging_run" ? runAgingLoading :
    activeAgingLoading;

  const preview =
    source === "statement" ? stmtPreview :
    source === "aging_run" ? runAgingPreview :
    activeAgingPreview;

  const makeDownloadHandler = (sourceFileId: number | undefined, preview: any) => async () => {
    const res = await downloadAgingReport(sourceFileId);
    // PATCH: the backend now streams the real .xlsx/.xls/.csv directly
    // instead of wrapping it in a zip (a zip-of-a-zip opened straight into
    // Excel/OneDrive was throwing "file format may not be matching with
    // the file extension" — see config_routes.py's aging_download()).
    // Save with the file's own name/extension, not a forced ".zip".
    //
    // downloadBlob() sanitises that server-supplied name before it becomes a
    // `download` attribute, and keeps the deferred revokeObjectURL() this
    // call site needed (revoking immediately races the browser's async blob
    // read on large files and truncates the download).
    downloadBlob(res.data, preview?.filename, "aging_report");
  };

  const onDownload =
    source === "aging_run"    ? makeDownloadHandler(runAgingSourceFileId ?? undefined, runAgingPreview) :
    source === "aging_active" ? makeDownloadHandler(undefined, activeAgingPreview) :
    undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Source toggle ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 px-3 py-2 space-y-2">
        {/* Statement / Run's Aging / Active Aging toggle */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xs p-0.5 w-full">
          <button
            onClick={() => { setSource("statement"); setFilter(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${
              source === "statement" ? "bg-[#222222] text-white" : "text-gray-500 hover:text-[#222222]"
            }`}>
            <FileText size={10} /> Statement
          </button>
          {hasRunAgingSnapshot && (
            <button
              onClick={() => { setSource("aging_run"); setFilter(""); }}
              title={runAgingSourceFilename || undefined}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${
                source === "aging_run" ? "bg-[#222222] text-white" : "text-gray-500 hover:text-[#222222]"
              }`}>
              <Layers size={10} /> Run&apos;s Ageing Report
            </button>
          )}
          <button
            onClick={() => { setSource("aging_active"); setFilter(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xs transition-all cursor-pointer ${
              source === "aging_active" ? "bg-[#222222] text-white" : "text-gray-500 hover:text-[#222222]"
            }`}>
            <Layers size={10} /> Active Ageing Report
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
            {source === "statement" ? "Loading preview…" : "Loading ageing report…"}
          </span>
        </div>
      ) : (
        <PreviewTable preview={preview} filter={filter} onFilterChange={setFilter} onDownload={onDownload} />
      )}
    </div>
  );
}