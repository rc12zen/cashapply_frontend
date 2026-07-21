/**
 * components/ui/EmptyState.tsx
 * =============================
 * Empty table / empty list placeholder.
 * Replaces the repeated inline empty-state pattern across tabs and pages.
 *
 * Usage:
 *   <EmptyState message="No matched rows found." />
 *   <EmptyState icon={<FileText size={32} />} message="No files uploaded yet." />
 */
import { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  /** Main message shown to the user */
  message: string;
  /** Optional sub-message / hint */
  hint?: string;
  /** Optional custom icon. Defaults to Inbox icon. */
  icon?: ReactNode;
}

export default function EmptyState({ message, hint, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
      <div className="text-slate-400">
        {icon ?? <Inbox size={36} strokeWidth={1.2} />}
      </div>
      <p className="text-sm font-medium text-slate-400">{message}</p>
      {hint && (
        <p className="text-xs text-slate-500 max-w-xs text-center">{hint}</p>
      )}
    </div>
  );
}
