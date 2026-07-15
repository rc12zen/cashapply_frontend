"use client";
/**
 * ConfigResolveDialog
 * ===================
 * Shown when a file matches more than one account config (rare — different
 * layouts), or from "Reconfigure" to test the current config before rebuilding.
 *
 * Detection is content-based (no pin), so there's nothing to "assign": the user
 * either fixes/deletes a conflicting config, or builds a new one. Each candidate
 * can be tested against the file (row count + preview).
 */
import { AlertCircle, Check, FileText, Loader2, Play, Plus, X } from "lucide-react";
import { useState } from "react";
import { testExistingConfig } from "@/lib/configBuilderApi";
import { getErrorMessage } from "@/lib/errorMessage";

interface Candidate {
  config_key: string;        // account number
  account_number?: string;
  display_name: string;
  bank?: string;
  currency?: string;
  format?: string;
}

interface TestState { loading: boolean; success?: boolean; row_count?: number; error?: string; rows?: any[]; }

interface Props {
  filename: string;
  candidates: Candidate[];
  mode: "ambiguous" | "reconfigure";
  onBuildNew: () => void;
  onClose: () => void;
}

export default function ConfigResolveDialog({ filename, candidates, mode, onBuildNew, onClose }: Props) {
  const [tests, setTests] = useState<Record<string, TestState>>({});

  const runTest = async (c: Candidate) => {
    setTests((p) => ({ ...p, [c.config_key]: { loading: true } }));
    try {
      const res = await testExistingConfig(filename, c.config_key, c.format);
      setTests((p) => ({ ...p, [c.config_key]: { loading: false, ...res.data } }));
    } catch (e: any) {
      setTests((p) => ({ ...p, [c.config_key]: { loading: false, success: false, error: getErrorMessage(e, "Test failed") } }));
    }
  };

  const heading = mode === "ambiguous" ? "Multiple configs match this file" : "Check the matched config";
  const sub = mode === "ambiguous"
    ? "More than one account config fits this file, with different layouts. Test each, then fix or delete the wrong one in Manage, or build a new config."
    : "Test the current config against this file. If it's wrong, build a new one.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-2xl max-h-[85vh] flex flex-col rounded shadow-xl overflow-hidden">
        <div className="bg-[#1E3A5F] text-white px-5 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={15} className="text-[#4A90E2] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-wider">{heading}</div>
              <div className="text-[10px] text-gray-400 font-mono truncate">{filename}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 cursor-pointer"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-gray-500">{sub}</p>

          {candidates.length === 0 && (
            <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded p-4 text-center">
              No account config matches this file. Build a new one below.
            </div>
          )}

          {candidates.map((c) => {
            const t = tests[c.config_key];
            return (
              <div key={c.config_key} className="border border-gray-200 rounded p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-black text-primary truncate">{c.display_name}</div>
                    <div className="text-[10px] font-mono text-gray-400 truncate">
                      {c.config_key}{c.format ? ` · ${c.format}` : ""}
                    </div>
                  </div>
                  <button onClick={() => runTest(c)} disabled={t?.loading}
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide border border-gray-300 text-gray-600 hover:border-[#4A90E2] hover:text-[#2E6DA4] px-2.5 py-1.5 rounded-sm cursor-pointer disabled:opacity-50">
                    {t?.loading ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />} Test
                  </button>
                </div>

                {t && !t.loading && (t.success ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                      <Check size={12} /> {t.row_count?.toLocaleString()} credit row{t.row_count === 1 ? "" : "s"}
                    </div>
                    {(t.rows?.length ?? 0) > 0 && (
                      <div className="border border-gray-200 rounded overflow-auto max-h-40">
                        <table className="text-[10px] w-full border-collapse">
                          <thead><tr className="bg-gray-50 border-b border-gray-200">
                            {["Date", "Narrative", "Amount", "Acct", "Cur"].map((h) => (
                              <th key={h} className="text-left px-2 py-1 font-black text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {t.rows!.slice(0, 8).map((r, i) => (
                              <tr key={i} className="border-b border-gray-100">
                                <td className="px-2 py-1 font-mono whitespace-nowrap">{r.statement_date?.split(" ")[0] ?? "—"}</td>
                                <td className="px-2 py-1 max-w-[180px] truncate">{r.narrative}</td>
                                <td className="px-2 py-1 font-mono text-right whitespace-nowrap">{typeof r.credit_amount === "number" ? r.credit_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : r.credit_amount}</td>
                                <td className="px-2 py-1 font-mono">{r.account_number}</td>
                                <td className="px-2 py-1 font-mono">{r.currency}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5 text-red-700 text-[11px] bg-red-50 border border-red-200 px-2.5 py-2 rounded">
                    <AlertCircle size={12} className="shrink-0 mt-0.5" /><span className="font-mono whitespace-pre-wrap">{t.error}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-gray-400">{candidates.length} matching config{candidates.length === 1 ? "" : "s"}</span>
          <button onClick={onBuildNew} className="flex items-center gap-1.5 text-xs font-bold text-[#2E6DA4] hover:underline cursor-pointer">
            <Plus size={13} /> Build a new config
          </button>
        </div>
      </div>
    </div>
  );
}