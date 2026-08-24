"use client";

/**
 * components/row-detail/SearchableSelect.tsx
 * =====================================================
 * A searchable single-select combobox — drop-in replacement for a plain
 * <select> wherever the option list is sourced from the aging report and
 * can run long (customer names, in particular). A native <select> only
 * supports jumping to the first option starting with the last-typed
 * letter; this adds a real substring search box instead.
 *
 * Used by:
 *   - Row Detail's Customer Name Correction card (customerNameOptions)
 *   - Row Detail's Manual Invoice Mapping card (mappingOptions.customers)
 *   - Row Detail's Payment Distribution card
 *   - Row Detail's Reopen & Review modal
 *   - Bank Accounts' Settlement Identifiers card
 *
 * Deliberately generic (string in, string out) so it isn't coupled to
 * either call site's state shape — same reasoning as SharedCardPieces.
 *
 * OVERFLOW HANDLING
 * -----------------
 * The menu used to be an `absolute` child of this component. That gets
 * CLIPPED, because absolute positioning is contained by the nearest
 * positioned ancestor but clipping is done by ANY ancestor whose overflow
 * isn't visible -- and the row-detail page wraps its cards in
 * `overflow-hidden` + `overflow-y-auto` (see app/analysis-history/row/[id]/
 * page.tsx). On the Manual Invoice Mapping card, which sits low in that
 * scroll container, the customer list was cut off at the bottom and the
 * SPOC had to scroll the page to see the options they were choosing from.
 *
 * So, matching components/users/RoleMultiSelect.tsx (same problem, same
 * solution, so the two behave identically):
 *  - The menu renders into a document.body PORTAL with position:fixed, so
 *    no ancestor's overflow can clip it.
 *  - It opens downward by default and flips upward when there isn't room
 *    below, preferring whichever side has more space.
 *  - Its height is capped to the space actually available on the chosen
 *    side, so it can never run past the viewport edge -- the option list
 *    scrolls internally instead.
 *  - Position is recomputed on scroll/resize (capture phase, so scrolling
 *    ANY ancestor keeps it anchored to the trigger).
 *
 * Why the position lives in a <style> tag rather than style={{...}}:
 * the coordinates are genuinely dynamic (arbitrary pixels from
 * getBoundingClientRect), so they can't become static Tailwind classes,
 * and CSP has no nonce mechanism for the style="" ATTRIBUTE -- only for
 * <style> ELEMENTS. Same approach, and the same nonce, as RoleMultiSelect
 * and FilePreviewPanel. See middleware.ts.
 */
import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import { useNonce } from "@/lib/nonceContext";

// Tallest the whole menu (search box + list) may get, in px.
const MENU_MAX_HEIGHT = 288;
// Never shrink below this, even in a cramped viewport: a 40px-tall menu is
// worse than one that slightly overhangs, and the list scrolls anyway.
const MENU_MIN_HEIGHT = 168;
const GAP = 4;              // px between trigger and menu
const VIEWPORT_MARGIN = 8;  // px of breathing room at the viewport edge
// Narrow triggers (e.g. inside a table cell) would otherwise produce a menu
// too cramped to read customer names in.
const MENU_MIN_WIDTH = 240;

