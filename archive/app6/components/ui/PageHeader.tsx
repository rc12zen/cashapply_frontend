/**
 * components/ui/PageHeader.tsx
 * =============================
 * Consistent page title + optional subtitle block used at the top of
 * every route. Replaces the repeated <h1> + <p> pattern across pages.
 *
 * Usage:
 *   <PageHeader title="Dashboard" />
 *   <PageHeader title="Analysis History" subtitle="Review and approve matched rows" />
 *   <PageHeader title="Row Detail" subtitle="Run #42" onBack={() => router.back()} />
 */
import { ArrowLeft } from "lucide-react";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** If provided, renders a back arrow button that calls this function */
  onBack?: () => void;
  /** Optional right-side content (e.g. action buttons) */
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, onBack, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
