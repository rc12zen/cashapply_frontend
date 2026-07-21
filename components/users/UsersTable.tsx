"use client";
/**
 * components/users/UsersTable.tsx
 * ==================================
 * The user list/table + pagination, extracted from app/users/page.tsx.
 * Role assignment uses RoleMultiSelect since a user can hold multiple
 * roles at once.
 */
import { Loader2 } from "lucide-react";
import RoleMultiSelect, { type RoleOption } from "./RoleMultiSelect";

export interface UserRow {
  id: number;
  email: string;
  display_name: string | null;
  role: string | null;
  roles: string[];
  is_active: boolean;
  last_login_at: string | null;
  status: "active" | "pending" | "disabled";
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  disabled: "bg-gray-200 text-gray-500",
};

function fmtTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function UsersTable({
  users,
  roles,
  busyId,
  isSelf,
  onRolesChange,
  onToggleActive,
}: {
  users: UserRow[];
  roles: RoleOption[];
  busyId: number | null;
  isSelf: (u: UserRow) => boolean;
  onRolesChange: (u: UserRow, roleNames: string[]) => void;
  onToggleActive: (u: UserRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] font-black uppercase tracking-wider text-gray-400 border-b border-gray-100">
            <th className="text-left px-4 py-2">User</th>
            <th className="text-left px-3 py-2">Role(s)</th>
            <th className="text-left px-3 py-2">Status</th>
            <th className="text-left px-3 py-2">Last login</th>
            <th className="text-right px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-2.5">
                <div className="font-bold text-primary">{u.display_name || u.email.split("@")[0]}</div>
                <div className="font-mono text-[10px] text-gray-400">{u.email}</div>
              </td>
              <td className="px-3 py-2.5">
                <RoleMultiSelect
                  roles={roles}
                  selected={u.roles ?? (u.role ? [u.role] : [])}
                  disabled={busyId === u.id}
                  onChange={(roleNames) => onRolesChange(u, roleNames)}
                />
              </td>
              <td className="px-3 py-2.5">
                <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-xs ${STATUS_STYLES[u.status]}`}>
                  {u.status}
                </span>
              </td>
              <td className="px-3 py-2.5 text-gray-500">{fmtTimestamp(u.last_login_at)}</td>
              <td className="px-4 py-2.5 text-right">
                {busyId === u.id ? (
                  <Loader2 size={13} className="animate-spin inline text-gray-400" />
                ) : (
                  <button
                    onClick={() => onToggleActive(u)}
                    disabled={isSelf(u)}
                    title={isSelf(u) ? "You can't deactivate your own account" : undefined}
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-sm cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                      u.is_active
                        ? "text-red-600 hover:bg-red-50"
                        : "text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    {u.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
