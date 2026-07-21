"use client";
/**
 * components/bank-accounts/BankAccountsTable.tsx
 * ==================================================
 * The list of onboarded bank accounts + the Business Unit(s) each belongs
 * to. Extracted from app/bank-accounts/page.tsx to keep that file focused
 * on data-fetching/orchestration.
 */
import { Landmark, Pencil } from "lucide-react";

export interface BusinessUnitInfo {
  ou_number: string;
  ou_name: string;
  functional_currency: string;
}

export interface BankAccountRow {
  id: number;
  bank_name: string;
  account_number: string;
  account_last4: string | null;
  display_name: string | null;
  currency: string | null;
  active: boolean;
  primary_business_unit: BusinessUnitInfo | null;
  additional_business_units: BusinessUnitInfo[];
  is_multi_bu: boolean;
}

export default function BankAccountsTable({
  accounts,
  canEdit,
  onEdit,
}: {
  accounts: BankAccountRow[];
  canEdit: boolean;
  onEdit: (account: BankAccountRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
            <th className="text-left px-4 py-2">Bank Account</th>
            <th className="text-left px-3 py-2">Primary Business Unit</th>
            <th className="text-left px-3 py-2">Additional Business Units</th>
            <th className="text-left px-3 py-2">Currency</th>
            <th className="text-left px-3 py-2">Status</th>
            {canEdit && <th className="text-right px-4 py-2">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {accounts.map((a) => (
            <tr key={a.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Landmark size={13} className="text-gray-300 shrink-0" />
                  <div>
                    <div className="font-bold text-primary">{a.display_name || a.bank_name}</div>
                    <div className="font-mono text-[10px] text-gray-400">
                      {a.bank_name} &middot; {a.account_last4 ? `••••${a.account_last4}` : a.account_number}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5">
                {a.primary_business_unit ? (
                  <span className="text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-700 px-2 py-1 rounded-xs">
                    {a.primary_business_unit.ou_name} <span className="text-gray-400 font-mono normal-case">(OU {a.primary_business_unit.ou_number})</span>
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              <td className="px-3 py-2.5">
                {a.additional_business_units.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {a.additional_business_units.map((bu) => (
                      <span key={bu.ou_number} className="text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-xs">
                        {bu.ou_name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              <td className="px-3 py-2.5 font-mono text-gray-600">{a.currency || "—"}</td>
              <td className="px-3 py-2.5">
                <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-xs ${
                  a.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"
                }`}>
                  {a.active ? "active" : "inactive"}
                </span>
              </td>
              {canEdit && (
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => onEdit(a)}
                    className="flex items-center gap-1 ml-auto text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-primary px-2 py-1 rounded-sm cursor-pointer"
                  >
                    <Pencil size={11} /> Edit
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
