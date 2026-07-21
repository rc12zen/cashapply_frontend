/**
 * components/ui/LoadingSpinner.tsx
 * =================================
 * Reusable loading spinner using the Lucide Loader2 icon.
 * Replaces the repeated inline pattern across every page.
 *
 * Usage:
 *   <LoadingSpinner />
 *   <LoadingSpinner size={20} message="Loading runs..." />
 *   <LoadingSpinner fullPage />
 */
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  /** Icon size in px. Default: 24 */
  size?: number;
  /** Optional text shown below the spinner */
  message?: string;
  /** If true, centres the spinner in the full viewport height */
  fullPage?: boolean;
}

export default function LoadingSpinner({
  size = 24,
  message,
  fullPage = false,
}: LoadingSpinnerProps) {
  const inner = (
    <div className="flex flex-col items-center gap-3">
      <Loader2
        size={size}
        className="animate-spin text-blue-400"
      />
      {message && (
        <p className="text-sm text-slate-400">{message}</p>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        {inner}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-16">
      {inner}
    </div>
  );
}
