"use client";
/**
 * components/bank-accounts/EditBusinessUnitsModal.tsx
 * =======================================================
 * Administrator-only: change which Business Unit(s) a bank account
 * belongs to. Most accounts have exactly one (the "Primary Business
 * Unit"); some legitimately receive payments for more than one, hence
 * the separate "Additional Business Units" multi-select.
 *
 * IMPORTANT: this only affects analysis runs started AFTER saving --
 * already-completed runs keep whatever Business Unit was in effect when
 * they ran. Shown explicitly in the modal so this isn't a surprise.
 */
import { AlertTriangle, Info, Loader2, X } from "lucide-react";
import { useState } from "react";
import { AdditionalBusinessUnitsPicker, type BusinessUnitOption } from "./BusinessUnitPicker";
import type { BankAccountRow } from "./BankAccountsTable";

export default function EditBusinessUnitsModal({
  account,
  businessUnits,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  account: BankAccountRow;
  businessUnits: BusinessUnitOption[];
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (data: { primary_ou_number: string; additional_ou_numbers: string[] }) => void;
}) {
  const [primary, setPrimary] = useState(account.primary_business_unit?.ou_number ?? "");
  const [additional, setAdditional] = useState<string[]>(
    account.additional_business_units.map((b) => b.ou_number)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!primary) return;
    onSubmit({ primary_ou_number: primary, additional_ou_numbers: additional.filter((n) => n !== primary) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onCancel()}>
      <div className="bg-white rounded-sm shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">
            Edit Business Unit(s)
          </h3>
          <button onClick={() => !saving && onCancel()} className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="text-[11px] text-gray-500 font-medium">
            <span className="font-bold text-primary">{account.bank_name}</span> &middot; {account.account_number}
          </div>

          <div className="bg-blue-50 border-l-2 border-blue-400 p-3 text-[11px] flex items-start gap-2 rounded-r-sm">
            <Info size={13} className="text-blue-500 shrink-0 mt-0.5" />
            <span className="text-gray-700">
              This only affects analysis runs started <strong>after</strong> you save — already-completed
              runs keep the Business Unit that was in effect when they ran.
            </span>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
              Primary Business Unit *
            </label>
            <select
              required
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-sm text-xs font-semibold text-primary px-3 py-2 outline-none focus:border-[#222222] cursor-pointer"
            >
              <option value="" disabled>Select a Business Unit…</option>
              {businessUnits.map((bu) => (
                <option key={bu.ou_number} value={bu.ou_number}>
                  {bu.ou_name} (OU {bu.ou_number})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
              Additional Business Units <span className="normal-case font-medium text-gray-400">— only if this account also receives payments for other BUs</span>
            </label>
            <AdditionalBusinessUnitsPicker
              options={businessUnits}
              selected={additional}
              excludeOuNumber={primary}
              onChange={setAdditional}
            />
          </div>

          {error && (
            <div className="bg-red-50 border-l-2 border-red-600 p-2.5 text-xs flex items-start gap-2 text-gray-900 rounded-r-sm">
              <AlertTriangle size={13} className="text-red-600 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="text-[11px] font-black uppercase tracking-wider text-gray-500 hover:text-primary px-3 py-2 rounded-sm cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !primary}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider bg-[#222222] hover:bg-black text-white px-4 py-2 rounded-sm cursor-pointer shadow-xs disabled:opacity-50"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
