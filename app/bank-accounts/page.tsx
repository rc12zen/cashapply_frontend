"use client";
/**
 * app/bank-accounts/page.tsx
 * =============================
 * Nav-bar info page: which Bank Accounts exist and which Business Unit(s)
 * they belong to. Viewable by every role with view access (same tier as
 * Config/Overview); editing a Business Unit assignment is Administrator-
 * only (config:manage) -- see bff/bank_accounts_routes.py.
 *
 * IMPORTANT: changing a Business Unit here only affects analysis runs
 * started AFTER the change -- already-completed runs are never touched
 * (see EditBusinessUnitsModal's inline note, and the backend's module
 * docstring for exactly why that's true).
 */
import { Landmark, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getBankAccounts, getBusinessUnitOptions, updateBankAccountBusinessUnits } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import { usePageGuard } from "@/lib/usePageGuard";
import { useCurrentUser } from "@/lib/useCurrentUser";
import PageAccessDenied from "@/components/PageAccessDenied";
import BankAccountsTable, { type BankAccountRow } from "@/components/bank-accounts/BankAccountsTable";
import EditBusinessUnitsModal from "@/components/bank-accounts/EditBusinessUnitsModal";
import type { BusinessUnitOption } from "@/components/bank-accounts/BusinessUnitPicker";

export default function BankAccountsPage() {
  const { allowed, checking } = usePageGuard("canViewData");
  const { flags } = useCurrentUser();

  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingAccount, setEditingAccount] = useState<BankAccountRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [accountsRes, buRes] = await Promise.all([getBankAccounts(), getBusinessUnitOptions()]);
      setAccounts(accountsRes.data.accounts ?? []);
      setBusinessUnits(buRes.data.business_units ?? []);
    } catch (e: any) {
      setError(getErrorMessage(e, "Could not load bank accounts."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) fetchAll();
  }, [allowed, fetchAll]);

  const handleSaveBusinessUnits = async (data: { primary_ou_number: string; additional_ou_numbers: string[] }) => {
    if (!editingAccount) return;
    setSaving(true);
    setModalError("");
    try {
      await updateBankAccountBusinessUnits(editingAccount.id, data);
      setSuccess(`Updated Business Unit(s) for ${editingAccount.bank_name} — this applies to new analysis runs only.`);
      setTimeout(() => setSuccess(""), 5000);
      setEditingAccount(null);
      fetchAll();
    } catch (e: any) {
      setModalError(getErrorMessage(e, "Could not update Business Unit(s)."));
    } finally {
      setSaving(false);
    }
  };

  if (checking) return null;
  if (!allowed) return <PageAccessDenied />;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="pb-2 border-b border-gray-200 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-black text-primary uppercase tracking-wider flex items-center gap-2">
            <Landmark size={18} /> Bank Accounts
          </h1>
          <p className="text-xs text-gray-500 mt-0.5 font-medium">
            Every onboarded bank account and the Business Unit(s) it belongs to.
            {flags.isAdmin && " Administrators can reassign a Business Unit — changes apply to new analysis runs only."}
          </p>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-sm text-xs font-bold">
          ✓ {success}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-black text-primary uppercase tracking-wider">Accounts</h2>
            {accounts.length > 0 && (
              <span className="text-[10px] font-bold text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-xs">
                {accounts.length}
              </span>
            )}
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="text-gray-400 hover:text-primary cursor-pointer p-1 disabled:opacity-40"
            title="Reload"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs font-bold text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 size={16} className="animate-spin mr-2" /> Loading…
          </div>
        ) : accounts.length === 0 ? (
          <div className="px-4 py-6 text-xs text-gray-400 text-center">
            No bank accounts onboarded yet — upload a statement and configure it via Config Builder.
          </div>
        ) : (
          <BankAccountsTable
            accounts={accounts}
            canEdit={flags.canManageConfig}
            onEdit={(a) => { setEditingAccount(a); setModalError(""); }}
          />
        )}
      </div>

      {editingAccount && (
        <EditBusinessUnitsModal
          account={editingAccount}
          businessUnits={businessUnits}
          saving={saving}
          error={modalError}
          onCancel={() => setEditingAccount(null)}
          onSubmit={handleSaveBusinessUnits}
        />
      )}
    </div>
  );
}
