"use client";
/**
 * ConfigManagerDialog
 * ===================
 * Lists account configs and lets the user delete an entire account or a single
 * format recipe. Deleting the last recipe removes the account.
 */
import { AlertCircle, Database, Loader2, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { deleteAccount, deleteRecipe, listAccounts } from "@/lib/configBuilderApi";
import { getErrorMessage } from "@/lib/errorMessage";
import type { AccountSummary } from "@/lib/configBuilderTypes";

export default function ConfigManagerDialog({ onClose }: { onClose: () => void }) {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [busy, setBusy]         = useState<string | null>(null);
  const [confirm, setConfirm]   = useState<string | null>(null);   // account_number pending delete

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAccounts();
      setAccounts(res.data.accounts || []);
    } catch {
      setError("Could not load account configs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeAccount = async (acct: string) => {
    setBusy(acct); setError("");
    try { await deleteAccount(acct); setConfirm(null); await load(); }
    catch (e: any) { setError(getErrorMessage(e, "Delete failed.")); }
    finally { setBusy(null); }
  };

  const removeRecipe = async (acct: string, fmt: string) => {
    setBusy(`${acct}:${fmt}`); setError("");
    try { await deleteRecipe(acct, fmt); await load(); }
    catch (e: any) { setError(getErrorMessage(e, "Delete failed.")); }
    finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-xl max-h-[85vh] flex flex-col rounded shadow-xl overflow-hidden">
        <div className="bg-[#1E3A5F] text-white px-5 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Database size={15} className="text-[#4A90E2]" />
            <div className="text-xs font-black uppercase tracking-wider">Manage Account Configs</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 cursor-pointer"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {error && (
            <div className="flex items-center gap-2 text-red-700 text-xs bg-red-50 border border-red-200 px-3 py-2 rounded">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 text-gray-400 py-10">
              <Loader2 size={16} className="animate-spin" /> <span className="text-sm">Loading…</span>
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-10">No account configs yet.</div>
          ) : (
            accounts.map((a) => (
              <div key={a.account_number} className="border border-gray-200 rounded px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-primary truncate">{a.display_name}</div>
                    <div className="text-[10px] font-mono text-gray-400 truncate">
                      {a.account_number}{a.bank ? ` · ${a.bank}` : ""}{a.currency ? ` · ${a.currency}` : ""}
                    </div>
                  </div>
                  {confirm === a.account_number ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-gray-500">Delete account?</span>
                      <button onClick={() => removeAccount(a.account_number)} disabled={busy === a.account_number}
                        className="text-[10px] font-black uppercase bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-sm cursor-pointer disabled:opacity-50">
                        {busy === a.account_number ? <Loader2 size={10} className="animate-spin" /> : "Yes"}
                      </button>
                      <button onClick={() => setConfirm(null)} className="text-[10px] font-black uppercase text-gray-500 hover:text-primary px-2 py-1 cursor-pointer">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirm(a.account_number)} title="Delete account"
                      className="text-gray-400 hover:text-red-500 cursor-pointer shrink-0 p-1"><Trash2 size={13} /></button>
                  )}
                </div>
                {/* format recipes */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {a.formats.map((f) => (
                    <span key={f.format} className="flex items-center gap-1 text-[10px] font-mono bg-gray-100 border border-gray-200 text-gray-600 px-2 py-0.5 rounded-xs">
                      {f.format}
                      <button onClick={() => removeRecipe(a.account_number, f.format)} disabled={busy === `${a.account_number}:${f.format}`}
                        title={`Delete ${f.format} recipe`} className="hover:text-red-500 transition-colors">
                        {busy === `${a.account_number}:${f.format}` ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-200 px-5 py-2.5 shrink-0 text-[10px] text-gray-400">
          Deleting a recipe removes just that file format; deleting the last recipe removes the account.
        </div>
      </div>
    </div>
  );
}