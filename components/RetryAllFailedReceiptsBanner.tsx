"use client";
/**
 * components/RetryAllFailedReceiptsBanner.tsx
 * ================================================
 * Shown in the Analysis History run-detail view, offering to bulk-retry
 * Oracle RECEIPT CREATION for that entire run in one click — but ONLY
 * when it would actually be eligible: every receipt in this run currently
 * shows failed. Checks eligibility (a read-only backend call, nothing is
 * retried) as soon as it mounts / runId changes, and renders nothing at
 * all if the run isn't eligible — no button that just refuses most clicks.
 *
 * Deliberately NOT tied to "whichever run just finished on the Home page"
 * — someone typically fixes an OU/Business Unit detail well after they've
 * navigated away from Home, so this needs to work from any past run's
 * detail view, reachable any time by run_id, not a single ephemeral
 * "latest run" slot.
 *
 * The backend (hitl/service.py's check_receipt_retry_eligibility_for_run()
 * / retry_receipt_creation_bulk_for_run()) is the single source of truth
 * for the eligibility rule — this component mirrors what it says rather
 * than re-deriving the rule itself.
 */
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getRetryEligibilityForRun, retryOracleBulkForRun } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorMessage";

export default function RetryAllFailedReceiptsBanner({
  runId,
  canRetry,
}: {
  runId: number;
  canRetry: boolean;
}) {
  const [checking, setChecking] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [result, setResult] = useState<{
    kind: "success" | "rejected" | "error";
    message: string;
  } | null>(null);

  const checkEligibility = async () => {
    setChecking(true);
    try {
      const res = await getRetryEligibilityForRun(runId);
      setEligible(!!res.data?.eligible);
      setFailedCount(res.data?.failed_count ?? 0);
    } catch {
      // A failed eligibility check is treated as "not eligible" -- fail
      // closed (don't show the button) rather than fail open.
      setEligible(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (canRetry) checkEligibility();
    else setChecking(false);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, canRetry]);

  if (!canRetry || checking || !eligible) return null;

  const handleRetry = async () => {
    setRetrying(true);
    setResult(null);
    try {
      const res = await retryOracleBulkForRun(runId);
      if (res.data?.error) {
        setResult({ kind: "rejected", message: res.data.message || "Bulk retry was not eligible for this run." });
      } else {
        const { attempted, succeeded, failed } = res.data;
        setResult({
          kind: failed === 0 ? "success" : "rejected",
          message: `Retried ${attempted} receipt(s): ${succeeded} succeeded, ${failed} still failed.`,
        });
      }
    } catch (e: any) {
      setResult({ kind: "error", message: getErrorMessage(e, "Could not retry receipts for this run.") });
    } finally {
      setRetrying(false);
      // Re-check eligibility after the attempt -- once any receipt in the
      // run succeeds, the run is no longer "all failed", so the button
      // should disappear rather than stay clickable for a now-mixed run.
      checkEligibility();
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-sm shadow-xs px-4 py-3 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-black text-primary uppercase tracking-wider">
          Retry Failed Oracle Receipts
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5">
          All {failedCount} receipt{failedCount === 1 ? "" : "s"} in this run currently failed — e.g.
          after fixing a Business Unit name on the{" "}
          <a href="/bank-accounts" className="underline hover:text-primary">Accounts &amp; OU's</a> page.
        </p>
        {result && (
          <div
            className={`mt-2 flex items-start gap-1.5 text-[11px] font-semibold ${
              result.kind === "success" ? "text-emerald-700" : result.kind === "rejected" ? "text-amber-700" : "text-red-700"
            }`}
          >
            {result.kind === "success" ? (
              <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            )}
            <span>{result.message}</span>
          </div>
        )}
      </div>
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="shrink-0 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider bg-[#222222] hover:bg-black text-white px-3 py-2 rounded-sm cursor-pointer disabled:opacity-50"
      >
        {retrying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        {retrying ? "Retrying…" : `Retry All ${failedCount} Failed`}
      </button>
    </div>
  );
}