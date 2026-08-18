"use client";
/**
 * components/row-detail/ReopenAndReviewModal.tsx
 * ================================================
 * Reopen a rejected row (or a parked overpayment) WITH edits, and see the
 * resulting bucket before committing. Backend: hitl/reopen_with_edits.py via
 * /api/hitl/{id}/reopen-options | reopen-preview | reopen-confirm.
 *
 * WHY THIS REPLACED A ONE-CLICK CONFIRM
 * Reject writes only hitl_status and never touches rule_id, and the bucket is
 * derived from rule_id — so the old pure-undo reopen always handed the row back
 * in the bucket it was rejected from, with the same mapping and no way to change
 * it. A row rejected out of Ready for Oracle came straight back to Ready for
 * Oracle unedited. Editing here is what lets the bucket actually recompute.
 *
 * TWO THINGS THIS SCREEN MUST BE HONEST ABOUT
 *  1. The customer is LOCKED once an Oracle receipt exists. That receipt was
 *     created at analysis time stamped with the current customer, and reject
 *     never voided it — changing the customer here would leave a live receipt
 *     against the wrong account. Enforced server-side too, not just disabled.
 *  2. When bucket_pinned_by is set (a post_failed row), reference_status
 *     outranks rule_id in the bucket precedence, so re-evaluation genuinely
 *     cannot move the row out of that bucket however the rule changes. Say so
 *     rather than showing a recomputation that quietly does nothing.
 *
 * Amounts are never typed — every figure comes from the aging report, same rule
 * as manual invoice mapping. Confirming never posts to Oracle: a row landing in
 * Ready for Oracle still needs an explicit Approve & Post.
 */
import { AlertTriangle, ArrowRight, Check, Info, Loader2, Lock, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getReopenOptions, getReopenInvoices, previewReopen, confirmReopen,
} from "@/lib/api";
import SearchableSelect from "@/components/row-detail/SearchableSelect";
import { fmt, fmtDate, formatApiError } from "@/components/row-detail/types";
import { RULE_LABEL, OVERPAYMENT_DISPOSITION_LABEL } from "@/lib/constants";

interface Snapshot {
  rule_id: string | null;
  reason_code: string | null;
  customer_name: string | null;
  invoice_numbers: string[];
  target_total: number | null;
  shortfall_pct: number | null;
  requires_disposition?: boolean;
  excess_amount?: number | null;
}

interface InvoiceOpt {
  invoice_number: string;
  outstanding_amount: number;
  currency: string;
  customer_name: string;
}

