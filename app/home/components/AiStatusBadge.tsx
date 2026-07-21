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
 */
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { getAiStatus } from "@/lib/api";

interface AiStatus {
  provider: string;
  model: string | null;
  configured: boolean;
  active: boolean;
  message: string;
  cached: boolean;
}

export default function AiStatusBadge() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchStatus = async (force: boolean) => {
    force ? setRechecking(true) : setLoading(true);
    try {
      const res = await getAiStatus(force);
      setStatus(res.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
      setRechecking(false);
    }
  };

  useEffect(() => {
    fetchStatus(false);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
        <Loader2 size={11} className="animate-spin" /> Checking AI…
      </div>
    );
  }

  // Fetch itself failed (network/auth) -- don't claim anything either way.
  if (!status) return null;

  const tone = status.active
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
            onClick={(e) => { e.stopPropagation(); fetchStatus(true); }}
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