"use client";
/**
 * components/users/OnboardUserModal.tsx
 * ========================================
 * The "Onboard User" modal, extracted from app/users/page.tsx so that file
 * stays focused on the table/list orchestration. Supports assigning
 * multiple roles at once — see RoleMultiSelect.
 */
import { Loader2, Plus, UserPlus, X } from "lucide-react";
import { useState } from "react";
import RoleMultiSelect, { type RoleOption } from "./RoleMultiSelect";

export default function OnboardUserModal({
  roles,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  roles: RoleOption[];
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (data: { email: string; display_name?: string; role_names: string[] }) => void;
}) {
  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [formRoles, setFormRoles] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmail.trim() || formRoles.length === 0) return;
    onSubmit({
      email: formEmail.trim(),
      display_name: formName.trim() || undefined,
      role_names: formRoles,
    });
  };

  const grantedPermissions = Array.from(
    new Set(roles.filter((r) => formRoles.includes(r.name)).flatMap((r) => r.permissions))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onCancel()}>
      <div className="bg-white rounded-sm shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <UserPlus size={14} className="text-[#222222]" />
            <h3 className="text-xs font-black text-primary uppercase tracking-wider">Onboard User</h3>
          </div>
          <button onClick={() => !saving && onCancel()} className="text-gray-400 hover:text-primary cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Email *</label>
            <input
              type="email"
              required
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="user@zensar.com"
              className="w-full bg-white border border-gray-300 rounded-sm text-xs text-primary px-3 py-2 outline-none focus:border-[#222222]"
            />
            <p className="text-[10px] text-gray-400">They sign in with this email (via SSO, or the login screen locally).</p>
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Display name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="(optional)"
              className="w-full bg-white border border-gray-300 rounded-sm text-xs text-primary px-3 py-2 outline-none focus:border-[#222222]"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
              Role(s) * <span className="normal-case font-medium text-gray-400">— select one or more</span>
            </label>
            <RoleMultiSelect roles={roles} selected={formRoles} onChange={setFormRoles} />
            {formRoles.length > 0 && (
              <p className="text-[10px] text-gray-400">
                Grants: {grantedPermissions.join(", ") || "—"}
              </p>
            )}
          </div>
          {error && <div className="text-xs font-bold text-red-700">{error}</div>}
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
              disabled={saving || !formEmail.trim() || formRoles.length === 0}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider bg-[#222222] hover:bg-[#222222] text-white px-4 py-2 rounded-sm cursor-pointer shadow-xs disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              {saving ? "Onboarding…" : "Onboard"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
