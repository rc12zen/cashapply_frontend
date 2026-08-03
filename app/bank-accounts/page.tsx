"use client";
/**
 * app/bank-accounts/page.tsx  (renamed: "Accounts & OU's")
 * ============================================================
 * Nav-bar info page: which Bank Accounts exist, which Business Unit(s)
 * they belong to, AND the full roster of every Organization Unit (name +
 * functional currency). Viewable by every role with view access (same
 * tier as Config/Overview); editing is gated on the `ou:manage`
 * permission (Administrator, Analyst, Oracle Operator — see
 * bff/bank_accounts_routes.py and scripts/seed_rbac.py).
 *
 * PATCH: this page used to only show Business Units reachable THROUGH a
 * bank account — an OU with no account attached yet (e.g. seen in the
 * aging report but not yet onboarded) never appeared anywhere on this
 * page. The new "Organization Units" table below lists every OU directly,
 * and both edits (account -> BU mapping, and an OU's own name/currency)
 * are permission-gated the same way now.
 *
 * IMPORTANT: changing a Business Unit mapping, or an OU's own name/
 * currency, here only affects analysis runs started AFTER the change --
 * already-completed runs are never touched (see EditBusinessUnitsModal's
 * inline note, and the backend's module docstring for exactly why
 * that's true). An OU name/currency fix IS picked up immediately by the
 * next Oracle retry, though -- rule_engine/fx_service.py reads
 * organization_units live, with no caching.
 */
import { Landmark, Loader2, RefreshCw, Building2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getBankAccounts, getBusinessUnitOptions,
  updateBankAccountBusinessUnits, updateOrganizationUnit,
  getSettlementIdentifiers, createNarrativeIdentifier, createProviderIdentifier,
  deleteSettlementIdentifier,
} from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";
import { usePageGuard } from "@/lib/usePageGuard";
import { useCurrentUser } from "@/lib/useCurrentUser";
import PageAccessDenied from "@/components/PageAccessDenied";
import BankAccountsTable, { type BankAccountRow } from "@/components/bank-accounts/BankAccountsTable";
import EditBusinessUnitsModal from "@/components/bank-accounts/EditBusinessUnitsModal";
import OrganizationUnitsTable, { type OrganizationUnitRow } from "@/components/bank-accounts/OrganizationUnitsTable";
import EditOrganizationUnitModal from "@/components/bank-accounts/EditOrganizationUnitModal";
import SettlementIdentifiersCard, {
  type SettlementIdentifiersGrouped,
} from "@/components/bank-accounts/SettlementIdentifiersCard";
import type { BusinessUnitOption } from "@/components/bank-accounts/BusinessUnitPicker";

