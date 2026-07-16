"use client";
import { Briefcase, ChevronDown, Landmark, User } from "lucide-react";

const PERIODS = ["Last Analysis", "Today", "Yesterday", "WTD", "MTD", "Custom Date"];

interface MetricsFilterBarProps {
  timePeriod: string;
  setTimePeriod: (p: string) => void;
  isCustomDateActive: boolean;
  setIsCustomDateActive: (v: boolean) => void;
  customStartDate: string;
  setCustomStartDate: (v: string) => void;
  customEndDate: string;
  setCustomEndDate: (v: string) => void;
  doFetchMetrics: (period: string, start: string, end: string) => void;
  bankOptions: string[];
  buOptions: string[];
  userOptions: string[];
  selectedBank: string;
  setSelectedBank: (v: string) => void;
  selectedBU: string;
  setSelectedBU: (v: string) => void;
  selectedUser: string;
  setSelectedUser: (v: string) => void;
}

/**
 * Dashboard header filters — time-period pills (+ custom date range) and
 * the Bank / BU / User select dropdowns feeding doFetchMetrics().
 */
export default function MetricsFilterBar({
  timePeriod, setTimePeriod, isCustomDateActive, setIsCustomDateActive,
  customStartDate, setCustomStartDate, customEndDate, setCustomEndDate,
  doFetchMetrics, bankOptions, buOptions, userOptions,
  selectedBank, setSelectedBank, selectedBU, setSelectedBU, selectedUser, setSelectedUser,
}: MetricsFilterBarProps) {
  const selects = [
    {
      icon: <Landmark size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />,
      value: selectedBank, onChange: setSelectedBank, options: bankOptions, defaultLabel: "All Banks",
    },
    {
      icon: <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />,
      value: selectedBU, onChange: setSelectedBU, options: buOptions, defaultLabel: "All BUs",
    },
    {
      icon: <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />,
      value: selectedUser, onChange: setSelectedUser, options: userOptions, defaultLabel: "All Users",
    },
  ];

  return (
    <>
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-xs font-black text-primary uppercase tracking-wider">
            Reconciliation Summary
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Matching results for the period and filters selected below.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start xl:self-auto">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-sm">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setTimePeriod(p);
                  setIsCustomDateActive(p === "Custom Date");
                }}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-xs transition-all cursor-pointer ${timePeriod === p ? "bg-[#222222] text-white shadow-xs" : "text-gray-500 hover:text-primary"}`}
              >
                {p}
              </button>
            ))}
          </div>
          {isCustomDateActive && (
            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomStartDate(v);
                  doFetchMetrics("Custom Date", v, customEndDate);
                }}
                className="bg-gray-50 border border-gray-300 rounded-sm text-[10px] font-bold text-gray-600 px-2 py-1 outline-none focus:border-accent"
              />
              <span className="text-[10px] font-bold text-gray-400">
                TO
              </span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomEndDate(v);
                  doFetchMetrics("Custom Date", customStartDate, v);
                }}
                className="bg-gray-50 border border-gray-300 rounded-sm text-[10px] font-bold text-gray-600 px-2 py-1 outline-none focus:border-accent"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {selects.map(({ icon, value, onChange, options, defaultLabel }) => (
          <div key={defaultLabel} className="relative">
            {icon}
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full bg-white border border-gray-300 text-xs font-bold text-primary pl-9 pr-8 py-2.5 rounded-sm appearance-none focus:outline-none focus:border-accent cursor-pointer"
            >
              <option>{defaultLabel}</option>
              {options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
        ))}
      </div>
    </>
  );
}