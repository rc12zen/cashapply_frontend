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
 *   - Each customer's share is a FIXED AMOUNT, not a percentage.
 *   - The breakup must sum to EXACTLY the credited amount before Confirm
 *     is allowed.
 *   - Every customer needs at least one ACTIVE invoice selected — picked
 *     from a live list fetched the moment a customer is chosen (only
 *     invoices with real remaining balance are offered at all).
 *   - Each customer's amount gets tagged (R9a/R9b/R9d) the SAME way the
 *     rest of the app tags "amount vs. invoice" everywhere else — see
 *     hitl/split_and_map.py's _resolve_entry().
 *   - One receipt gets created PER CUSTOMER on confirm — each then needs
 *     its own Approve & Post afterward, same as any other row.
 */
import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, AlertTriangle, CheckCircle2, Split, Check } from "lucide-react";
import SearchableSelect from "@/components/row-detail/SearchableSelect";
import { getDistributionContext, confirmDistribution, getActiveInvoicesForCustomer } from "@/lib/api";

interface ActiveInvoice { invoice_number: string; outstanding_amount: number; currency: string }

interface DistributionEntry {
  customer_name: string;
  amount: string;                     // kept as a string while editing; parsed on submit
  invoice_numbers: string[];
  available_invoices: ActiveInvoice[];
  invoicesLoading: boolean;
}

const emptyEntry = (): DistributionEntry => ({
  customer_name: "", amount: "", invoice_numbers: [], available_invoices: [], invoicesLoading: false,
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
        // Pre-fill one blank-amount row per registered provider roster
        // customer (third-party rows only) -- a nice starting point, not
        // a requirement; card/cheque rows start with zero rows instead.
        const starter: DistributionEntry[] = (ctx.roster || []).map((name: string) => ({
          ...emptyEntry(), customer_name: name,
        }));
        setEntries(starter);
      })
      .catch((e) => setError(e?.response?.data?.detail || "Could not load distribution context."))
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
    updateRow(idx, { customer_name: name, invoice_numbers: [], available_invoices: [], invoicesLoading: !!name });
    if (!name) return;
    try {
      const res = await getActiveInvoicesForCustomer(recordId, name);
      updateRow(idx, { available_invoices: res.data.invoices || [], invoicesLoading: false });
    } catch {
      updateRow(idx, { available_invoices: [], invoicesLoading: false });
    }
  };

  const toggleInvoice = (idx: number, invoiceNumber: string) => {
    setEntries((prev) => prev.map((e, i) => {
      if (i !== idx) return e;
      const already = e.invoice_numbers.includes(invoiceNumber);
      return { ...e, invoice_numbers: already ? e.invoice_numbers.filter((n) => n !== invoiceNumber) : [...e.invoice_numbers, invoiceNumber] };
    }));
  };

  const enteredTotal = entries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const diff = Math.round((totalAmount - enteredTotal) * 100) / 100;
  const addsUp = Math.abs(diff) < 0.01 && entries.length > 0;
  const everyRowHasInvoice = entries.every((e) => e.invoice_numbers.length > 0);

  const handleConfirm = async () => {
    setSaving(true); setError(""); setResult(null);
    try {
      const payload = entries.map((e) => ({
        customer_name: e.customer_name,
        amount: parseFloat(e.amount) || 0,
        invoice_numbers: e.invoice_numbers,
      }));
      const res = await confirmDistribution(recordId, payload);
      setResult(res.data);
      onDistributed();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not confirm this distribution.");
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
        {entries.map((entry, idx) => (
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
              <input
                type="number" step="0.01"
                value={entry.amount}
                onChange={(e) => updateRow(idx, { amount: e.target.value })}
                placeholder="Amount"
                className="w-32 text-xs font-mono px-2 py-1.5 border border-gray-200 rounded-sm"
              />
              <button onClick={() => removeRow(idx)} className="text-gray-400 hover:text-red-500 cursor-pointer">
                <Trash2 size={14} />
              </button>
            </div>

            {entry.customer_name && (
              <div className="pl-1">
                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                  Active invoices for {entry.customer_name}
                </div>
                {entry.invoicesLoading ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    <Loader2 size={11} className="animate-spin" /> Loading…
                  </div>
                ) : entry.available_invoices.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic">No open invoices with remaining balance for this customer.</p>
                ) : (
                  <div className="space-y-1">
                    {entry.available_invoices.map((iv) => {
                      const checked = entry.invoice_numbers.includes(iv.invoice_number);
                      return (
                        <label key={iv.invoice_number}
                          className={`flex items-center justify-between gap-2 text-[11px] px-2 py-1.5 rounded-sm border cursor-pointer ${
                            checked ? "bg-indigo-50 border-indigo-300" : "bg-white border-gray-100 hover:border-gray-200"
                          }`}>
                          <span className="flex items-center gap-2">
                            <span className={`w-4 h-4 rounded-sm border flex items-center justify-center ${checked ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                              {checked && <Check size={11} className="text-white" />}
                            </span>
                            <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleInvoice(idx, iv.invoice_number)} />
                            <span className="font-mono font-semibold text-primary">{iv.invoice_number}</span>
                          </span>
                          <span className="font-mono text-gray-500">{iv.outstanding_amount.toLocaleString()} {iv.currency}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <button onClick={addRow} className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 cursor-pointer">
          <Plus size={13} /> Add customer
        </button>

        <div className={`flex items-center justify-between rounded-sm px-3 py-2 text-xs font-bold ${
          addsUp ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-amber-50 text-amber-800 border border-amber-200"
        }`}>
          <span>Entered: {enteredTotal.toLocaleString()} {currency}</span>
          <span>{addsUp ? "Adds up ✓" : `Remaining: ${diff.toLocaleString()} ${currency}`}</span>
        </div>

        {!everyRowHasInvoice && entries.length > 0 && (
          <p className="text-[11px] text-amber-700 font-medium">Every customer needs at least one invoice selected before this can be confirmed.</p>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
            <AlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-700 font-medium">{error}</p>
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={!addsUp || !everyRowHasInvoice || saving}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-sm bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 cursor-pointer"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Split size={14} />}
          Confirm Distribution — Creates {entries.length} Receipt{entries.length !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}