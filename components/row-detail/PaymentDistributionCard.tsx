"use client";
/**
 * components/row-detail/PaymentDistributionCard.tsx
 * =====================================================
 * "Path B" of Split & Map — for a needs_distribution row that's genuinely
 * a multi-customer consolidated bank line (not "Path A", where the
 * identified name IS the actual paying customer — see the "Treat as
 * Customer Payment" action for that case instead).
 *
 * Design (confirmed choices):
 *   - PATCH: amount is now entered PER INVOICE, not per customer. A
 *     customer with two invoices selected gets two amount boxes, one per
 *     invoice — each is classified (R9a/R9b/R9d/overpayment) independently,
 *     so one invoice can land as an exact match while another under the
 *     same customer lands as a short payment. See hitl/split_and_map.py's
 *     _resolve_entry() for the matching backend shape.
 *   - The breakup must sum to EXACTLY the credited amount before Confirm
 *     is allowed — now summed across every invoice of every customer.
 *   - Every customer needs at least one ACTIVE invoice selected — picked
 *     from a live list fetched the moment a customer is chosen (only
 *     invoices with real remaining balance are offered at all).
 *   - One receipt gets created PER INVOICE on confirm — each then needs
 *     its own Approve & Post afterward, same as any other row.
 */
import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, AlertTriangle, CheckCircle2, Split, Check, Search, X } from "lucide-react";
import SearchableSelect from "@/components/row-detail/SearchableSelect";
import { getDistributionContext, confirmDistribution, getActiveInvoicesForCustomer } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import { fmt } from "@/components/row-detail/types";

interface ActiveInvoice {
  invoice_number: string; outstanding_amount: number; currency: string;
  is_cross_currency: boolean; fx_rate: number | null;
}

interface SelectedInvoice {
  invoice_number: string;
  amount: string;                     // kept as a string while editing; parsed on submit
  outstanding_amount: number;         // shown as a hint next to the amount box, not auto-filled
  currency: string;
  is_cross_currency: boolean;
  fx_rate: number | null;             // credited currency -> this invoice's currency
}

// Mirrors hitl/manual_mapping.py's _classify() bands exactly (same order,
// same rounding, same tolerance) so the rule shown here is the rule Confirm
// will actually get -- see that function if these bands ever move.
function gradeInvoice(amountStr: string, iv: SelectedInvoice, tolerancePct: number) {
  const amount = parseFloat(amountStr) || 0;
  if (amount <= 0) return null;

  if (iv.is_cross_currency && !iv.fx_rate) {
    return { rule: "R13", reasonCode: "FX_RATE_MISSING", blocking: true, tone: "red" as const,
      label: `No FX rate available to convert into ${iv.currency}.` };
  }

  const converted = Math.round(amount * (iv.fx_rate ?? 1) * 100) / 100;
  const shortfall = Math.round((iv.outstanding_amount - converted) * 100) / 100;
  const pct = iv.outstanding_amount === 0 ? 0 : Math.round((shortfall / iv.outstanding_amount) * 10000) / 100;

  const base = { converted, shortfall, pct };

  if (pct < 0) {
    return { ...base, rule: "R11", reasonCode: "OVERPAYMENT_UNEXPLAINED", blocking: true, tone: "red" as const,
      label: `Over by ${fmt(Math.abs(shortfall))} ${iv.currency}.` };
  }
  if (pct === 0) {
    return { ...base, rule: "R9a", reasonCode: "EXACT_MATCH", blocking: false, tone: "emerald" as const,
      label: "Covers the invoice exactly." };
  }
  if (pct <= tolerancePct) {
    return { ...base, rule: "R9b", reasonCode: "ACCEPTABLE_SHORT_PAYMENT", blocking: false, tone: "amber" as const,
      label: `Short by ${fmt(shortfall)} ${iv.currency} (${pct}%) — within tolerance.` };
  }
  return { ...base, rule: "R9d", reasonCode: "SHORT_PAYMENT_RECORDED", blocking: false, tone: "amber" as const,
    label: `Short by ${fmt(shortfall)} ${iv.currency} (${pct}%) — recorded as short payment, balance stays open.` };
}

interface DistributionEntry {
  customer_name: string;
  invoices: SelectedInvoice[];        // the CHECKED invoices for this customer, each with its own amount
  available_invoices: ActiveInvoice[];
  invoicesLoading: boolean;
  invoiceQuery: string;               // local search filter over available_invoices -- view-only, never touches selection
}