export default function SearchableSelect({
  options, value, onChange, placeholder = "— choose an option —",
  searchPlaceholder = "Search…", disabled = false, autoFocus = false,
  emptyMessage = "No matches.",
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  emptyMessage?: string;
}) {
  const [open, setOpen]                 = useState(false);
  const [query, setQuery]               = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [pos, setPos] = useState<{
    left: number; top?: number; bottom?: number; width: number; maxHeight: number;
  }>({ left: 0, width: 0, maxHeight: MENU_MAX_HEIGHT });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const nonce = useNonce();
  // useId() includes colons (e.g. ":r0:"), invalid in a plain CSS ID
  // selector -- strip to alphanumerics so it's safe to use directly below.
  const menuId = "ss-menu-" + useId().replace(/[^a-zA-Z0-9]/g, "");

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const recompute = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - GAP - VIEWPORT_MARGIN;
    // Flip up only when below genuinely can't hold a usable menu AND above
    // has more room -- otherwise keep the natural downward direction, which
    // is what people expect from a select.
    const openUp = spaceBelow < MENU_MIN_HEIGHT && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    setPos({
      left: rect.left,
      width: rect.width,
      top: openUp ? undefined : rect.bottom + GAP,
      bottom: openUp ? window.innerHeight - rect.top + GAP : undefined,
      // Clamp to what's actually free, so the menu cannot extend past the
      // viewport -- the option list scrolls instead. The MIN floor wins on a
      // very short viewport (see MENU_MIN_HEIGHT).
      maxHeight: Math.max(MENU_MIN_HEIGHT, Math.min(MENU_MAX_HEIGHT, available)),
    });
  }, []);

  // Open immediately when asked (mirrors the old <select autoFocus> on the
  // Customer Name Correction card).
  useEffect(() => {
    if (autoFocus && !disabled) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  // Focus the search box the moment the panel opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlightedIndex(Math.max(0, options.indexOf(value)));
      // Let the panel mount before focusing.
      const t = setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Position BEFORE paint, so the menu never flashes at the wrong spot.
  useLayoutEffect(() => {
    if (open) recompute();
  }, [open, recompute]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      // The menu is portaled to <body>, so it is NOT inside the trigger's
      // subtree -- both refs have to be checked or the first click on an
      // option would close the menu before it registered.
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScrollOrResize = () => recompute();
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("resize", onScrollOrResize);
    // capture=true so scrolling ANY ancestor (the row-detail page's
    // overflow-y-auto container included) keeps the menu on its trigger.
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, recompute]);

  // Keep the keyboard-highlighted option visible: the list scrolls
  // internally now, so arrowing past its edge would otherwise move the
  // selection somewhere the user can't see.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[highlightedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, open]);

  const commit = (option: string) => {
    onChange(option);
    setOpen(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightedIndex]) commit(filtered[highlightedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 bg-white border border-gray-300 rounded-sm text-xs font-semibold px-2.5 py-2 outline-none transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-[#222222]"
        } ${open ? "border-[#222222]" : ""} ${value ? "text-primary" : "text-gray-400"}`}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown size={13} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !disabled && typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Dynamic pixel coordinates -- see the module docstring for why
                these are a nonce'd <style> element and not style={{...}}. */}
            <style nonce={nonce}>{`
              #${menuId} {
                position: fixed;
                left: ${pos.left}px;
                ${pos.top !== undefined ? `top: ${pos.top}px;` : ""}
                ${pos.bottom !== undefined ? `bottom: ${pos.bottom}px;` : ""}
                width: ${Math.max(pos.width, MENU_MIN_WIDTH)}px;
                max-height: ${pos.maxHeight}px;
              }
            `}</style>
            <div
              id={menuId}
              ref={menuRef}
              className="z-50 flex flex-col bg-white border border-gray-300 rounded-sm shadow-lg overflow-hidden"
            >
              <div className="relative border-b border-gray-200 shrink-0">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setHighlightedIndex(0); }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full text-xs font-medium pl-7 pr-7 py-2 outline-none"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 cursor-pointer">
                    <X size={11} />
                  </button>
                )}
              </div>
              {/* min-h-0 is what actually lets this flex child scroll rather
                  than growing the menu past its max-height. */}
              <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-3 py-3 text-[11px] text-gray-400 italic">{emptyMessage}</p>
                ) : (
                  filtered.map((option, i) => (
                    <div
                      key={option}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      onClick={() => commit(option)}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer ${
                        i === highlightedIndex ? "bg-gray-100" : ""
                      } ${option === value ? "font-bold text-[#222222]" : "text-gray-700"}`}
                    >
                      <span className="truncate">{option}</span>
                      {option === value && <Check size={12} className="shrink-0 text-emerald-600" />}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
