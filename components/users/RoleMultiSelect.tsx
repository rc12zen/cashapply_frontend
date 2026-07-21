"use client";
/**
 * components/users/RoleMultiSelect.tsx
 * =======================================
 * Checkbox-list dropdown for assigning one or more roles to a user. An
 * Administrator can assign ANY NUMBER of roles at once (see backend
 * scripts/seed_rbac.py / db/models.py's UserRole join table) — this
 * replaces the old single <select> that only ever set one role.
 */
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface RoleOption {
  id: number;
  name: string;
  description?: string | null;
  permissions: string[];
}

export default function RoleMultiSelect({
  roles,
  selected,
  onChange,
  disabled,
}: {
  roles: RoleOption[];
  selected: string[];
  onChange: (roleNames: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((n) => n !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-white border border-gray-300 rounded-sm text-[11px] font-semibold text-primary px-2 py-1 outline-none focus:border-[#222222] cursor-pointer disabled:opacity-50 min-w-[140px] justify-between"
      >
        <span className="truncate">
          {selected.length > 0 ? selected.join(", ") : "No roles"}
        </span>
        <ChevronDown size={12} className="shrink-0 text-gray-400" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-56 bg-white border border-gray-200 rounded-sm shadow-lg py-1">
          {roles.map((r) => {
            const checked = selected.includes(r.name);
            return (
              <button
                type="button"
                key={r.id}
                onClick={() => toggle(r.name)}
                className="w-full flex items-start gap-2 px-3 py-1.5 hover:bg-gray-50 text-left cursor-pointer"
              >
                <span
                  className={`mt-0.5 h-3.5 w-3.5 rounded-xs border shrink-0 flex items-center justify-center ${
                    checked ? "bg-[#222222] border-[#222222]" : "border-gray-300"
                  }`}
                >
                  {checked && <Check size={10} className="text-white" />}
                </span>
                <span>
                  <span className="block text-[11px] font-bold text-primary">{r.name}</span>
                  {r.description && (
                    <span className="block text-[10px] text-gray-400 leading-tight">{r.description}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
