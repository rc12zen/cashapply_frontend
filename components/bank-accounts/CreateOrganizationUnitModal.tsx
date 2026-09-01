"use client";
/**
 * components/bank-accounts/CreateOrganizationUnitModal.tsx
 * ===========================================================
 * Create a Business Unit directly, with no bank statement involved.
 *
 * WHY THIS EXISTS
 * ----------------
 * A Business Unit used to come into existence only as a side-effect of saving
 * a bank-account config in Config Builder. But the "additional Business Units"
 * picker can only offer OUs that already exist — so the one case additional
 * BUs exist FOR (a single bank account receiving money for two Business Units)
 * was unreachable: the second BU frequently has no statement of its own to
 * onboard, so it could never be created at all.
 *
 * CRITICAL — the name and number together ARE the Oracle identifier.
 * oracle/fusion_client.py's get_ou_display_name() builds Oracle's
 * "BusinessUnit" field as EXACTLY `${ou_name}(${ou_number})`, e.g. "PUNE(111)",
 * and Oracle matches that string character for character. Wrong case, a
 * trailing space, or any other variation 404s every receipt for this OU —
 * there is no fuzzy fallback anywhere in the posting path. Hence the live
 * preview below: the exact string is shown as it is typed, rather than being
 * discovered after the first failed run.
 */
import { AlertTriangle, Building2, Loader2, X } from "lucide-react";
import { useState } from "react";
import { ISO_4217 } from "@/lib/currency";

export default function CreateOrganizationUnitModal({
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (data: { ou_number: string; ou_name: string; functional_currency: string }) => void;
}) {
  const [ouNumber, setOuNumber] = useState("");
  const [ouName, setOuName]     = useState("");
  const [currency, setCurrency] = useState("");

  const trimmedNumber = ouNumber.trim();
  const trimmedName   = ouName.trim();
  const ready = !!trimmedNumber && !!trimmedName && !!currency.trim();

  // Exactly what get_ou_display_name() will build. Shown verbatim in mono —
  // no case transform — because case is load-bearing here.
  const oracleString = trimmedName && trimmedNumber ? `${trimmedName}(${trimmedNumber})` : "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || saving) return;
    onSubmit({
      ou_number: trimmedNumber,
      ou_name: trimmedName,
      functional_currency: currency.trim().toUpperCase(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={() => !saving && onCancel()}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-sm shadow-xl w-full max-w-md">

        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-2">
            <Building2 size={13} className="text-gray-400" />
            Add Business Unit
          </h3>
          <button type="button" onClick={() => !saving && onCancel()} aria-label="Close"
                  className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-gray-600 leading-snug">
            Creates a Business Unit on its own, so it can be assigned to a bank account
            straight away — no statement needed for it first. Use this when one account
            receives money for more than one Business Unit.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="ou-number" className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                OU Number
              </label>
              <input id="ou-number" value={ouNumber} onChange={(e) => setOuNumber(e.target.value)}
                     autoFocus placeholder="273"
                     className="w-full text-[12px] font-mono border border-gray-200 rounded-sm px-2 py-1.5
                                outline-none focus:border-[#222222] transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ou-currency" className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                Functional Currency
              </label>
              {/* A dropdown, not free text -- same control the Config Builder
                  uses when naming a new OU, and driven by the same ISO_4217
                  list. Typing it by hand allowed codes the backend then
                  rejected, and the rejection named the field rather than the
                  reason. Picking from the list makes the allowed set the
                  visible set. */}
              <select id="ou-currency" value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full text-[12px] font-mono border border-gray-200 rounded-sm px-2 py-1.5
                                 bg-white outline-none focus:border-[#222222] transition-colors">
                <option value="">— select —</option>
                {ISO_4217.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ou-name" className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
              Business Unit Name
            </label>
            <input id="ou-name" value={ouName} onChange={(e) => setOuName(e.target.value)}
                   placeholder="Colombia"
                   className="w-full text-[12px] border border-gray-200 rounded-sm px-2 py-1.5
                              outline-none focus:border-[#222222] transition-colors" />
          </div>

          {/* The whole point of the form. Rendered verbatim, mono, no case
              transform — this is the string Oracle exact-matches. */}
          <div className="border border-gray-200 rounded-xs bg-gray-50 px-3 py-2.5 space-y-1">
            <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">
              Oracle &quot;BusinessUnit&quot; string
            </span>
            <p className="font-mono text-[12px] font-bold text-[#222222] break-all">
              {oracleString || <span className="text-gray-300 font-normal">— fill in both fields —</span>}
            </p>
          </div>

          <div className="flex items-start gap-2 border border-amber-200 bg-amber-50 rounded-xs px-3 py-2.5">
            <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-900 leading-snug">
              Oracle matches that string exactly. A difference in capitalisation or spacing
              fails <span className="font-bold">every</span> receipt for this Business Unit,
              with no warning until posting fails. The functional currency drives currency
              conversion and is only changeable here on this page afterwards.
            </p>
          </div>

          {error && <p className="text-[11px] text-red-600 font-bold leading-snug">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
          <button type="button" onClick={onCancel} disabled={saving}
                  className="text-[11px] font-bold text-gray-500 hover:text-primary px-3 py-1.5 cursor-pointer disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={!ready || saving}
                  className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider
                             bg-[#222222] text-white px-3 py-1.5 rounded-sm cursor-pointer
                             disabled:opacity-40 disabled:cursor-not-allowed">
            {saving && <Loader2 size={12} className="animate-spin" />}
            {saving ? "Creating…" : "Create Business Unit"}
          </button>
        </div>

      </form>
    </div>
  );
}
