"use client";
/**
 * components/row-detail/ActionBar.tsx
 * =======================================
 * Renders whatever GET /api/results/row-detail/{id}'s `available_actions`
 * says is valid for THIS row, for THE SIGNED-IN USER, right now -- see
 * backend hitl/actions_registry.py / db/models.py's ActionDefinition.
 *
 * This component doesn't know or decide "should Approve show up here" --
 * that's already been decided server-side (by row category + permission).
 * It only knows how to RENDER an action and, for actions that need a
 * confirmation, how to ask for one. What actually HAPPENS when an action
 * fires (call an API, open the manual-mapping panel, etc.) is up to the
 * caller via `onAction`.
 *
 * Adding a future action needs NO changes here -- it just needs an icon
 * mapped below (fallback: a generic dot) and a case in the caller's
 * onAction switch.
 */
import {
  CheckCircle2,
  Link2,
  RefreshCw,
  RotateCw,
  XCircle,
  type LucideIcon,
  Circle,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";

export interface AvailableAction {
  code: string;
  label: string;
  icon: string | null;
  confirm_required: boolean;
  is_danger: boolean;
}

const ICON_MAP: Record<string, LucideIcon> = {
  "check-circle": CheckCircle2,
  "x-circle": XCircle,
  "link": Link2,
  "refresh-cw": RefreshCw,
  "rotate-cw": RotateCw,
};

export default function ActionBar({
  actions,
  onAction,
  busyCode,
}: {
  actions: AvailableAction[];
  onAction: (code: string) => void | Promise<void>;
  busyCode?: string | null;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);

  if (actions.length === 0) return null;

  const handleClick = (action: AvailableAction) => {
    if (action.confirm_required && confirming !== action.code) {
      setConfirming(action.code);
      return;
    }
    setConfirming(null);
    onAction(action.code);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => {
        const Icon = (action.icon && ICON_MAP[action.icon]) || Circle;
        const isBusy = busyCode === action.code;
        const isConfirming = confirming === action.code;

        if (isConfirming) {
          return (
            <div key={action.code} className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 rounded-sm px-2 py-1.5">
              <AlertTriangle size={12} className="text-amber-600" />
              <span className="text-[11px] font-bold text-amber-800">Sure?</span>
              <button
                onClick={() => { setConfirming(null); onAction(action.code); }}
                className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-xs cursor-pointer text-white ${
                  action.is_danger ? "bg-red-600 hover:bg-red-700" : "bg-[#222222] hover:bg-black"
                }`}
              >
                Yes, {action.label}
              </button>
              <button
                onClick={() => setConfirming(null)}
                className="text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-primary px-2 py-1 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          );
        }

        return (
          <button
            key={action.code}
            onClick={() => handleClick(action)}
            disabled={isBusy}
            className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-3 py-2 rounded-sm cursor-pointer shadow-xs transition-colors disabled:opacity-50 ${
              action.is_danger
                ? "bg-white border border-red-300 text-red-600 hover:bg-red-50"
                : "bg-[#222222] hover:bg-black text-white"
            }`}
          >
            {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