const emptyEntry = (): DistributionEntry => ({
  customer_name: "", invoices: [], available_invoices: [], invoicesLoading: false, invoiceQuery: "",
});

export default function PaymentDistributionCard({
  recordId,
  onDistributed,
}: {
  recordId: number;
  onDistributed: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalAmount, setTotalAmount] = useState(0);
  const [currency, setCurrency] = useState("");
  const [allCustomers, setAllCustomers] = useState<string[]>([]);
  const [tolerancePct, setTolerancePct] = useState(12);
  const [entries, setEntries] = useState<DistributionEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    getDistributionContext(recordId)
      .then((res) => {
        const ctx = res.data;
        setTotalAmount(ctx.total_amount);
        setCurrency(ctx.currency);
        setAllCustomers(ctx.all_customers || []);
        setTolerancePct(ctx.short_payment_tolerance_pct ?? 12);
        // Pre-fill one blank row per registered provider roster customer
        // (third-party rows only) -- a nice starting point, not a
        // requirement; card/cheque rows start with zero rows instead.
        const starter: DistributionEntry[] = (ctx.roster || []).map((name: string) => ({
          ...emptyEntry(), customer_name: name,
        }));
        setEntries(starter);
      })
      .catch((e) => setError(getErrorMessage(e, "Could not load distribution context.")))
      .finally(() => setLoading(false));
  }, [recordId]);

  const addRow = () => setEntries((prev) => [...prev, emptyEntry()]);
  const removeRow = (idx: number) => setEntries((prev) => prev.filter((_, i) => i !== idx));
  const updateRow = (idx: number, patch: Partial<DistributionEntry>) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  // Fetch this customer's ACTIVE invoices the moment they're picked --
  // only invoices with real remaining balance are ever offered, so
  // there's nothing to select that would fail validation later anyway.
  const handleCustomerChange = async (idx: number, name: string) => {
    updateRow(idx, { customer_name: name, invoices: [], available_invoices: [], invoicesLoading: !!name, invoiceQuery: "" });
    if (!name) return;
    try {
      const res = await getActiveInvoicesForCustomer(recordId, name);
      updateRow(idx, { available_invoices: res.data.invoices || [], invoicesLoading: false });
    } catch {
      updateRow(idx, { available_invoices: [], invoicesLoading: false });
    }
  };

  // Checking an invoice adds it (with a blank amount) to that customer's
  // list; unchecking removes it and its amount entirely.
  const toggleInvoice = (idx: number, iv: ActiveInvoice) => {
    setEntries((prev) => prev.map((e, i) => {
      if (i !== idx) return e;
      const already = e.invoices.some((sel) => sel.invoice_number === iv.invoice_number);
      return {
        ...e,
        invoices: already
          ? e.invoices.filter((sel) => sel.invoice_number !== iv.invoice_number)
          : [...e.invoices, {
              invoice_number: iv.invoice_number, amount: "",
              outstanding_amount: iv.outstanding_amount, currency: iv.currency,
              is_cross_currency: iv.is_cross_currency, fx_rate: iv.fx_rate,
            }],
      };
    }));
  };

  const updateInvoiceAmount = (idx: number, invoiceNumber: string, amount: string) => {
    setEntries((prev) => prev.map((e, i) => {
      if (i !== idx) return e;
      return {
        ...e,
        invoices: e.invoices.map((sel) => (sel.invoice_number === invoiceNumber ? { ...sel, amount } : sel)),
      };
    }));
  };

  const allSelectedInvoices = entries.flatMap((e) => e.invoices);
  const enteredTotal = allSelectedInvoices.reduce((sum, iv) => sum + (parseFloat(iv.amount) || 0), 0);
  const diff = Math.round((totalAmount - enteredTotal) * 100) / 100;
  const addsUp = Math.abs(diff) < 0.01 && entries.length > 0;
  const everyRowHasInvoice = entries.every((e) => e.invoices.length > 0);
  const everyInvoiceHasAmount = allSelectedInvoices.every((iv) => (parseFloat(iv.amount) || 0) > 0);
  const grades = allSelectedInvoices.map((iv) => gradeInvoice(iv.amount, iv, tolerancePct));
  const noBlockingRules = grades.every((g) => !g?.blocking);
  const canConfirm = addsUp && everyRowHasInvoice && everyInvoiceHasAmount && noBlockingRules;

  // Cover every reason Confirm can be blocked, not just the invoice one --
  // a customer with an invoice checked but no amount typed used to show no
  // warning at all, just an unexplained disabled button.
  const blockedReasons: string[] = [];
  if (!everyRowHasInvoice) blockedReasons.push("every customer needs at least one invoice selected");
  if (everyRowHasInvoice && !everyInvoiceHasAmount) blockedReasons.push("every selected invoice needs an amount entered against it");
  if (everyRowHasInvoice && everyInvoiceHasAmount && !addsUp) blockedReasons.push("the amounts entered must add up to the full credited total");
  if (!noBlockingRules) blockedReasons.push("one or more invoices are overpaid or have no FX rate available — fix those amounts first");

  const handleConfirm = async () => {
    setSaving(true); setError(""); setResult(null);
    try {
      // Re-fetch every entry's active invoice list right before submitting --
      // another row can claim part of the same invoice while this screen sits
      // open (see invoice_ledger.py), and the backend re-validates against the
      // LIVE remaining balance at confirm time regardless of what this screen
      // showed earlier. Without this, a stale "short payment" grade here can
      // still get rejected server-side as an overpayment.
      const refreshed = await Promise.all(entries.map(async (e) => {
        if (!e.customer_name) return e;
        try {
          const res = await getActiveInvoicesForCustomer(recordId, e.customer_name);
          const fresh: ActiveInvoice[] = res.data.invoices || [];
          const freshByNumber = new Map(fresh.map((iv) => [iv.invoice_number, iv]));
          return {
            ...e,
            available_invoices: fresh,
            invoices: e.invoices.map((sel) => {
              const f = freshByNumber.get(sel.invoice_number);
              return f
                ? { ...sel, outstanding_amount: f.outstanding_amount, is_cross_currency: f.is_cross_currency, fx_rate: f.fx_rate }
                : sel;
            }),
          };
        } catch {
          return e;
        }
      }));
      setEntries(refreshed);

      const freshGrades = refreshed.flatMap((e) => e.invoices).map((iv) => gradeInvoice(iv.amount, iv, tolerancePct));
      if (freshGrades.some((g) => g?.blocking)) {
        setError("Invoice balances changed since this screen loaded — check the highlighted row(s) above and adjust the amount before confirming again.");
        setSaving(false);
        return;
      }

      const payload = refreshed.map((e) => ({
        customer_name: e.customer_name,
        invoices: e.invoices.map((iv) => ({
          invoice_number: iv.invoice_number,
          amount: parseFloat(iv.amount) || 0,
        })),
      }));
      const res = await confirmDistribution(recordId, payload);
      setResult(res.data);
      onDistributed();
    } catch (e: any) {
      setError(getErrorMessage(e, "Could not confirm this distribution."));
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-sm p-6 flex items-center justify-center text-gray-400">
        <Loader2 size={16} className="animate-spin mr-2" /> Loading distribution context…
      </div>
    );
  }

  if (result?.success) {
    return (
      <div className="bg-white border border-gray-200 rounded-sm">
        <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2.5 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-600" />
          <h2 className="text-xs font-black text-emerald-800 uppercase tracking-wider">Distribution Confirmed</h2>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-xs text-gray-600">{result.message}</p>
          {result.children?.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-100 rounded-sm px-3 py-2">
              <span className="font-semibold text-primary">{c.customer_name}</span>
              <span className="font-mono text-gray-500">{c.invoice_number}</span>
              <span className="font-mono">{c.amount.toLocaleString()}</span>
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{c.reason_code}</span>
              <span className={c.receipt_created ? "text-emerald-600" : "text-red-500"}>
                {c.receipt_created ? "Receipt created" : "Receipt creation failed"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-sm">
      <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center gap-2">
        <Split size={14} className="text-indigo-600" />
        <h2 className="text-xs font-black text-primary uppercase tracking-wider">Payment Distribution</h2>
        <span className="text-[11px] text-gray-400 ml-auto">
          Total: <span className="font-mono font-bold text-primary">{totalAmount.toLocaleString()} {currency}</span>
        </span>
      </div>

      <div className="p-4 space-y-3">
        {entries.map((entry, idx) => {
          const visibleInvoices = entry.invoiceQuery
            ? entry.available_invoices.filter((iv) => iv.invoice_number.toLowerCase().includes(entry.invoiceQuery.toLowerCase()))
            : entry.available_invoices;
          return (
          <div key={idx} className="border border-gray-100 rounded-sm p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchableSelect
                  value={entry.customer_name}
                  onChange={(name) => handleCustomerChange(idx, name)}
                  options={allCustomers}
                  placeholder="Select customer…"
                  searchPlaceholder="Search aging customers…"
                  emptyMessage="No customer matches your search."
                />
              </div>
              <button onClick={() => removeRow(idx)} className="text-gray-400 hover:text-red-500 cursor-pointer">
                <Trash2 size={14} />
              </button>
            </div>

            {entry.customer_name && (
              <div className="pl-1">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Active invoices for {entry.customer_name} — check one, then enter the amount against it
                  </div>
                  {entry.invoices.length > 0 && (
                    <span className="text-[10px] font-black text-indigo-700 shrink-0">{entry.invoices.length} selected</span>
                  )}
                </div>
                {entry.invoicesLoading ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    <Loader2 size={11} className="animate-spin" /> Loading…
                  </div>
                ) : entry.available_invoices.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic">No open invoices with remaining balance for this customer.</p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={entry.invoiceQuery}
                        onChange={(e) => updateRow(idx, { invoiceQuery: e.target.value })}
                        placeholder="Search invoices…"
                        className="w-full text-[11px] font-medium border border-gray-300 rounded-xs pl-7 pr-7 py-1.5 outline-none focus:border-indigo-400"
                      />
                      {entry.invoiceQuery && (
                        <button type="button" onClick={() => updateRow(idx, { invoiceQuery: "" })}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 cursor-pointer">
                          <X size={11} />
                        </button>
                      )}
                    </div>
                    {visibleInvoices.length === 0 ? (
                      <p className="text-[11px] text-gray-400 italic">No invoice matches your search.</p>
                    ) : visibleInvoices.map((iv) => {
                      const selected = entry.invoices.find((sel) => sel.invoice_number === iv.invoice_number);
                      const checked = !!selected;
                      const grade = checked ? gradeInvoice(selected!.amount, selected!, tolerancePct) : null;
                      return (
                        <div key={iv.invoice_number}
                          className={`px-2 py-1.5 rounded-sm border ${
                            checked ? "bg-indigo-50 border-indigo-300" : "bg-white border-gray-100 hover:border-gray-200"
                          }`}>
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                              <span className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${checked ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                                {checked && <Check size={11} className="text-white" />}
                              </span>
                              <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleInvoice(idx, iv)} />
                              <span className="font-mono font-semibold text-primary truncate">{iv.invoice_number}</span>
                              <span className="font-mono text-gray-400 shrink-0">
                                (outstanding: {iv.outstanding_amount.toLocaleString()} {iv.currency})
                              </span>
                            </label>
                            {checked && (
                              <input
                                type="number" step="0.01"
                                value={selected!.amount}
                                onChange={(e) => updateInvoiceAmount(idx, iv.invoice_number, e.target.value)}
                                placeholder="Amount"
                                className="w-28 shrink-0 text-xs font-mono px-2 py-1 border border-indigo-200 rounded-sm bg-white"
                              />
                            )}
                          </div>
                          {grade && (
                            <div className={`mt-1 pl-6 text-[10px] font-semibold ${
                              grade.tone === "red" ? "text-red-600" : grade.tone === "amber" ? "text-amber-700" : "text-emerald-700"
                            }`}>
                              {iv.is_cross_currency && iv.fx_rate && "converted" in grade && (
                                <span className="font-mono">
                                  ≈ {fmt(grade.converted)} {iv.currency} @ {iv.fx_rate}
                                  {" — "}
                                </span>
                              )}
                              {grade.label}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })}

        <button onClick={addRow} className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 cursor-pointer">
          <Plus size={13} /> Add customer
        </button>

        <div className={`flex items-center justify-between rounded-sm px-3 py-2 text-xs font-bold ${
          addsUp ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-amber-50 text-amber-800 border border-amber-200"
        }`}>
          <span>Entered: {enteredTotal.toLocaleString()} {currency}</span>
          <span>{addsUp ? "Adds up ✓" : `Remaining: ${diff.toLocaleString()} ${currency}`}</span>
        </div>

        {blockedReasons.length > 0 && (
          <ul className="text-[11px] text-amber-700 font-medium list-disc pl-4 space-y-0.5">
            {blockedReasons.map((reason) => <li key={reason}>{reason.charAt(0).toUpperCase() + reason.slice(1)}.</li>)}
          </ul>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
            <AlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-700 font-medium">{error}</p>
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={!canConfirm || saving}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-sm bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 cursor-pointer"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Split size={14} />}
          Confirm Distribution — Creates {allSelectedInvoices.length} Receipt{allSelectedInvoices.length !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}