export default function ReopenAndReviewModal({
  recordId, onCancel, onDone,
}: {
  recordId: number;
  onCancel: () => void;
  onDone: () => Promise<void>;
}) {
  const [opts, setOpts]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState("");

  const [customer, setCustomer] = useState("");
  const [invoices, setInvoices] = useState<InvoiceOpt[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [disposition, setDisposition] = useState("");
  const [comment, setComment]   = useState("");

  const [preview, setPreview]   = useState<any>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState("");

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getReopenOptions(recordId);
        if (!alive) return;
        setOpts(res.data);
        setCustomer(res.data.current_customer_name || "");
        setInvoices(res.data.invoices || []);
        // Start from the mapping the row already has, so "reopen unchanged"
        // stays a one-click action rather than making the SPOC rebuild it.
        setSelected(new Set(res.data.current_invoice_numbers || []));
      } catch (e: any) {
        if (alive) setLoadError(formatApiError(e, "Could not load this row for reopening."));
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [recordId]);

  const customerChanged = !!opts && customer !== (opts.current_customer_name || "");
  const originalInvoices: string[] = opts?.current_invoice_numbers || [];
  const invoicesChanged = useMemo(() => {
    const a = [...originalInvoices].sort().join("|");
    const b = [...selected].sort().join("|");
    return a !== b;
  }, [originalInvoices, selected]);

  // ── Preview, debounced on every change ────────────────────────────────────
  const runPreview = useCallback(async () => {
    if (!opts) return;
    setPreviewing(true);
    setSaveError("");
    try {
      const res = await previewReopen(recordId, {
        // Only send what actually changed — an unchanged customer must not look
        // like an edit, or the backend routes to re-evaluation needlessly.
        customer_name: customerChanged ? customer : undefined,
        invoice_numbers: invoicesChanged ? Array.from(selected) : undefined,
        overpayment_disposition: disposition || undefined,
      });
      setPreview(res.data);
    } catch (e: any) {
      setPreview(null);
      setSaveError(formatApiError(e, "Could not evaluate these changes."));
    }
    setPreviewing(false);
  }, [recordId, opts, customer, customerChanged, invoicesChanged, selected, disposition]);

  useEffect(() => {
    if (!opts) return;
    const t = setTimeout(runPreview, 350);
    return () => clearTimeout(t);
  }, [opts, customer, selected, disposition, runPreview]);

  // ── Customer change reloads that customer's invoices ──────────────────────
  const handleCustomerChange = async (name: string) => {
    setCustomer(name);
    setSelected(new Set());
    if (!name) { setInvoices([]); return; }
    try {
      const res = await getReopenInvoices(recordId, name);
      setInvoices(res.data.invoices || []);
    } catch (e: any) {
      setSaveError(formatApiError(e, "Could not load invoices for that customer."));
    }
  };

  const toggle = (n: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });

  const handleConfirm = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await confirmReopen(recordId, {
        customer_name: customerChanged ? customer : undefined,
        invoice_numbers: invoicesChanged ? Array.from(selected) : undefined,
        comment: comment.trim() || undefined,
        expected_version: opts?.version,
        overpayment_disposition: disposition || undefined,
      });
      await onDone();
      onCancel();
    } catch (e: any) {
      setSaveError(formatApiError(e, "Could not reopen this row."));
      setSaving(false);
    }
  };

  const from: Snapshot | undefined = preview?.from;
  const to: Snapshot | undefined   = preview?.to;
  const blockers: { code: string; message: string }[] = preview?.blockers || [];
  const canConfirm = !!preview?.can_confirm && !previewing && !saving;
  const needsDisposition = blockers.some((b) => b.code === "requires_disposition");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={() => !saving && onCancel()}>
      <div className="bg-white rounded-sm shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col"
           onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">
            Reopen &amp; Review
          </h3>
          <button onClick={() => !saving && onCancel()}
                  className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 text-[12px] py-6">
              <Loader2 size={14} className="animate-spin" /> Loading row…
            </div>
          ) : loadError ? (
            <p className="text-[12px] text-red-600 font-semibold">{loadError}</p>
          ) : (
            <>
              {/* ── Why it was rejected ─────────────────────────────────── */}
              <div className="rounded-sm border border-gray-200 bg-gray-50 px-3 py-2.5">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  {opts.reopen_kind === "parked" ? "Parked as" : "Rejected"}
                </p>
                <p className="text-[11px] text-gray-700 leading-snug">
                  {opts.rejection?.comment
                    ? <>&ldquo;{opts.rejection.comment}&rdquo;</>
                    : <span className="text-gray-400 italic">No reason was recorded.</span>}
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {opts.rejection?.rejected_by ? `by ${opts.rejection.rejected_by}` : ""}
                  {opts.rejection?.rejected_at ? ` on ${fmtDate(opts.rejection.rejected_at)}` : ""}
                  {opts.rejection?.rejected_from ? ` · was in ${opts.rejection.rejected_from}` : ""}
                </p>
              </div>

              {/* ── Bucket pinned by Oracle outcome ─────────────────────── */}
              {opts.bucket_pinned_by && (
                <div className="flex items-start gap-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800 leading-snug">
                    This row&apos;s bucket is fixed by its Oracle outcome
                    (<span className="font-semibold">{opts.bucket_pinned_by}</span>), which takes
                    precedence over its rule. You can still correct the mapping here, but reopening
                    will <span className="font-semibold">not</span> move it to a different bucket.
                  </p>
                </div>
              )}

              {/* ── Read-only bank facts ────────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ["Received", `${fmt(opts.bank?.credit_amount)} ${opts.bank?.currency || ""}`],
                  ["Value date", fmtDate(opts.bank?.statement_date) || "—"],
                  ["Account", opts.bank?.account_number || "—"],
                  ["Current rule", opts.reopen_kind ? (RULE_LABEL[from?.rule_id || ""] || from?.rule_id || "—") : "—"],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-sm border border-gray-100 px-2.5 py-1.5">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">{label}</p>
                    <p className="text-[11px] font-mono text-gray-800 truncate" title={String(value)}>{value}</p>
                  </div>
                ))}
              </div>
              {opts.bank?.narrative && (
                <p className="text-[10px] text-gray-500 font-mono break-words">{opts.bank.narrative}</p>
              )}

              {/* ── Customer ────────────────────────────────────────────── */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  Customer
                  {opts.customer_locked && <Lock size={10} className="text-amber-600" />}
                </label>
                {opts.customer_locked ? (
                  <>
                    <p className="text-[12px] font-semibold text-gray-800">
                      {opts.current_customer_name || "—"}
                    </p>
                    <p className="text-[10px] text-amber-700 leading-snug">
                      {opts.customer_locked_reason}
                    </p>
                  </>
                ) : (
                  <SearchableSelect
                    value={customer}
                    onChange={handleCustomerChange}
                    options={opts.customers || []}
                    placeholder="— choose a customer —"
                    searchPlaceholder="Search customers…"
                    emptyMessage="No customer matches your search."
                  />
                )}
              </div>

              {/* ── Invoices ────────────────────────────────────────────── */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                  Invoices — amounts come from the aging report
                </label>
                {invoices.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic">
                    No open invoices for this customer in the loaded aging report.
                  </p>
                ) : (
                  <div className="border border-gray-200 rounded-sm max-h-52 overflow-y-auto divide-y divide-gray-100">
                    {invoices.map((inv) => (
                      <label key={inv.invoice_number}
                             className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox"
                               checked={selected.has(inv.invoice_number)}
                               onChange={() => toggle(inv.invoice_number)}
                               className="rounded-sm text-[#222222] focus:ring-0 cursor-pointer" />
                        <span className="text-[11px] font-mono text-gray-800 flex-1 truncate">
                          {inv.invoice_number}
                          {originalInvoices.includes(inv.invoice_number) && (
                            <span className="ml-2 text-[8px] font-black uppercase tracking-wider text-gray-400">
                              current
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] font-mono text-gray-600 shrink-0">
                          {fmt(inv.outstanding_amount)} {inv.currency}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Disposition, only when the selection overpays ───────── */}
              {(needsDisposition || to?.requires_disposition) && (
                <div className="space-y-1.5 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <label className="text-[10px] font-black text-amber-800 uppercase tracking-wider">
                    This selection overpays
                    {to?.excess_amount != null ? ` by ${fmt(to.excess_amount)}` : ""} — record why
                  </label>
                  <select value={disposition} onChange={(e) => setDisposition(e.target.value)}
                          className="w-full text-[12px] border border-amber-300 rounded-sm px-2 py-1.5 bg-white cursor-pointer">
                    <option value="">— choose a reason —</option>
                    {Object.entries(OVERPAYMENT_DISPOSITION_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ── The assessment ─────────────────────────────────────── */}
              <div className="rounded-sm border border-gray-200">
                <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                    What reopening will do
                  </span>
                  {previewing && <Loader2 size={11} className="animate-spin text-gray-400" />}
                </div>
                <div className="px-3 py-2.5 space-y-2">
                  {!preview ? (
                    <p className="text-[11px] text-gray-400">Assessing…</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-wrap text-[12px]">
                        <span className="font-semibold text-gray-500">
                          {RULE_LABEL[from?.rule_id || ""] || from?.rule_id || "—"}
                        </span>
                        <ArrowRight size={13} className="text-gray-400 shrink-0" />
                        <span className={`font-bold ${preview.changed ? "text-emerald-700" : "text-gray-700"}`}>
                          {RULE_LABEL[to?.rule_id || ""] || to?.rule_id || "—"}
                        </span>
                        {!preview.changed && (
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-black">
                            no change
                          </span>
                        )}
                      </div>
                      {/* The customer only appears here when it is actually
                          changing. Without it, changing Esko -> Beckman on a row
                          whose rule stays "Exact match" looked like nothing had
                          happened at all. */}
                      {to?.customer_name !== from?.customer_name && (
                        <div className="flex items-center gap-2 flex-wrap text-[11px]">
                          <span className="text-gray-500">{from?.customer_name || "—"}</span>
                          <ArrowRight size={11} className="text-gray-400 shrink-0" />
                          <span className="font-semibold text-emerald-700">{to?.customer_name || "—"}</span>
                        </div>
                      )}
                      {to?.target_total != null && (
                        <p className="text-[11px] text-gray-600 font-mono">
                          Invoices total {fmt(to.target_total)}
                          {/* A NEGATIVE shortfall is an overpayment. Printing
                              "shortfall -405%" is not just ugly, it reads as the
                              opposite of what happened. */}
                          {to.shortfall_pct != null && to.shortfall_pct > 0 && (
                            <> · short by {to.shortfall_pct}%</>
                          )}
                          {to.shortfall_pct != null && to.shortfall_pct < 0 && (
                            <> · overpaid by {Math.abs(to.shortfall_pct)}%</>
                          )}
                          {to.shortfall_pct === 0 && <> · fully covered</>}
                        </p>
                      )}
                      {/* Unticking everything is a legitimate decision ("none of
                          these are right"), not an error — but the consequence
                          has to be spelled out, because the row stops being
                          postable and goes back into a queue. */}
                      {preview.route === "cleared_mapping" && (
                        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-2.5 py-2 leading-snug">
                          No invoices selected. The row will be reopened with
                          <span className="font-semibold"> no invoice mapping</span> and go back
                          into the queue to be mapped. Any invoices it had claimed are released.
                        </p>
                      )}
                      {blockers.length > 0 && (
                        <div className="space-y-1 pt-1">
                          {blockers.map((b, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
                              <p className="text-[11px] text-red-700 leading-snug">{b.message}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {canConfirm && (
                        <p className="text-[10px] text-gray-400 leading-snug pt-0.5">
                          Nothing is sent to Oracle. If this lands in Ready for Oracle it still
                          needs Approve &amp; Post.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* ── Comment ────────────────────────────────────────────── */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                  Note (optional)
                </label>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
                          placeholder="Why is this being reopened?"
                          className="w-full text-[12px] border border-gray-200 rounded-sm px-2 py-1.5 resize-none" />
              </div>

              {saveError && <p className="text-[12px] text-red-600 font-semibold">{saveError}</p>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 shrink-0">
          <button onClick={() => !saving && onCancel()} disabled={saving}
                  className="text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-primary px-3 py-2 cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={!canConfirm}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-[#222222] hover:bg-black px-4 py-2 rounded-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {saving ? "Reopening…" : "Reopen Row"}
          </button>
        </div>
      </div>
    </div>
  );
}
