"use client";
/**
 * components/bank-accounts/SettlementIdentifiersCard.tsx
 * ==========================================================
 * The three lists that drive row identity for credit card / cheque /
 * third-party provider payments (see PRDs: CashApply Edge Case — Credit
 * Card Payments / Cheque Payments, and the broker-payment discussion).
 *
 * Read by bank_statement/settlement_identifier.py at classification time
 * (rule_engine/evaluator.py's R16/R17/R18) — every row's narration/payer
 * name is checked against exactly what's listed here, live, on every run.
 * There is no edit-in-place: retiring a pattern and adding a new one
 * keeps an audit trail of what a pattern used to be (see
 * bff/settlement_identifier_routes.py's delete endpoint docstring).
 *
 * Kept as three short lists, not a generic key/value table — the two
 * narrative types and the provider type have genuinely different shapes
 * (a plain pattern string vs. a provider name + customer roster), and
 * showing that difference plainly beats forcing one flexible-but-vague
 * form.
 */
import { useState } from "react";
import { CreditCard, Mail, Users, Plus, Trash2, Loader2 } from "lucide-react";

export interface SettlementIdentifierRow {
  id: number;
  identifier_type: "card_narrative" | "cheque_narrative" | "third_party_provider";
  pattern: string | null;
  provider_name: string | null;
  sub_customers: string[];
  active: boolean;
}

export interface SettlementIdentifiersGrouped {
  card_narrative: SettlementIdentifierRow[];
  cheque_narrative: SettlementIdentifierRow[];
  third_party_provider: SettlementIdentifierRow[];
}