export default function AccountsAndOUsPage() {
  const { allowed, checking } = usePageGuard("run:view");
  const { flags } = useCurrentUser();

  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([]);
  const [settlementIdentifiers, setSettlementIdentifiers] = useState<SettlementIdentifiersGrouped>({
    card_narrative: [], cheque_narrative: [], third_party_provider: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingAccount, setEditingAccount] = useState<BankAccountRow | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountModalError, setAccountModalError] = useState("");

  const [editingOU, setEditingOU] = useState<OrganizationUnitRow | null>(null);
  const [savingOU, setSavingOU] = useState(false);
  const [ouModalError, setOuModalError] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [accountsRes, buRes, identifiersRes] = await Promise.all([
        getBankAccounts(), getBusinessUnitOptions(), getSettlementIdentifiers(),
      ]);
      setAccounts(accountsRes.data.accounts ?? []);
      setBusinessUnits(buRes.data.business_units ?? []);
      setSettlementIdentifiers(
        identifiersRes.data.identifiers ?? { card_narrative: [], cheque_narrative: [], third_party_provider: [] }
      );
    } catch (e: any) {
      setError(getErrorMessage(e, "Could not load accounts & OUs."));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAddNarrativeIdentifier = async (
    type: "card_narrative" | "cheque_narrative", pattern: string,
  ) => {
    try {
      await createNarrativeIdentifier({ identifier_type: type, pattern });
      await fetchAll();
    } catch (e: any) {
      setError(getErrorMessage(e, "Could not add that identifier."));
    }
  };

  const handleAddProviderIdentifier = async (providerName: string, subCustomers: string[]) => {
    try {
      await createProviderIdentifier({ provider_name: providerName, sub_customers: subCustomers });
      await fetchAll();
    } catch (e: any) {
      setError(getErrorMessage(e, "Could not add that provider."));
    }
  };

  const handleDeleteIdentifier = async (id: number) => {
    try {
      await deleteSettlementIdentifier(id);
      await fetchAll();
    } catch (e: any) {
      setError(getErrorMessage(e, "Could not delete that identifier."));
    }
  };

  useEffect(() => {
    if (allowed) fetchAll();
  }, [allowed, fetchAll]);

  const handleSaveBusinessUnits = async (data: { primary_ou_number: string; additional_ou_numbers: string[] }) => {
    if (!editingAccount) return;
    setSavingAccount(true);
    setAccountModalError("");
    try {
      await updateBankAccountBusinessUnits(editingAccount.id, data);
      setSuccess(`Updated Business Unit(s) for ${editingAccount.bank_name} — this applies to new analysis runs only.`);
      setTimeout(() => setSuccess(""), 5000);
      setEditingAccount(null);
      fetchAll();
    } catch (e: any) {
      setAccountModalError(getErrorMessage(e, "Could not update Business Unit(s)."));
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSaveOU = async (data: { ou_name: string; functional_currency: string }) => {
    if (!editingOU) return;
    setSavingOU(true);
    setOuModalError("");
    try {
      await updateOrganizationUnit(editingOU.ou_number, data);
      setSuccess(
        `Updated OU ${editingOU.ou_number} — Oracle will now receive "${data.ou_name}(${editingOU.ou_number})". ` +
        `Picked up by the next analysis run / Oracle retry automatically.`
      );
      setTimeout(() => setSuccess(""), 6000);
      setEditingOU(null);
      fetchAll();
    } catch (e: any) {
      setOuModalError(getErrorMessage(e, "Could not update this Organization Unit."));
    } finally {
      setSavingOU(false);
    }
  };

  if (checking) return null;
  if (!allowed) return <PageAccessDenied />;

  // businessUnits (from /business-units) already carries `active` as
  // always-true (the backend query filters active=True) -- reuse the same
  // list for the OU roster table so we don't need a second fetch.
  const organizationUnits: OrganizationUnitRow[] = businessUnits.map((bu) => ({
    ou_number: bu.ou_number,
    ou_name: bu.ou_name,
    functional_currency: bu.functional_currency,
    active: true,
  }));

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="pb-2 border-b border-gray-200 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-black text-primary uppercase tracking-wider flex items-center gap-2">
            <Landmark size={18} /> Accounts &amp; OU's
          </h1>
          <p className="text-xs text-gray-500 mt-0.5 font-medium">
            Every onboarded bank account, the Business Unit(s) it belongs to, and the full
            Organization Unit roster.
            {flags.canManageOU && " You can reassign a Business Unit or fix an OU's name/currency — changes apply to new analysis runs only."}
          </p>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-sm text-xs font-bold">
          ✓ {success}
        </div>
      )}

      {/* ── Bank Accounts ─────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-black text-primary uppercase tracking-wider">Bank Accounts</h2>
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
            canEdit={flags.canManageOU}
            onEdit={(a) => { setEditingAccount(a); setAccountModalError(""); }}
          />
        )}
      </div>

      {/* ── Organization Units ────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-sm shadow-xs overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center gap-2">
          <Building2 size={13} className="text-gray-400" />
          <h2 className="text-xs font-black text-primary uppercase tracking-wider">Organization Units</h2>
          {organizationUnits.length > 0 && (
            <span className="text-[10px] font-bold text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-xs">
              {organizationUnits.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 size={16} className="animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <OrganizationUnitsTable
            organizationUnits={organizationUnits}
            canEdit={flags.canManageOU}
            onEdit={(ou) => { setEditingOU(ou); setOuModalError(""); }}
          />
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-sm">
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5">
          <h2 className="text-xs font-black text-primary uppercase tracking-wider">Settlement Identifiers</h2>
          <p className="text-[11px] text-gray-500 mt-0.5 font-medium">
            Credit card / cheque narration patterns and registered third-party providers — how incoming bank rows get tagged for the Split &amp; Map flow.
          </p>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 size={16} className="animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <SettlementIdentifiersCard
              identifiers={settlementIdentifiers}
              canEdit={flags.canManageOU}
              onAddNarrative={handleAddNarrativeIdentifier}
              onAddProvider={handleAddProviderIdentifier}
              onDelete={handleDeleteIdentifier}
            />
          )}
        </div>
      </div>

      {editingAccount && (
        <EditBusinessUnitsModal
          account={editingAccount}
          businessUnits={businessUnits}
          saving={savingAccount}
          error={accountModalError}
          onCancel={() => setEditingAccount(null)}
          onSubmit={handleSaveBusinessUnits}
        />
      )}

      {editingOU && (
        <EditOrganizationUnitModal
          organizationUnit={editingOU}
          saving={savingOU}
          error={ouModalError}
          onCancel={() => setEditingOU(null)}
          onSubmit={handleSaveOU}
        />
      )}
    </div>
  );
}