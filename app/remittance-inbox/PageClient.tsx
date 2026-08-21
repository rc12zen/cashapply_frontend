"use client";
/**
 * Remittance Emails — /app/remittance-inbox/page.tsx
 * =====================================================
 * New page: browse every remittance email/document App2 has extracted
 * (RemittanceExtraction), independent of any specific row — previously
 * the only way to see a remittance was the reverse direction (open a row,
 * see its one matched remittance in the row-detail panel).
 *
 * "Matched" here is never recomputed live — it reflects whatever
 * LineItem.remittance_extraction_id already says server-side (set the
 * moment a match is made during a run, a manual recheck, or a
 * customer-name correction re-match). See backend
 * bff/remittance_inbox_routes.py for the exact join.
 *
 * A remittance can in principle match more than one row (re-matched after
 * a correction, or amount/date coincidence across separate runs) — every
 * match found is shown as its own "View Row →" link, not just the first.
 */
import {
  AlertTriangle, ArrowUpRight, Calendar, Layers, Loader2, Mail, RefreshCw, Search,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRemittanceInbox } from "@/lib/api";
import { usePageGuard } from "@/lib/usePageGuard";
import PageAccessDenied from "@/components/PageAccessDenied";

interface RemittanceRowMatch {
  line_item_id: number;
  run_id: number | null;
  category: string;
}

interface RemittanceInboxEntry {
  id: number;
  subject: string | null;
  sender: string | null;
  payer: string | null;
  customer_name: string | null;
  payment_reference: string | null;
  payment_date: string | null;
  payment_amount: number | null;
  payment_currency: string | null;
  filename: string | null;
  extracted_at: string | null;
  matched: boolean;
  matches: RemittanceRowMatch[];
}

type StatusFilter = "all" | "matched" | "unmatched";

const STATUS_PILLS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unmatched", label: "Unmatched" },
  { key: "matched", label: "Matched" },
];

function fmtTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtAmount(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RemittanceInboxPage() {
  const { allowed, checking } = usePageGuard("run:view");
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery]   = useState("");

  const [entries, setEntries] = useState<RemittanceInboxEntry[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const pageSize = 50;

  const load = useCallback(async (pageArg: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await getRemittanceInbox({
        page: pageArg,
        pageSize,
        search: searchQuery || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setEntries(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch {
      setEntries([]);
      setTotal(0);
      setError("Could not load remittance emails from the backend.");
    }
    setLoading(false);
  }, [searchQuery, statusFilter]);

  // Debounced search — mirrors the pattern of resetting to page 1 whenever
  // a filter changes, but waits briefly so every keystroke doesn't fire a
  // request.
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(1); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter]);

  const goToRow = (m: RemittanceRowMatch) => {
    router.push(`/analysis-history/row/${m.line_item_id}${m.run_id ? `?run_id=${m.run_id}` : ""}`);
  };

  if (checking) return null;
  if (!allowed) return <PageAccessDenied />;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <h1 className="text-xl font-black text-primary uppercase tracking-wider flex items-center gap-2">
            <Mail size={18} /> <span>Remittance Emails</span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5 font-medium">
            Every remittance email/document extracted, and which row (if any) it's been matched to.
          </p>
        </div>

        <button
          onClick={() => load(page)}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-primary cursor-pointer border border-gray-300 hover:border-[#222222] px-3 py-2.5 rounded-sm transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border-l-2 border-red-600 p-3 text-xs flex items-center gap-2.5 text-gray-900">
          <AlertTriangle size={14} className="text-red-600 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* STATUS PILLS */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 p-1.5 rounded-sm shadow-2xs w-max max-w-full overflow-x-auto select-none">
        {STATUS_PILLS.map((pill) => (
          <button
            key={pill.key}
            onClick={() => setStatusFilter(pill.key)}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xs transition-all whitespace-nowrap cursor-pointer ${
              statusFilter === pill.key
                ? "bg-[#222222] text-white shadow-xs"
                : "text-gray-500 hover:text-primary hover:bg-gray-50"
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* SEARCH */}
      <div className="bg-white border border-gray-200 p-4 rounded-sm shadow-2xs">
        <div className="relative max-w-md">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search subject, sender, payer, customer, reference…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-50 border border-gray-300 text-xs font-medium text-primary pl-9 pr-3 py-2 rounded-sm focus:outline-none focus:border-[#222222]"
          />
        </div>
      </div>

      {/* LIST */}
      <div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50/60 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <th className="text-left px-4 py-2.5">Received</th>
                <th className="text-left px-4 py-2.5">Subject</th>
                <th className="text-left px-4 py-2.5">Sender / Payer</th>
                <th className="text-left px-4 py-2.5">Customer (extracted)</th>
                <th className="text-right px-4 py-2.5">Amount</th>
                <th className="text-left px-4 py-2.5">Payment Date</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Row</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-14 text-gray-400">
                    <Loader2 size={20} className="animate-spin inline-block mr-2" /> Loading remittance emails…
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-14 text-gray-400">
                    <Layers className="text-gray-300 mx-auto mb-2 stroke-[1.5]" size={32} />
                    <p className="text-xs font-black uppercase tracking-wider">Nothing to show</p>
                    <p className="text-[11px] text-gray-400 mt-1">Try a different filter, or clear your search.</p>
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50/50 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmtTimestamp(e.extracted_at)}</td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="font-bold text-primary truncate" title={e.subject || undefined}>
                        {e.subject || "—"}
                      </div>
                      {e.filename && (
                        <div className="text-[10px] text-gray-400 font-mono truncate" title={e.filename}>{e.filename}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <div className="truncate" title={e.sender || undefined}>{e.sender || "—"}</div>
                      {e.payer && e.payer !== e.sender && (
                        <div className="text-[10px] text-gray-400 truncate" title={e.payer}>{e.payer}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[160px] truncate" title={e.customer_name || undefined}>
                      {e.customer_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-bold">
                      {fmtAmount(e.payment_amount)} {e.payment_currency || ""}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{fmtTimestamp(e.payment_date)}</td>
                    <td className="px-4 py-3">
                      {e.matched ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider border rounded-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">
                          Matched
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider border rounded-xs px-2 py-0.5 bg-amber-50 text-amber-700 border-amber-200">
                          Unmatched
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {e.matches.length === 0 ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {e.matches.map((m) => (
                            <button
                              key={m.line_item_id}
                              onClick={() => goToRow(m)}
                              className="flex items-center gap-1 text-[11px] font-bold text-[#222222] hover:underline cursor-pointer whitespace-nowrap"
                              title={m.category || undefined}
                            >
                              Row #{m.line_item_id}{m.run_id ? ` · Run #${m.run_id}` : ""}
                              <ArrowUpRight size={11} className="shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAGINATION */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-xs font-bold text-gray-500">
          <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))} — {total} entries</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => { const p = page - 1; setPage(p); load(p); }}
              className="px-3 py-1.5 border border-gray-300 rounded-sm disabled:opacity-40 hover:border-[#222222] cursor-pointer disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={page >= Math.ceil(total / pageSize) || loading}
              onClick={() => { const p = page + 1; setPage(p); load(p); }}
              className="px-3 py-1.5 border border-gray-300 rounded-sm disabled:opacity-40 hover:border-[#222222] cursor-pointer disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}