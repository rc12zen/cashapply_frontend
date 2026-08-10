"use client";
/**
 * components/AiStatusBadge.tsx
 * ===============================
 * Shows whether AI extraction (Layer 2B's fallback pass) is actually
 * usable right now -- not just "a key is configured somewhere". Placed
 * near Home's run controls so a SPOC knows, BEFORE starting analysis,
 * whether unresolved rows will get the AI second pass or only regex/
 * pattern matching. See bff/config_routes.py's /ai-status /
 * extraction/ai_providers.py -- the backend does the real check (a
 * lightweight call to the provider), this just renders it.
 *
 * CONTROLLED component: the status is fetched and owned by app/home/page.tsx
 * (which also GATES upload + analyse on `active` -- fail-closed), so the
 * badge and the disabled controls always agree on one source of truth. This
 * component only renders what it's handed and asks the parent to re-check.
 */
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, PowerOff, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";

export interface AiStatus {
  provider: string;
  model: string | null;
  // false = AI extraction is intentionally turned OFF via .env
  // (AI_EXTRACTION_ENABLED=false), a neutral local-dev state, NOT an outage.
  // The gate treats this as "allowed" (upload/analyse proceed regex-only).
  enabled: boolean;
  configured: boolean;
  active: boolean;
  message: string;
  cached: boolean;
}

interface AiStatusBadgeProps {
  status: AiStatus | null;   // null = the status call itself failed (not "inactive")
  loading: boolean;          // initial check in flight
  rechecking: boolean;       // a forced recheck in flight
  onRecheck: () => void;     // parent re-fetches with force=true
}

export default function AiStatusBadge({ status, loading, rechecking, onRecheck }: AiStatusBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
        <Loader2 size={11} className="animate-spin" /> Checking AI…
      </div>
    );
  }

  // The status call itself failed (network/auth/endpoint down). We fail-closed
  // upstream (upload + analyse are disabled), so — unlike before — we must NOT
  // stay silent here, or the user sees dead controls with no explanation. Show
  // an explicit "can't verify" chip with a Recheck.
  if (!status) {
    return (
      <div className="inline-flex flex-col gap-1.5">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1.5 border rounded-full px-2.5 py-1 cursor-pointer bg-gray-100 text-gray-500 border-gray-200"
          title="Couldn't reach the AI status check — upload and analysis are paused until it's confirmed available."
        >
          <HelpCircle size={12} />
          <span className="text-[10px] font-black uppercase tracking-wider">AI Status Unknown</span>
        </button>
        {expanded && (
          <div className="max-w-xs text-[11px] text-gray-500 leading-relaxed bg-white border border-gray-100 rounded-lg px-3 py-2 shadow-sm">
            The AI availability check couldn&rsquo;t be reached. Upload and analysis stay paused until AI is confirmed available.
            <button
              onClick={(e) => { e.stopPropagation(); onRecheck(); }}
              disabled={rechecking}
              className="flex items-center gap-1 mt-2 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-primary cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={10} className={rechecking ? "animate-spin" : ""} />
              {rechecking ? "Checking…" : "Recheck now"}
            </button>
          </div>
        )}
      </div>
    );
  }

  const tone = status.enabled === false
    ? { icon: PowerOff, classes: "bg-slate-100 text-slate-600 border-slate-300", label: "AI Extraction Off" }
    : status.active
    ? { icon: CheckCircle2, classes: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "AI Extraction Active" }
    : status.configured
    ? { icon: AlertTriangle, classes: "bg-amber-50 text-amber-700 border-amber-200", label: "AI Extraction Unavailable" }
    : { icon: XCircle, classes: "bg-gray-100 text-gray-500 border-gray-200", label: "AI Extraction Not Configured" };
  const Icon = tone.icon;

  return (
    <div className="inline-flex flex-col gap-1.5">
      <button
        onClick={() => setExpanded((e) => !e)}
        className={`flex items-center gap-1.5 border rounded-full px-2.5 py-1 cursor-pointer ${tone.classes}`}
        title={status.message}
      >
        <Icon size={12} />
        <span className="text-[10px] font-black uppercase tracking-wider">
          {tone.label}{status.active && status.model ? ` — ${status.provider} ${status.model}` : ""}
        </span>
      </button>

      {expanded && (
        <div className="max-w-xs text-[11px] text-gray-500 leading-relaxed bg-white border border-gray-100 rounded-lg px-3 py-2 shadow-sm">
          {status.message}
          <button
            onClick={(e) => { e.stopPropagation(); onRecheck(); }}
            disabled={rechecking}
            className="flex items-center gap-1 mt-2 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-primary cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={10} className={rechecking ? "animate-spin" : ""} />
            {rechecking ? "Checking…" : "Recheck now"}
          </button>
        </div>
      )}
    </div>
  );
}
