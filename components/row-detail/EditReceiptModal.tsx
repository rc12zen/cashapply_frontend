"use client";
/**
 * components/row-detail/EditReceiptModal.tsx
 * =============================================
 * Unified edit for the fields a SPOC can correct on an Oracle receipt
 * that either failed to create or was created but not yet invoice-mapped —
 * account number, OU number, receipt method, GL/currency rate (cross-ledger
 * rows only), and both dates. See hitl/service.py's edit_receipt_fields()
 * for the full guard (before invoice mapping only) and the exact two-case
 * branch this drives:
 *   - Receipt already created  -> PATCHes the changed fields directly.
 *   - Receipt creation failed  -> corrects the fields, then retries with a
 *     fresh POST (the wrong value(s) may well be why creation failed).
 *
 * Replaces the old GL-rate-only EditGlRateModal for this row-level action —
 * still used as-is for the per-entry distribution edit (DistributedSummaryCard),
 * which edits one field only.
 *
 * Every field is optional and independently editable — only fields the
 * SPOC actually changes are sent (see the `changed` construction in
 * handleSubmit). Account number / OU number / receipt method are checked
 * live against receipt_method_map.json via checkReceiptFieldsCombo() as
 * the SPOC types, but this is advisory only ("warn but allow" — see
 * backend docstring) and never blocks Save.
 */
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { checkReceiptFieldsCombo, type EditReceiptFieldsInput } from "@/lib/api";

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  // Accept either a bare "YYYY-MM-DD" or a full ISO timestamp.
  return iso.slice(0, 10);
}

