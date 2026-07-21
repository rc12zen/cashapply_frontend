"use client";
/**
 * components/bank-accounts/BusinessUnitPicker.tsx
 * ===================================================
 * Primary Business Unit (single select) + Additional Business Units
 * (multi-select checkboxes) picker, used when an Administrator changes
 * which Business Unit(s) a bank account belongs to. Mirrors
 * components/users/RoleMultiSelect.tsx's interaction pattern.
 */
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface BusinessUnitOption {
  ou_number: string;
  ou_name: string;
  functional_currency: string;
}

export function AdditionalBusinessUnitsPicker({
  options,
  selected,
  excludeOuNumber,
  onChange,
  disabled,
}: {
  options: BusinessUnitOption[];
  selected: string[];
  excludeOuNumber?: string; // don't let the primary also be picked as "additional"
  onChange: (ouNumbers: string[]) => void;
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

  const toggle = (ouNumber: string) => {
    onChange(selected.includes(ouNumber) ? selected.filter((n) => n !== ouNumber) : [...selected, ouNumber]);
  };

  const selectable = options.filter((o) => o.ou_number !== excludeOuNumber);
  const selectedLabels = options.filter((o) => selected.includes(o.ou_number)).map((o) => o.ou_name);

  return (
    <div className="relative inline-block text-left w-full" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 bg-white border border-gray-300 rounded-sm text-[11px] font-semibold text-primary px-2.5 py-2 outline-none focus:border-[#222222] cursor-pointer disabled:opacity-50 justify-between"
      >
        <span className="truncate text-left">
          {selectedLabels.length > 0 ? selectedLabels.join(", ") : "None (single Business Unit account)"}
        </span>
        <ChevronDown size={12} className="shrink-0 text-gray-400" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-sm shadow-lg py-1 max-h-56 overflow-y-auto">
          {selectable.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-gray-400">No other Business Units available.</p>
          )}
          {selectable.map((o) => {
            const checked = selected.includes(o.ou_number);
            return (
              <button
                type="button"
                key={o.ou_number}
                onClick={() => toggle(o.ou_number)}
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
                  <span className="block text-[11px] font-bold text-primary">{o.ou_name}</span>
                  <span className="block text-[10px] text-gray-400">
                    OU {o.ou_number} &middot; {o.functional_currency}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
