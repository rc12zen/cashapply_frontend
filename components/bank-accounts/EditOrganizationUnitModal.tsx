"use client";
/**
 * components/bank-accounts/EditOrganizationUnitModal.tsx
 * ==========================================================
 * Edit an OrganizationUnit's own name and functional currency directly.
 * This is new — previously an OU's name could only be set once (at first
 * account onboarding via Config Builder) and functional_currency could
 * never be corrected at all short of a direct database UPDATE.
 *
 * CRITICAL — get the name exactly right: Oracle Fusion's "BusinessUnit"
 * field is built as EXACTLY `${ou_name}(${ou_number})` (e.g. "PUNE(111)")
 * and Oracle matches it as an exact string. "Pune(111)" (wrong case), a
 * trailing space, or any other variation causes every receipt for this OU
 * to 404 — there is no case-insensitive or fuzzy fallback anywhere in the
 * posting path (see oracle/fusion_client.py's get_ou_display_name()).
 */
import { AlertTriangle, Loader2, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import type { OrganizationUnitRow } from "./OrganizationUnitsTable";

export default function EditOrganizationUnitModal({
  organizationUnit,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  organizationUnit: OrganizationUnitRow;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (data: { ou_name: string; functional_currency: string }) => void;
}) {
  const [ouName, setOuName] = useState(organizationUnit.ou_name || "");
  const [currency, setCurrency] = useState(organizationUnit.functional_currency || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ouName.trim() || !currency.trim()) return;
    onSubmit({ ou_name: ouName.trim(), functional_currency: currency.trim().toUpperCase() });
  };

  const previewString = ouName.trim() ? `${ouName.trim()}(${organizationUnit.ou_number})` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onCancel()}>
      <div className="bg-white rounded-sm shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider">
            Edit Organization Unit
          </h3>
          <button onClick={() => !saving && onCancel()} className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="text-[11px] text-gray-500 font-medium">
            OU Number <span className="font-mono font-bold text-primary">{organizationUnit.ou_number}</span>
          </div>

          <div className="bg-amber-50 border-l-2 border-amber-400 p-3 text-[11px] flex items-start gap-2 rounded-r-sm">
            <ShieldAlert size={13} className="text-amber-600 shrink-0 mt-0.5" />
            <span className="text-gray-700">
              Oracle Fusion matches the Business Unit name as an <strong>exact string</strong> —
              e.g. <span className="font-mono">PUNE(111)</span>. Wrong case or spelling here
              (<span className="font-mono">Pune(111)</span>) causes every receipt for this OU to
              be rejected by Oracle with no warning until it's posted.
            </span>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
              Business Unit Name *
            </label>
            <input
              required
              type="text"
              value={ouName}
              onChange={(e) => setOuName(e.target.value)}
              placeholder="e.g. PUNE"
              className="w-full bg-white border border-gray-300 rounded-sm text-xs font-semibold text-primary px-3 py-2 outline-none focus:border-[#222222]"
            />
            {previewString && (
              <p className="text-[10px] text-gray-400">
                Oracle will receive:{" "}
                <span className="font-mono font-bold text-gray-600">{previewString}</span>
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
              Functional Currency *
            </label>
            <input
              required
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="e.g. INR"
              maxLength={10}
              className="w-full bg-white border border-gray-300 rounded-sm text-xs font-semibold text-primary px-3 py-2 outline-none focus:border-[#222222] font-mono uppercase"
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
              disabled={saving || !ouName.trim() || !currency.trim()}
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