export default function EditReceiptModal({
  recordId,
  currentAccountNumber,
  currentOuNumber,
  currentReceiptMethod,
  currentRate,
  isCrossLedger,
  currentReceiptDate,
  currentAccountingDate,
  standardReceiptId,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  recordId: number;
  currentAccountNumber: string | null;
  currentOuNumber: string | null;
  currentReceiptMethod: string | null;
  currentRate: number | null;
  isCrossLedger: boolean;
  currentReceiptDate: string | null;
  currentAccountingDate: string | null;
  standardReceiptId: string | null;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (data: EditReceiptFieldsInput) => void;
}) {
  const [accountNumber, setAccountNumber] = useState(currentAccountNumber ?? "");
  const [ouNumber, setOuNumber]           = useState(currentOuNumber ?? "");
  const [receiptMethod, setReceiptMethod] = useState(currentReceiptMethod ?? "");
  const [rate, setRate]                   = useState(currentRate != null ? String(currentRate) : "");
  const [receiptDate, setReceiptDate]     = useState(toDateInputValue(currentReceiptDate));
  const [accountingDate, setAccountingDate] = useState(toDateInputValue(currentAccountingDate));
  const [reason, setReason]               = useState("");

  const [combo, setCombo] = useState<{ valid: boolean; reason: string | null } | null>(null);
  const [comboChecking, setComboChecking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live, advisory-only check against receipt_method_map.json — debounced
  // so it doesn't fire on every keystroke. Never blocks Save either way.
  useEffect(() => {
    if (!accountNumber.trim()) { setCombo(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setComboChecking(true);
      try {
        const res = await checkReceiptFieldsCombo(
          recordId, accountNumber.trim(), ouNumber.trim() || undefined, receiptMethod.trim() || undefined,
        );
        setCombo({ valid: res.data.valid, reason: res.data.reason });
      } catch {
        setCombo(null);
      }
      setComboChecking(false);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountNumber, ouNumber, receiptMethod, recordId]);

  const parsedRate = parseFloat(rate);
  const rateValid = rate.trim() === "" || (!isNaN(parsedRate) && parsedRate > 0);

  const isValid = rateValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const changed: EditReceiptFieldsInput = {};
    if (accountNumber.trim() && accountNumber.trim() !== (currentAccountNumber ?? ""))
      changed.account_number = accountNumber.trim();
    if (ouNumber.trim() && ouNumber.trim() !== (currentOuNumber ?? ""))
      changed.ou_number = ouNumber.trim();
    if (receiptMethod.trim() && receiptMethod.trim() !== (currentReceiptMethod ?? ""))
      changed.receipt_method_name = receiptMethod.trim();
    if (isCrossLedger && rate.trim() !== "" && parsedRate !== currentRate)
      changed.new_rate = parsedRate;
    if (receiptDate && receiptDate !== toDateInputValue(currentReceiptDate))
      changed.receipt_date = receiptDate;
    if (accountingDate && accountingDate !== toDateInputValue(currentAccountingDate))
      changed.accounting_date = accountingDate;

    if (Object.keys(changed).length === 0) return;
    changed.reason = reason.trim() || undefined;
    onSubmit(changed);
  };

  const hasAnyChange =
    (accountNumber.trim() && accountNumber.trim() !== (currentAccountNumber ?? "")) ||
    (ouNumber.trim() && ouNumber.trim() !== (currentOuNumber ?? "")) ||
    (receiptMethod.trim() && receiptMethod.trim() !== (currentReceiptMethod ?? "")) ||
    (isCrossLedger && rate.trim() !== "" && parsedRate !== currentRate) ||
    (receiptDate && receiptDate !== toDateInputValue(currentReceiptDate)) ||
    (accountingDate && accountingDate !== toDateInputValue(currentAccountingDate));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onCancel()}>
      <div className="bg-white rounded-sm shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">Edit Receipt</h3>
          <button onClick={() => !saving && onCancel()} className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="text-[11px] text-gray-500 font-medium">
            {standardReceiptId ? (
              <>Oracle receipt <span className="font-mono font-bold text-primary">{standardReceiptId}</span></>
            ) : (
              <>No Oracle receipt exists yet for this row — receipt creation previously failed.</>
            )}
          </div>

          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
            <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
              {standardReceiptId ? (
                <>Changed fields are PATCHed directly onto the receipt already created in Oracle. Only
                allowed before invoice mapping exists on it — once mapped, this needs a reverse-and-recreate
                correction instead.</>
              ) : (
                <>Changed fields are saved and receipt creation is RETRIED from scratch (a fresh POST to
                Oracle) — a wrong value here may well be why creation failed in the first place.</>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                Account Number
              </label>
              <input
                type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
                className="w-full text-sm font-mono px-3 py-2 border border-gray-200 rounded-sm"
                placeholder="RemittanceBankAccountNumber"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                OU Number
              </label>
              <input
                type="text" value={ouNumber} onChange={(e) => setOuNumber(e.target.value)}
                className="w-full text-sm font-mono px-3 py-2 border border-gray-200 rounded-sm"
                placeholder="e.g. 111"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
              Receipt Method
            </label>
            <input
              type="text" value={receiptMethod} onChange={(e) => setReceiptMethod(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-sm"
              placeholder="e.g. Direct Deposit in bank"
            />
          </div>

          {(accountNumber.trim() || ouNumber.trim() || receiptMethod.trim()) && (
            <div className={`text-[11px] font-medium rounded-sm px-3 py-2 border ${
              comboChecking ? "bg-gray-50 border-gray-200 text-gray-400"
              : combo?.valid === false ? "bg-amber-50 border-amber-200 text-amber-800"
              : combo?.valid === true ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-gray-50 border-gray-200 text-gray-400"
            }`}>
              {comboChecking ? "Checking against receipt_method_map.json…"
                : combo?.valid === false ? `⚠ ${combo.reason} — you can still save; this will be recorded as a warning.`
                : combo?.valid === true ? "✓ Matches a known account / OU / receipt method combination."
                : "Enter an account number to check it against the receipt method extract."}
            </div>
          )}

          {isCrossLedger && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                Currency Rate (GL / ConversionRate)
              </label>
              <input
                type="number" step="0.0001"
                value={rate} onChange={(e) => setRate(e.target.value)}
                className="w-full text-sm font-mono px-3 py-2 border border-gray-200 rounded-sm"
                placeholder="e.g. 83.98"
              />
              {!rateValid && <p className="text-[10px] text-red-600 font-semibold mt-1">Must be a positive number.</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                Receipt Date
              </label>
              <input
                type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full text-sm font-mono px-3 py-2 border border-gray-200 rounded-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                Accounting Date
              </label>
              <input
                type="date" value={accountingDate} onChange={(e) => setAccountingDate(e.target.value)}
                className="w-full text-sm font-mono px-3 py-2 border border-gray-200 rounded-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
              Reason (optional, kept in the audit trail)
            </label>
            <textarea
              value={reason} onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full text-xs px-3 py-2 border border-gray-200 rounded-sm"
              placeholder="e.g. Wrong OU picked up during extraction — corrected to match the remittance advice"
            />
          </div>

          {error && (
            <div className="text-[11px] text-red-600 font-semibold bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} disabled={saving}
              className="text-[11px] font-black uppercase tracking-wider text-gray-500 hover:text-primary px-3 py-2 cursor-pointer disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={!isValid || !hasAnyChange || saving}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-3 py-2 rounded-sm bg-[#222222] hover:bg-black text-white disabled:opacity-50 cursor-pointer">
              {saving ? <Loader2 size={13} className="animate-spin" /> : null}
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}