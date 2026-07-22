"use client";
/**
 * components/users/RoleMultiSelect.tsx
 * =======================================
 * Checkbox-list dropdown for assigning one or more roles to a user. An
 * Administrator can assign ANY NUMBER of roles at once (see backend
 * scripts/seed_rbac.py / db/models.py's UserRole join table) — this
 * replaces the old single <select> that only ever set one role.
 *
 * OVERFLOW HANDLING:
 *  - The menu is rendered into a document.body PORTAL with position:fixed so
 *    it is NOT clipped by the users table's `overflow-x-auto` scroll
 *    container (an absolutely-positioned child would otherwise be cut off).
 *  - The list is height-capped with internal scroll (max-h) so a long role
 *    list never runs off-screen.
 *  - Opens downward by default, upward when there isn't enough room below.
 *    Position is recomputed on scroll/resize so it stays anchored.
 */
import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface RoleOption {
  id: number;
  name: string;
  description?: string | null;
  permissions: string[];
}

// Max visible menu height (px) before the role list scrolls internally.
const MENU_MAX_HEIGHT = 264;
const GAP = 4; // px gap between trigger and menu

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
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number }>({
    left: 0,
    width: 0,
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const recompute = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    // Open upward only when there genuinely isn't room below AND there's
    // more room above — otherwise keep the natural downward direction.
    const openUp = spaceBelow < MENU_MAX_HEIGHT + GAP && rect.top > spaceBelow;
    setPos({
      left: rect.left,
      width: rect.width,
      top: openUp ? undefined : rect.bottom + GAP,
      bottom: openUp ? window.innerHeight - rect.top + GAP : undefined,
    });
  }, []);

  // Position before paint so the menu never flashes in the wrong spot.
  useLayoutEffect(() => {
    if (open) recompute();
  }, [open, recompute]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    // capture=true so scrolls on ANY ancestor (incl. the table's
    // overflow-x-auto container) keep the menu anchored to the trigger.
    const onScrollOrResize = () => recompute();
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, recompute]);

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((n) => n !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  return (
    <div className="relative inline-block text-left">
      <button
        ref={btnRef}
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

      {open && !disabled && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width: Math.max(pos.width, 224),
              maxHeight: MENU_MAX_HEIGHT,
            }}
            className="z-50 overflow-y-auto bg-white border border-gray-200 rounded-sm shadow-lg py-1"
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