function IdentifierRow({
  label, sub, canEdit, onDelete, deleting,
}: { label: string; sub?: string; canEdit: boolean; onDelete: () => void; deleting: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2 rounded-sm border border-gray-100 bg-white">
      <div className="min-w-0">
        <div className="font-mono font-bold text-xs text-primary break-all">{label}</div>
        {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
      </div>
      {canEdit && (
        <button
          onClick={onDelete}
          disabled={deleting}
          className="shrink-0 text-gray-400 hover:text-red-500 disabled:opacity-40"
          aria-label="Delete"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      )}
    </div>
  );
}

export default function SettlementIdentifiersCard({
  identifiers,
  canEdit,
  onAddNarrative,
  onAddProvider,
  onDelete,
}: {
  identifiers: SettlementIdentifiersGrouped;
  canEdit: boolean;
  onAddNarrative: (type: "card_narrative" | "cheque_narrative", pattern: string) => Promise<void>;
  onAddProvider: (providerName: string, subCustomers: string[]) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [cardPattern, setCardPattern] = useState("");
  const [chequePattern, setChequePattern] = useState("");
  const [providerName, setProviderName] = useState("");
  const [subCustomers, setSubCustomers] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const submitCard = async () => {
    if (!cardPattern.trim()) return;
    setSaving("card");
    try { await onAddNarrative("card_narrative", cardPattern.trim()); setCardPattern(""); }
    finally { setSaving(null); }
  };
  const submitCheque = async () => {
    if (!chequePattern.trim()) return;
    setSaving("cheque");
    try { await onAddNarrative("cheque_narrative", chequePattern.trim()); setChequePattern(""); }
    finally { setSaving(null); }
  };
  const submitProvider = async () => {
    if (!providerName.trim()) return;
    setSaving("provider");
    try {
      await onAddProvider(
        providerName.trim(),
        subCustomers.split(",").map((c) => c.trim()).filter(Boolean),
      );
      setProviderName(""); setSubCustomers("");
    } finally { setSaving(null); }
  };
  const remove = async (id: number) => {
    setDeletingId(id);
    try { await onDelete(id); } finally { setDeletingId(null); }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Credit card narrative patterns */}
      <div className="border border-gray-200 rounded-sm p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-700">
          <CreditCard size={14} /> Credit Card Narratives
        </div>
        <p className="text-[11px] text-gray-500">
          Bank narration fingerprint(s) that mark a line as a consolidated card settlement (PRD example: reference ending 526221017886).
        </p>
        <div className="space-y-1.5">
          {identifiers.card_narrative.length === 0 && (
            <p className="text-[11px] text-gray-300 italic">None configured yet.</p>
          )}
          {identifiers.card_narrative.map((row) => (
            <IdentifierRow
              key={row.id}
              label={row.pattern || ""}
              canEdit={canEdit}
              onDelete={() => remove(row.id)}
              deleting={deletingId === row.id}
            />
          ))}
        </div>
        {canEdit && (
          <div className="flex gap-1.5 pt-1">
            <input
              value={cardPattern}
              onChange={(e) => setCardPattern(e.target.value)}
              placeholder="e.g. 526221017886"
              className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-sm font-mono"
            />
            <button
              onClick={submitCard}
              disabled={saving === "card"}
              className="px-2 py-1.5 bg-blue-600 text-white rounded-sm disabled:opacity-50"
            >
              {saving === "card" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            </button>
          </div>
        )}
      </div>

      {/* Cheque narrative patterns */}
      <div className="border border-gray-200 rounded-sm p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-teal-700">
          <Mail size={14} /> Cheque Narratives
        </div>
        <p className="text-[11px] text-gray-500">
          Bank narration fingerprint(s) that mark a line as a consolidated cheque deposit (PRD example: "Cash Letter Pre-Encoded Dep CR").
        </p>
        <div className="space-y-1.5">
          {identifiers.cheque_narrative.length === 0 && (
            <p className="text-[11px] text-gray-300 italic">None configured yet.</p>
          )}
          {identifiers.cheque_narrative.map((row) => (
            <IdentifierRow
              key={row.id}
              label={row.pattern || ""}
              canEdit={canEdit}
              onDelete={() => remove(row.id)}
              deleting={deletingId === row.id}
            />
          ))}
        </div>
        {canEdit && (
          <div className="flex gap-1.5 pt-1">
            <input
              value={chequePattern}
              onChange={(e) => setChequePattern(e.target.value)}
              placeholder='e.g. Cash Letter Pre-Encoded Dep CR'
              className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-sm"
            />
            <button
              onClick={submitCheque}
              disabled={saving === "cheque"}
              className="px-2 py-1.5 bg-teal-600 text-white rounded-sm disabled:opacity-50"
            >
              {saving === "cheque" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            </button>
          </div>
        )}
      </div>

      {/* Third-party providers */}
      <div className="border border-gray-200 rounded-sm p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-700">
          <Users size={14} /> Third-Party Providers
        </div>
        <p className="text-[11px] text-gray-500">
          A broker that pays on behalf of its own customers (e.g. Accurant → SITA, Kig, Lament). No receipt is auto-created for these — the row waits for a Payment Distribution entry.
        </p>
        <div className="space-y-1.5">
          {identifiers.third_party_provider.length === 0 && (
            <p className="text-[11px] text-gray-300 italic">None configured yet.</p>
          )}
          {identifiers.third_party_provider.map((row) => (
            <IdentifierRow
              key={row.id}
              label={row.provider_name || ""}
              sub={(row.sub_customers || []).join(", ")}
              canEdit={canEdit}
              onDelete={() => remove(row.id)}
              deleting={deletingId === row.id}
            />
          ))}
        </div>
        {canEdit && (
          <div className="space-y-1.5 pt-1">
            <input
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder="Provider name, e.g. Accurant"
              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-sm"
            />
            <input
              value={subCustomers}
              onChange={(e) => setSubCustomers(e.target.value)}
              placeholder="Customers, comma-separated: SITA, Kig, Lament"
              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-sm"
            />
            <button
              onClick={submitProvider}
              disabled={saving === "provider"}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-purple-600 text-white rounded-sm disabled:opacity-50 text-xs font-bold"
            >
              {saving === "provider" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Add provider
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
