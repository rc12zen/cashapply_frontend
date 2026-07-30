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
 *
 * Deliberately generic (string in, string out) so it isn't coupled to
 * either call site's state shape — same reasoning as SharedCardPieces.
 */
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

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

  // Click-outside closes the panel without changing the selection.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

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
    <div ref={wrapperRef} className="relative">
      <button
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

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-sm shadow-lg overflow-hidden">
          <div className="relative border-b border-gray-200">
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
          <div className="max-h-56 overflow-y-auto">
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
      )}
    </div>
  );
}