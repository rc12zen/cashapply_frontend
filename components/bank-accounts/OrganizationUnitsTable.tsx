"use client";
/**
 * components/bank-accounts/OrganizationUnitsTable.tsx
 * =======================================================
 * Full roster of every Organization Unit — name + functional currency —
 * regardless of whether a bank account is attached to it yet. Deliberately
 * separate from BankAccountsTable: that one can only ever show an OU
 * reached THROUGH an account, so an OU seen in the aging report but not
 * yet onboarded (see bff/config_builder_routes.py's available_ous()) would
 * never appear there at all.
 *
 * Editing here hits PUT /api/bank-accounts/business-units/{ou_number} —
 * get the name exactly right: Oracle Fusion matches the "BusinessUnit"
 * string it receives as an EXACT match (e.g. "PUNE(111)") — any case or
 * spelling difference 404s every receipt for that OU with no fuzzy
 * fallback (see oracle/fusion_client.py's get_ou_display_name()).
 */
import { Building2, Pencil } from "lucide-react";

export interface OrganizationUnitRow {
  ou_number: string;
  ou_name: string;
  functional_currency: string;
  active: boolean;
}

export default function OrganizationUnitsTable({
  organizationUnits,
  canEdit,
  onEdit,
}: {
  organizationUnits: OrganizationUnitRow[];
  canEdit: boolean;
  onEdit: (ou: OrganizationUnitRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
            <th className="text-left px-4 py-2">OU Number</th>
            <th className="text-left px-3 py-2">Business Unit Name</th>
            <th className="text-left px-3 py-2">Functional Currency</th>
            <th className="text-left px-3 py-2">Oracle "BusinessUnit" String</th>
            <th className="text-left px-3 py-2">Status</th>
            {canEdit && <th className="text-right px-4 py-2">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {organizationUnits.map((ou) => (
            <tr key={ou.ou_number} className="hover:bg-gray-50/50">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Building2 size={13} className="text-gray-300 shrink-0" />
                  <span className="font-mono font-bold text-primary">{ou.ou_number}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 font-bold text-primary">{ou.ou_name || <span className="text-gray-300 font-normal">—</span>}</td>
              <td className="px-3 py-2.5 font-mono text-gray-600">{ou.functional_currency || <span className="text-gray-300">—</span>}</td>
              <td className="px-3 py-2.5">
                {ou.ou_name ? (
                  <span className="font-mono text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded-xs">
                    {ou.ou_name}({ou.ou_number})
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              <td className="px-3 py-2.5">
                <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-xs ${
                  ou.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"
                }`}>
                  {ou.active ? "active" : "inactive"}
                </span>
              </td>
              {canEdit && (
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => onEdit(ou)}
                    className="flex items-center gap-1 ml-auto text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-primary px-2 py-1 rounded-sm cursor-pointer"
                  >
                    <Pencil size={11} /> Edit
                  </button>
                </td>
              )}
            </tr>
          ))}
          {organizationUnits.length === 0 && (
            <tr>
              <td colSpan={canEdit ? 6 : 5} className="px-4 py-6 text-center text-gray-400">
                No Organization Units found yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}